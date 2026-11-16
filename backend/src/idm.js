"use strict";

const { AppError } = require("./errors.js");
const { normalizeStaffLogin } = require("./identity-provider.js");

// Через IDM выдаётся только уровень роли (решение владельца 2026-10-08); доступ к локациям
// по-прежнему раздаёт superadmin в приложении. Контракт ручек системы:
// https://docs.yandex-team.ru/idm/owners-guide/api-system/about
const IDM_ROLES = Object.freeze(["user", "admin", "superadmin"]);
const ROLE_RANK = Object.freeze({ user: 1, admin: 2, superadmin: 3 });
// TVM-приложение production IDM: https://docs.yandex-team.ru/idm/owners-guide/api-system/start
const PRODUCTION_IDM_TVM_ID = "2001600";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

class IdmRequestError extends AppError {
  // 4xx с полем fatal: повтор такого запроса из IDM ничего не исправит.
  constructor(message) {
    super(message, 400, "idm_request_invalid");
  }
}

class TvmCheckFailedError extends AppError {
  constructor(message = "Нужен действительный TVM-тикет IDM") {
    super(message, 403, "tvm_check_failed");
  }
}

function tvmUnavailable(message, diagnostic) {
  const error = new AppError(message, 500, "tvm_unavailable");
  // Только для серверного лога; IDM получает общий текст и повторит запрос.
  error.diagnostic = diagnostic;
  return error;
}

function idmRoleTree() {
  return {
    code: 0,
    roles: {
      slug: "role",
      name: { ru: "Роль", en: "Role" },
      values: {
        user: {
          name: { ru: "Пользователь", en: "User" },
          help: {
            ru: "Видит и правит только те локации, которые откроет суперадминистратор",
            en: "Sees and edits only the locations a superadministrator opens"
          }
        },
        admin: {
          name: { ru: "Администратор бюджета", en: "Budget administrator" },
          help: {
            ru: "Правит бюджет, статьи и расходы во всех локациях",
            en: "Edits budgets, items and expenses in all locations"
          }
        },
        superadmin: {
          name: { ru: "Суперадминистратор", en: "Superadministrator" },
          help: {
            ru: "Права администратора бюджета и управление доступом пользователей к локациям",
            en: "Budget administrator rights plus user access to locations"
          }
        }
      }
    }
  };
}

function effectiveRole(roles) {
  let best = null;
  for (const role of roles || []) {
    if (ROLE_RANK[role] && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
}

function byRank(left, right) {
  return ROLE_RANK[left] - ROLE_RANK[right];
}

function jsonField(value, label) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new IdmRequestError(`Некорректный JSON в поле ${label}`);
  }
}

function roleFromPath(path) {
  const match = /^\/role\/([a-z]+)\/$/.exec(String(path || ""));
  return match ? match[1] : null;
}

// Отзыв мягче выдачи: всего, что система не выдаёт (групповые роли, роли на TVM-приложения,
// неизвестные роли и логины), у неё и так нет — это успех с предупреждением, а не ошибка, иначе
// IDM повторял бы remove-role каждый час. Роль берётся прежде всего из path.
function parseIdmRemovalRequest(source) {
  const fired = String(source.fired ?? "") === "1";
  const unsupported = (source.group != null && source.group !== "")
    || (source.subject_type != null && source.subject_type !== "" && source.subject_type !== "user");
  let login = null;
  try {
    login = normalizeStaffLogin(source.login);
  } catch {
    login = null;
  }
  let fromSpec = null;
  try {
    const spec = jsonField(source.role, "role");
    fromSpec = spec && typeof spec === "object" && !Array.isArray(spec) ? spec.role : null;
  } catch {
    fromSpec = null;
  }
  const fromPath = roleFromPath(source.path);
  const role = IDM_ROLES.includes(fromPath) ? fromPath : (IDM_ROLES.includes(fromSpec) ? fromSpec : null);
  return { login: unsupported ? null : login, role: unsupported ? null : role, fired };
}

// Тело add-role/remove-role: по умолчанию x-www-form-urlencoded, где role и fields — JSON-строки;
// в JSON-режиме те же поля приходят объектами. Неизвестные поля IDM может добавить в любой момент,
// поэтому они игнорируются.
function parseIdmRoleRequest(body, { forRemoval = false } = {}) {
  const source = body && typeof body === "object" ? body : {};
  if (forRemoval) return parseIdmRemovalRequest(source);
  if (source.group != null && source.group !== "") {
    throw new IdmRequestError("Групповые роли не поддерживаются: IDM выдаёт системе только персональные роли");
  }
  if (source.subject_type != null && source.subject_type !== "" && source.subject_type !== "user") {
    throw new IdmRequestError("Роли на TVM-приложения не поддерживаются");
  }
  const fields = jsonField(source.fields, "fields");
  if (fields && (typeof fields !== "object" || Object.keys(fields).length)) {
    throw new IdmRequestError("У ролей План Факта нет дополнительных полей");
  }
  let login;
  try {
    login = normalizeStaffLogin(source.login);
  } catch {
    throw new IdmRequestError("Некорректный login");
  }
  const spec = jsonField(source.role, "role");
  if (spec != null && (typeof spec !== "object" || Array.isArray(spec))) {
    throw new IdmRequestError("Поле role должно быть объектом");
  }
  const specKeys = spec ? Object.keys(spec) : [];
  const fromSpec = spec ? spec.role : null;
  const fromPath = roleFromPath(source.path);
  if (fromSpec && fromPath && fromSpec !== fromPath) {
    throw new IdmRequestError("Поля role и path указывают на разные роли");
  }
  const role = fromSpec || fromPath;
  if (!IDM_ROLES.includes(role) || !specKeys.every((key) => key === "role")) {
    throw new IdmRequestError("Неизвестная роль");
  }
  return { login, role, fired: String(source.fired ?? "") === "1" };
}

// Роли, которые приложение реально даёт: у активного сотрудника — его users.role и записи IDM не
// выше неё, у отключённого — никаких. Так IDM видит ровно действующий доступ, даже если users.role
// изменили в обход IDM: сотрудник заведён до включения IDM или режим временно возвращали на app.
function grantedRoles(rows, user) {
  if (!user || Number(user.active) !== 1 || !IDM_ROLES.includes(user.role)) return [];
  const ceiling = ROLE_RANK[user.role];
  const roles = new Set((rows || []).filter((item) => ROLE_RANK[item] && ROLE_RANK[item] <= ceiling));
  roles.add(user.role);
  return [...roles].sort(byRank);
}

function planIdmGrant({ rows, user, role }) {
  const active = Boolean(user) && Number(user.active) === 1;
  const granted = grantedRoles(rows, user);
  return {
    alreadyGranted: granted.includes(role),
    // У отключённого аккаунта прежние записи IDM, доступы к локациям и «просмотр всех» не
    // действуют: повторная выдача начинается с чистого листа.
    replaceRoles: !active && rows.length > 0,
    insertRole: !active || !rows.includes(role),
    effectiveRole: effectiveRole([...granted, role]),
    createUser: !user,
    reactivate: Boolean(user) && !active
  };
}

function planIdmRevoke({ rows, user, role }) {
  const granted = grantedRoles(rows, user);
  // Запись IDM удаляется в любом случае, даже если приложение эту роль уже не даёт.
  const deleteRole = Boolean(role) && rows.includes(role);
  if (!role || !granted.includes(role)) return { wasGranted: false, deleteRole };
  const remaining = granted.filter((item) => item !== role);
  return {
    wasGranted: true,
    deleteRole,
    remainingRoles: remaining,
    effectiveRole: effectiveRole(remaining),
    // Без единой роли сотрудник теряет доступ полностью; права на локации стираются, чтобы
    // повторная выдача роли не вернула старые доступы незаметно.
    deactivate: remaining.length === 0
  };
}

function grantAuditEvent({ userId, staffLogin, role, plan, requestId }) {
  return {
    actorName: "IDM",
    action: "idm.role_granted",
    entityType: "user",
    entityId: userId,
    payload: {
      staffLogin,
      role,
      effectiveRole: plan.effectiveRole,
      createdUser: plan.createUser,
      reactivated: plan.reactivate,
      alreadyGranted: plan.alreadyGranted,
      ...(requestId ? { idmRequestId: requestId } : {})
    }
  };
}

function revokeAuditEvent({ userId, staffLogin, role, fired, plan, requestId }) {
  return {
    actorName: "IDM",
    action: "idm.role_revoked",
    entityType: "user",
    entityId: userId,
    payload: {
      staffLogin,
      role,
      fired,
      effectiveRole: plan.effectiveRole,
      deactivated: plan.deactivate,
      ...(requestId ? { idmRequestId: requestId } : {})
    }
  };
}

// get-roles: все роли, которые реально действуют в приложении. Аккаунты приходят одним снимком из
// хранилища: { staffLogin, role, active, idmRoles }.
function roleAssignments(accounts) {
  const result = [];
  for (const account of accounts || []) {
    if (!account.staffLogin) continue;
    const user = { active: account.active ? 1 : 0, role: account.role };
    for (const role of grantedRoles(account.idmRoles || [], user)) {
      result.push({ login: account.staffLogin, subject_type: "user", path: `/role/${role}/` });
    }
  }
  return result.sort((left, right) => left.login.localeCompare(right.login) || left.path.localeCompare(right.path));
}

class TvmServiceTicketChecker {
  constructor({ toolUrl, authToken, selfAlias, allowedSources, timeoutMs = 2_000, fetchFn = globalThis.fetch }) {
    if (typeof fetchFn !== "function") throw new Error("Проверка TVM требует fetch");
    // API tvmtool: https://docs.yandex-team.ru/tvm/pages/tvmtool/usage/api_spec
    this.checkUrl = new URL("/v2/check", toolUrl);
    this.checkUrl.searchParams.set("self", selfAlias);
    this.checkUrl.searchParams.set("show_roles", "no");
    this.pingUrl = new URL("/ping", toolUrl);
    this.authToken = authToken;
    this.allowedSources = new Set((allowedSources || []).map(String));
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
  }

  async check(ticket) {
    const value = String(ticket || "").trim();
    if (!value || value.length > 8_192 || /[\r\n]/.test(value)) throw new TvmCheckFailedError();
    const { response, body } = await this.request(this.checkUrl, {
      Authorization: this.authToken,
      "X-Ya-Service-Ticket": value
    }, { readJson: true });
    if (response.status === 403) throw new TvmCheckFailedError();
    if (!response.ok) throw tvmUnavailable("tvmtool не проверил тикет", `http_${response.status}`);
    const src = String(body?.service?.src ?? "");
    if (body?.service?.status !== "OK" || !/^\d+$/.test(src)) throw new TvmCheckFailedError();
    // tvmtool проверяет подпись и получателя; отправителя проверяет само приложение.
    if (!this.allowedSources.has(src)) throw new TvmCheckFailedError("TVM-приложение не допущено к ручкам IDM");
    return { src: Number(src) };
  }

  // Таймаут покрывает и заголовки, и чтение тела: зависший tvmtool не держит запрос IDM.
  async request(url, headers, { readJson = false } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response;
      try {
        response = await this.fetchFn(url, { method: "GET", headers, redirect: "manual", signal: controller.signal });
      } catch (error) {
        if (error?.name === "AbortError") throw tvmUnavailable("tvmtool не ответил вовремя", "timeout");
        throw tvmUnavailable("tvmtool недоступен", String(error?.cause?.code || error?.code || error?.name || "network_error").slice(0, 80));
      }
      if (!readJson || response.status !== 200) return { response, body: null };
      try {
        return { response, body: await response.json() };
      } catch (error) {
        if (error?.name === "AbortError") throw tvmUnavailable("tvmtool не ответил вовремя", "timeout");
        throw tvmUnavailable("tvmtool вернул некорректный ответ", "invalid_json");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async selfCheck() {
    try {
      const { response } = await this.request(this.pingUrl, {});
      return { ok: response.status === 200, status: response.status };
    } catch (error) {
      return { ok: false, code: error.diagnostic || error.code || "unknown" };
    }
  }
}

function configError(message, code) {
  return new AppError(message, 500, code);
}

function createIdmIntegration(config, options = {}) {
  if (config.authMode === "corporate-idm") return null;
  const roleSource = config.roleSource || "app";
  if (roleSource === "app") return null;
  if (roleSource !== "idm") throw configError("Некорректный PLAN_FACT_ROLE_SOURCE: допустимо app или idm", "role_source_invalid");
  if (config.production && config.storageDriver !== "postgres") {
    // IDM сверяет роли ежедневно; SQLite в pod теряется при пересоздании, и система в IDM сломается.
    throw configError("Роли из IDM в production хранятся только в PostgreSQL", "idm_requires_postgres");
  }
  if (!config.tvmToolUrl || !config.tvmToolAuthToken || !config.tvmSelfAlias) {
    throw configError(
      "Для ролей из IDM задайте DEPLOY_TVM_TOOL_URL, TVMTOOL_LOCAL_AUTHTOKEN и PLAN_FACT_TVM_SELF_ALIAS",
      "tvm_not_configured"
    );
  }
  let toolUrl;
  try {
    toolUrl = new URL(config.tvmToolUrl);
  } catch {
    throw configError("DEPLOY_TVM_TOOL_URL должен быть URL", "tvm_tool_url_invalid");
  }
  // Локальный токен tvmtool нельзя отправлять за пределы pod.
  if (toolUrl.protocol !== "http:" || !LOOPBACK_HOSTS.has(toolUrl.hostname)) {
    throw configError("DEPLOY_TVM_TOOL_URL должен указывать на локальный tvmtool", "tvm_tool_url_invalid");
  }
  const sources = (config.idmTvmSources || []).map((item) => String(item).trim()).filter(Boolean);
  if (!sources.length || sources.some((item) => !/^\d+$/.test(item))) {
    throw configError("PLAN_FACT_IDM_TVM_SOURCES должен содержать TVM ID через запятую", "idm_tvm_sources_invalid");
  }
  if (config.production && sources.some((item) => item !== PRODUCTION_IDM_TVM_ID)) {
    throw configError(`В production роли принимаются только от production IDM (TVM ${PRODUCTION_IDM_TVM_ID})`, "idm_tvm_sources_invalid");
  }
  return Object.freeze({
    checker: new TvmServiceTicketChecker({
      toolUrl: toolUrl.toString(),
      authToken: config.tvmToolAuthToken,
      selfAlias: config.tvmSelfAlias,
      allowedSources: sources,
      timeoutMs: config.tvmTimeoutMs,
      fetchFn: options.fetchFn
    }),
    tvmSources: Object.freeze(sources)
  });
}

module.exports = {
  IDM_ROLES,
  IdmRequestError,
  PRODUCTION_IDM_TVM_ID,
  TvmCheckFailedError,
  TvmServiceTicketChecker,
  createIdmIntegration,
  effectiveRole,
  grantAuditEvent,
  grantedRoles,
  idmRoleTree,
  parseIdmRoleRequest,
  planIdmGrant,
  planIdmRevoke,
  revokeAuditEvent,
  roleAssignments
};
