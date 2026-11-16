"use strict";

const { AppError } = require("./errors.js");

const ROLE_PATHS = Object.freeze({ "/role/member/": "member", "/role/admin/": "admin" });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function unavailable() {
  return new AppError("Не удалось проверить доступ. Попробуйте позже", 503, "corporate_roles_unavailable");
}

// systemSlug принадлежит доверенному серверному адаптеру: в /v2/roles нет поля
// системы. Связь self -> roles_for_idm_slug проверяется при подключении tvmtool.
// confirmedAt также приходит только из проверенного адаптера свежести upstream.
// HTTP 200, revision и born_date сами по себе его не заменяют.
function validateSnapshot(snapshot, expectedSystem, now, maxFreshnessMs) {
  if (!object(snapshot) || snapshot.systemSlug !== expectedSystem
      || !Number.isFinite(snapshot.confirmedAt) || snapshot.confirmedAt > now
      || now - snapshot.confirmedAt > maxFreshnessMs) throw unavailable();
  const body = snapshot.body;
  if (!object(body) || typeof body.revision !== "string" || !body.revision
      || !Number.isSafeInteger(body.born_date) || body.born_date <= 0
      || !object(body.user) || !object(body.tvm)) throw unavailable();
  const roles = new Map();
  for (const [uid, assignments] of Object.entries(body.user)) {
    if (!/^[1-9][0-9]{0,31}$/.test(uid) || !object(assignments)) throw unavailable();
    let role = null;
    for (const [path, values] of Object.entries(assignments)) {
      if (!Array.isArray(values) || values.some((value) => !object(value))) throw unavailable();
      if (!Object.hasOwn(ROLE_PATHS, path)) continue;
      // У наших конечных узлов нет дополнительных полей. [] не выдаёт роль;
      // повреждённое назначение известного узла закрывает весь снимок атомарно.
      if (values.some((value) => Object.keys(value).length !== 0)) throw unavailable();
      if (values.length && (role !== "admin" || ROLE_PATHS[path] === "admin")) role = ROLE_PATHS[path];
    }
    if (role) roles.set(uid, role);
  }
  return { roles, revision: body.revision, confirmedAt: snapshot.confirmedAt };
}

class CorporateRoles {
  constructor({ systemSlug, source, clock = Date.now, refreshMs = 30_000, maxFreshnessMs = 600_000 }) {
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(systemSlug || "") || typeof source !== "function"
        || !Number.isInteger(refreshMs) || refreshMs < 1 || refreshMs > 30_000
        || !Number.isInteger(maxFreshnessMs) || maxFreshnessMs < 1 || maxFreshnessMs > 600_000) {
      throw new AppError("Некорректная настройка проверки корпоративных ролей");
    }
    this.systemSlug = systemSlug;
    this.source = source;
    this.clock = clock;
    this.refreshMs = refreshMs;
    this.maxFreshnessMs = maxFreshnessMs;
    this.snapshot = null;
    this.lastCheckedAt = null;
    this.lastConfirmedAt = null;
    this.listeners = new Set();
    this.pending = null;
    this.timer = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isFresh() {
    const now = this.clock();
    return Boolean(this.snapshot && now >= this.snapshot.confirmedAt
      && now - this.snapshot.confirmedAt <= this.maxFreshnessMs
      && now >= this.lastCheckedAt && now - this.lastCheckedAt <= this.refreshMs * 2);
  }

  roleFor(uid) {
    if (!this.isFresh()) throw unavailable();
    return this.snapshot.roles.get(String(uid)) || null;
  }

  diagnostics() {
    return {
      status: this.isFresh() ? "verified" : "unavailable",
      lastConfirmedAt: this.lastConfirmedAt == null ? null : new Date(this.lastConfirmedAt).toISOString(),
      refreshMs: this.refreshMs,
      maxFreshnessMs: this.maxFreshnessMs
    };
  }

  async refresh() {
    if (this.pending) return this.pending;
    this.pending = this.fetchAndApply();
    try { return await this.pending; } finally { this.pending = null; }
  }

  async fetchAndApply() {
    let failure = null;
    try {
      const raw = await this.source();
      const next = validateSnapshot(raw, this.systemSlug, this.clock(), this.maxFreshnessMs);
      // Недопустим откат подтверждённого времени, даже при другой revision.
      if (this.lastConfirmedAt != null && next.confirmedAt < this.lastConfirmedAt) throw unavailable();
      this.snapshot = next;
      this.lastCheckedAt = this.clock();
      this.lastConfirmedAt = next.confirmedAt;
    } catch {
      this.snapshot = null;
      this.lastCheckedAt = null;
      failure = unavailable();
    }
    // Каждая выгрузка заменяет полный набор, включая пустой. Сначала меняются
    // права для запросов, затем синхронно ожидается закрытие сессий/realtime.
    for (const listener of this.listeners) await listener({ available: !failure });
    if (failure) throw failure;
    return this.diagnostics();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { this.refresh().catch(() => {}); }, this.refreshMs);
    this.timer.unref?.();
    return this.refresh();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

function createTvmRolesSource({ baseUrl, selfAlias, systemSlug, localToken }, {
  fetch = globalThis.fetch,
  verifyBinding = null,
  verifyFreshness = null,
  timeoutMs = 5_000,
  maxResponseBytes = 2 * 1024 * 1024,
  clock = Date.now
} = {}) {
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
    if (endpoint.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(endpoint.hostname)
        || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
        || endpoint.pathname !== "/") throw new Error();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(selfAlias || "")
        || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(systemSlug || "")
        || typeof localToken !== "string" || !localToken || /[\r\n]/.test(localToken)
        || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000
        || !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 16 * 1024 * 1024) throw new Error();
    endpoint.pathname = "/v2/roles";
    endpoint.searchParams.set("self", selfAlias);
  } catch {
    throw new AppError("Неверно настроено локальное подключение tvmtool");
  }
  return async () => {
    // Документация не определяет свежесть ролей через born_date/revision/ping.
    // До подтверждённого контракта нет допустимого runtime обхода проверки.
    if (typeof verifyBinding !== "function" || typeof verifyFreshness !== "function") throw unavailable();
    try {
      if (await verifyBinding({ selfAlias, systemSlug }) !== true) throw unavailable();
      const response = await fetch(endpoint, {
        method: "GET", headers: { Authorization: localToken, Accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.status !== 200 || !response.body?.getReader) throw unavailable();
      const contentLength = Number(response.headers.get("content-length"));
      if (contentLength > maxResponseBytes) throw unavailable();
      const reader = response.body.getReader();
      let size = 0;
      const parts = [];
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxResponseBytes) { await reader.cancel(); throw unavailable(); }
          parts.push(Buffer.from(chunk.value));
        }
      } finally { reader.releaseLock(); }
      const body = JSON.parse(Buffer.concat(parts).toString("utf8"));
      const confirmedAt = await verifyFreshness({ body, receivedAt: clock() });
      return { body, systemSlug, confirmedAt };
    } catch {
      // Ни текст сетевой ошибки, ни URL/заголовки служебного запроса не выходят
      // в диагностику и журнал приложения.
      throw unavailable();
    }
  };
}

module.exports = { CorporateRoles, createTvmRolesSource, validateSnapshot, unavailable };
