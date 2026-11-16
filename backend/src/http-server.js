"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { AppError } = require("./errors.js");
const {
  ACCESS_CODE_AUTH_MODE,
  assertAccessCodeModeAllowed,
  clientIpFromRequest,
  normalizeIp,
  normalizeStaffLogin
} = require("./identity-provider.js");
const { idmRoleTree, parseIdmRoleRequest } = require("./idm.js");
const { CORPORATE_AUTH_MODE, CorporateLoginFlow, assertCorporateModeAllowed, attemptCookie } = require("./corporate-login.js");

const SESSION_COOKIE = "plan_fact_session";
// Стенд с кодами доступа открыт через туннель на общем домене: соседняя страница может поставить cookie на весь
// домен. Cookie с префиксом __Host- браузер принимает только от самого адреса (Secure, Path=/, без Domain).
const HOST_SESSION_COOKIE = `__Host-${SESSION_COOKIE}`;
// Свои имена стенда: сервер слушает только 127.0.0.1. Чужой сайт выдать себя за них не может.
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
// POST /api/login: тело крошечное, логин и код — не длиннее 64 символов (настоящие короче).
const LOGIN_MAX_REQUEST_BYTES = 4 * 1024;
const LOGIN_FIELD_MAX_LENGTH = 64;
const STATIC_CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none"
  };
}

function parseCookies(header) {
  return Object.fromEntries(String(header || "").split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    const value = part.slice(index + 1).trim();
    try {
      return [part.slice(0, index).trim(), decodeURIComponent(value)];
    } catch {
      return [part.slice(0, index).trim(), value];
    }
  }).filter(([key]) => key));
}

// Все значения cookie с этим именем по порядку: в отличие от parseCookies, повтор имени виден.
function cookieValues(header, name) {
  const values = [];
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      values.push(decodeURIComponent(value));
    } catch {
      values.push(value);
    }
  }
  return values;
}

function sessionCookieName(config) {
  return [ACCESS_CODE_AUTH_MODE, CORPORATE_AUTH_MODE].includes(config.authMode) && config.secureCookies ? HOST_SESSION_COOKIE : SESSION_COOKIE;
}

// Имя из заголовка Host без порта, в нижнем регистре; null — если Host не похож на имя или адрес.
function requestHostname(request) {
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/.exec(String(request.headers.host || "").trim().toLowerCase());
  return match ? match[1] : null;
}

function sessionCookie(token, config) {
  const parts = [
    `${sessionCookieName(config)}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict"
  ];
  if (config.secureCookies) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(config) {
  return `${sessionCookie("", config)}; Max-Age=0`;
}

function sendJson(response, status, body, extraHeaders = {}) {
  const raw = JSON.stringify(body);
  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(raw),
    "Cache-Control": "no-store",
    "X-Plan-Fact-API-Version": "1",
    ...extraHeaders
  });
  response.end(raw);
}

function sendBuffer(response, status, body, contentType) {
  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": contentType.startsWith("text/html") ? "no-store" : "public, max-age=300",
  });
  response.end(body);
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers["content-length"] || 0);
    if (declared > maxBytes) {
      reject(new AppError("Запрос слишком большой", 413, "payload_too_large"));
      return;
    }
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new AppError("Запрос слишком большой", 413, "payload_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function requestBody(request, maxBytes) {
  const raw = await readRequestBody(request, maxBytes);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString("utf8")); }
  catch { throw new AppError("Некорректный JSON", 400, "invalid_json"); }
}

// IDM по умолчанию шлёт x-www-form-urlencoded; JSON включается через поддержку IDM.
async function idmRequestBody(request, maxBytes) {
  const raw = await readRequestBody(request, maxBytes);
  if (!raw.length) return {};
  const text = raw.toString("utf8");
  if (String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new AppError("Некорректный JSON", 400, "invalid_json"); }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }
  return Object.fromEntries(new URLSearchParams(text));
}

// Из тела POST /api/login читаются только логин и код. Не строка или длиннее 64 символов — пустое
// значение: такой вход не удастся, но попытка всё равно попадёт в журнал.
function loginField(value) {
  return typeof value === "string" && value.length <= LOGIN_FIELD_MAX_LENGTH ? value : "";
}

function sessionBelongsTo(session, login) {
  try {
    return session.user?.staff_login === normalizeStaffLogin(login);
  } catch {
    return false;
  }
}

class PlanFactHttpServer {
  constructor({ service, config, realtime, identityProvider, idm = null, corporateLogin = null }) {
    this.service = service;
    this.config = config;
    this.realtime = realtime;
    if (!identityProvider || typeof identityProvider.authenticate !== "function") {
      throw new Error("Plan Fact HTTP server requires a corporate identity provider");
    }
    if (config.roleSource === "idm" && typeof idm?.checker?.check !== "function") {
      throw new Error("PLAN_FACT_ROLE_SOURCE=idm requires the IDM TVM checker");
    }
    this.identityProvider = identityProvider;
    this.idm = idm;
    this.accessCodeMode = config.authMode === ACCESS_CODE_AUTH_MODE;
    this.corporateMode = config.authMode === CORPORATE_AUTH_MODE;
    this.sessionOnlyMode = this.accessCodeMode || this.corporateMode;
    if (this.corporateMode) assertCorporateModeAllowed(config);
    this.corporateLogin = this.corporateMode ? corporateLogin || new CorporateLoginFlow({ publicUrl: config.corporatePublicUrl }) : null;
    // Та же проверка, что при запуске: вход по кодам — только вне production и только с SQLite.
    if (this.accessCodeMode) assertAccessCodeModeAllowed(config);
    this.allowedHostnames = new Set(LOOPBACK_HOSTNAMES);
    for (const origin of config.allowedOrigins || []) {
      try {
        this.allowedHostnames.add(new URL(origin).hostname);
      } catch {
        // Не адрес — такой Origin и так ни с чем не совпадёт.
      }
    }
    this.server = http.createServer((request, response) => this.handle(request, response));
  }

  // DNS rebinding: имя чужого сайта вдруг указывает на 127.0.0.1, и его страница шлёт запросы стенду со своим Host.
  // Свой адрес сервер вычисляет из Host, поэтому проверка Origin такие запросы пропустила бы. В режиме access-code
  // стенд отвечает только на свои имена: 127.0.0.1, localhost и адреса из PLAN_FACT_ALLOWED_ORIGINS (туннель).
  hostAllowed(request) {
    if (this.corporateMode) {
      const host = String(request.headers.host || "").toLowerCase();
      return host === new URL(this.config.corporatePublicUrl).host || host === `127.0.0.1:${this.server.address()?.port || this.config.port}`;
    }
    return this.allowedHostnames.has(requestHostname(request));
  }

  // Токен сессии из cookie. В режиме access-code две cookie сессии сразу — признак подброшенной: тогда сессии нет,
  // а не «какая пришла последней».
  sessionToken(request) {
    if (!this.sessionOnlyMode) return parseCookies(request.headers.cookie)[SESSION_COOKIE];
    const values = cookieValues(request.headers.cookie, sessionCookieName(this.config));
    return values.length === 1 ? values[0] : null;
  }

  requestIsFromTrustedProxy(request) {
    const trusted = this.config.trustedProxyIps || [];
    if (!trusted.length) return false;
    const remote = String(request.socket.remoteAddress || "");
    const normalized = remote.startsWith("::ffff:") ? remote.slice(7) : remote;
    return trusted.includes(normalized);
  }

  // IP для журнала входа по коду. X-Forwarded-For-Y ставит балансер дата-центра, а на стенде его может прислать кто
  // угодно: заголовку верим только от доверенного прокси (PLAN_FACT_TRUSTED_PROXY_IPS), иначе — адрес соединения.
  accessCodeClientIp(request) {
    return this.requestIsFromTrustedProxy(request)
      ? clientIpFromRequest(request)
      : normalizeIp(request.socket.remoteAddress);
  }

  originAllowed(request) {
    const origin = request.headers.origin;
    if (this.corporateMode) return origin === new URL(this.config.corporatePublicUrl).origin;
    // Вне production POST без Origin пропускается для локальной разработки — но не в режиме
    // access-code: этот стенд открыт коллегам через туннель.
    if (!origin) return !this.config.production && !this.accessCodeMode;
    // X-Forwarded-Proto is attacker-controlled unless it arrived through a hop we
    // configured as trusted (PLAN_FACT_TRUSTED_PROXY_IPS) — otherwise same-origin
    // would be trivially spoofable by anyone who can reach the backend directly.
    const forwardedProtocol = this.requestIsFromTrustedProxy(request)
      ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim()
      : "";
    const protocol = forwardedProtocol || (request.socket.encrypted ? "https" : "http");
    const sameOrigin = request.headers.host ? `${protocol}://${request.headers.host}` : null;
    return origin === sameOrigin || this.config.allowedOrigins.includes(origin);
  }

  applyCors(request, response) {
    const origin = request.headers.origin;
    if (origin && this.originAllowed(request)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
    }
  }

  buildMetadata() {
    return {
      apiVersion: 1,
      backendVersion: this.config.backendVersion || "0.1.0",
      buildCommit: this.config.buildCommit || "unknown",
      imageDigest: this.config.imageDigest || "unknown"
    };
  }

  async session(request, { touch = true } = {}) {
    if (this.sessionOnlyMode) {
      // Вход по коду: достаточно действующей сессии приложения, корпоративной identity нет.
      const token = this.sessionToken(request);
      const session = await this.service.sessionByToken(token, { touch: this.corporateMode ? false : touch });
      if (!this.corporateMode || !session) return session;
      try {
        await this.corporateLogin.verifySession(session, { clientIp: this.accessCodeClientIp(request) });
        // The database/role state may change while WebAuth is being checked.
        const live = await this.service.sessionByToken(token, { touch });
        if (!live || live.id !== session.id) return null;
        return live;
      } catch (error) {
        await this.service.logout(session, { reason: "corporate_identity_unavailable" });
        throw error;
      }
    }
    const identity = await this.identityProvider.authenticate(request);
    const token = this.sessionToken(request);
    const session = await this.service.sessionByToken(token, { touch: false });
    if (!session) return null;
    // Сначала сверяем сотрудника, и только потом продлеваем: чужая сессия не должна жить дольше.
    this.service.assertStaffIdentity(session, identity);
    return touch ? this.service.touchSession(session) : session;
  }

  async authenticate(request, response) {
    if (this.sessionOnlyMode) {
      // Сессию в этом режиме создаёт только POST /api/login: здесь — действующая сессия или null.
      return { session: await this.session(request), token: null };
    }
    const identity = await this.identityProvider.authenticate(request);
    const token = this.sessionToken(request);
    const existing = await this.service.sessionByToken(token, { touch: false });
    if (existing && this.service.sessionMatchesIdentity(existing, identity)) {
      return { session: await this.service.touchSession(existing), token: null };
    }
    if (existing) {
      // В этом браузере теперь вошёл другой сотрудник: прежняя сессия приложения ему не
      // принадлежит. Закрываем её и чистим cookie даже если новый вход завершится отказом.
      await this.service.logout(existing, { reason: "staff_identity_changed" });
      response.setHeader("Set-Cookie", clearSessionCookie(this.config));
    }
    return this.service.loginWithStaff({
      identity,
      ip: clientIpFromRequest(request),
      userAgent: request.headers["user-agent"]
    });
  }

  async accessCodeAuthSummary(session) {
    return { ...await this.service.authSummary(session), authMode: ACCESS_CODE_AUTH_MODE };
  }

  // POST /api/login в режиме access-code. Тело запроса нигде не логируется; любая неудача —
  // один и тот же 401 из service.loginWithAccessCode.
  async loginWithAccessCode(request, response) {
    const body = await requestBody(request, Math.min(this.config.maxRequestBytes, LOGIN_MAX_REQUEST_BYTES));
    const login = loginField(body?.login);
    const code = loginField(body?.code);
    const token = this.sessionToken(request);
    const existing = await this.service.sessionByToken(token, { touch: false });
    if (existing && !sessionBelongsTo(existing, login)) {
      // В этом браузере входит другой пользователь: прежняя сессия ему не принадлежит. Закрываем её
      // и чистим cookie даже если новый вход завершится отказом — как authenticate() для Staff.
      await this.service.logout(existing, { reason: "access_code_user_changed" });
      response.setHeader("Set-Cookie", clearSessionCookie(this.config));
    }
    const result = await this.service.loginWithAccessCode({
      login,
      code,
      ip: this.accessCodeClientIp(request),
      userAgent: request.headers["user-agent"]
    });
    sendJson(response, 200, await this.accessCodeAuthSummary(result.session), {
      "Set-Cookie": sessionCookie(result.token, this.config)
    });
  }

  // Ручки системы для IDM: https://docs.yandex-team.ru/idm/owners-guide/api-system/about.
  // Вызывает сервер IDM без cookies и Origin, поэтому вместо них — обязательный TVM-тикет.
  async handleIdm(request, response, url) {
    try {
      if (this.corporateMode) throw new AppError("Доступ управляется только в IDM через Tirole", 403, "idm_push_disabled");
      if (!this.idm) throw new AppError("Интеграция с IDM выключена", 404, "idm_disabled");
      await this.idm.checker.check(request.headers["x-ya-service-ticket"]);
      const route = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
      const requestId = String(request.headers["x-idm-request-id"] || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) || null;
      if (request.method === "GET" && route === "/idm/info/") {
        sendJson(response, 200, idmRoleTree());
        return;
      }
      if (request.method === "GET" && route === "/idm/get-roles/") {
        sendJson(response, 200, { code: 0, roles: await this.service.listIdmRoles() });
        return;
      }
      if (request.method === "POST" && route === "/idm/add-role/") {
        const roleRequest = parseIdmRoleRequest(await idmRequestBody(request, this.config.maxRequestBytes));
        const result = await this.service.idmAddRole(roleRequest, { requestId });
        sendJson(response, 200, result.alreadyGranted
          ? { code: 0, warning: "У сотрудника уже есть такая роль" }
          : { code: 0 });
        return;
      }
      if (request.method === "POST" && route === "/idm/remove-role/") {
        const roleRequest = parseIdmRoleRequest(
          await idmRequestBody(request, this.config.maxRequestBytes),
          { forRemoval: true }
        );
        const result = await this.service.idmRemoveRole(roleRequest, { requestId });
        sendJson(response, 200, result.wasGranted
          ? { code: 0 }
          : { code: 0, warning: "У сотрудника уже нет такой роли" });
        return;
      }
      throw new AppError("Ручка IDM не найдена", 404, "not_found");
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status === 403) {
        sendJson(response, 403, { code: 403, error: error.message });
        return;
      }
      if (status >= 500) {
        console.error("Plan Fact IDM request failed", {
          code: error?.code || "internal_error",
          message: String(error?.message || "Internal error").slice(0, 500),
          ...(error?.diagnostic ? { diagnostic: String(error.diagnostic).slice(0, 80) } : {})
        });
        // IDM повторит запрос: для remove-role — каждый час, для add-role — до трёх раз.
        sendJson(response, 500, { code: 500, error: "Внутренняя ошибка сервера" });
        return;
      }
      // Некорректный запрос: повтор ничего не исправит.
      sendJson(response, status, { code: status, fatal: error.message });
    }
  }

  async handle(request, response) {
    if (this.sessionOnlyMode && !this.hostAllowed(request)) {
      sendJson(response, 403, { error: "Адрес стенда не разрешён", code: "host_forbidden" });
      return;
    }
    this.applyCors(request, response);
    try {
      const url = new URL(request.url, "http://localhost");
      if (this.corporateMode && request.method === "GET" && url.pathname === "/api/corporate/login") {
        // The configured origin is authoritative, never Host or forwarded headers.
        let result;
        try { result = await this.corporateLogin.begin({ clientIp: this.accessCodeClientIp(request) }); }
        catch (error) {
          await this.service.auditCorporateLoginFailure?.("login_unavailable");
          throw error;
        }
        const previous = await this.service.sessionByToken(this.sessionToken(request), { touch: false });
        if (previous) await this.service.logout(previous, { reason: "corporate_login_started" });
        response.writeHead(303, { ...securityHeaders(), "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", Location: result.location, "Set-Cookie": result.cookie });
        response.end();
        return;
      }
      if (this.corporateMode && request.method === "GET" && url.pathname === this.corporateLogin.callbackPath) {
        await this.finishCorporateLogin(request, response);
        return;
      }
      if (url.pathname === "/idm" || url.pathname.startsWith("/idm/")) {
        await this.handleIdm(request, response, url);
        return;
      }
      if (request.method === "OPTIONS") {
        if (!this.originAllowed(request)) throw new AppError("Origin запрещён", 403, "origin_forbidden");
        response.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Plan-Fact-Mutation-Id",
          "Access-Control-Max-Age": "600"
        });
        response.end();
        return;
      }
      if (request.method === "POST" && !this.originAllowed(request)) {
        throw new AppError("Origin запрещён", 403, "origin_forbidden");
      }
      if (request.method === "POST" && !String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        throw new AppError("Требуется Content-Type: application/json", 415, "unsupported_media_type");
      }

      if (request.method === "GET" && ["/health", "/api/health"].includes(url.pathname)) {
        sendJson(response, 200, { status: "ok", ...this.buildMetadata() });
        return;
      }
      if (request.method === "GET" && ["/ready", "/api/ready"].includes(url.pathname)) {
        try {
          if (this.corporateMode && this.corporateLogin.diagnostics().status !== "ready") throw new Error("Corporate login is not configured");
          const readiness = await this.service.readiness();
          if (readiness.status !== "ready") throw new Error("Dependencies not ready");
          sendJson(response, 200, {
            ...readiness,
            ...this.buildMetadata()
          });
        } catch {
          sendJson(response, 503, { status: "not_ready", ...this.buildMetadata(), ...(this.corporateMode ? this.corporateDiagnostics() : {}) });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/auth") {
        const result = await this.authenticate(request, response);
        if (this.corporateMode) {
          sendJson(response, result.session ? 200 : 401, {
            ...(result.session ? await this.service.authSummary(result.session) : { code: "login_required" }),
            ...this.corporateAuthSettings()
          });
          return;
        }
        if (this.accessCodeMode) {
          // Без сессии — 401 и режим входа: интерфейс покажет форму кода. Никаких редиректов.
          if (!result.session) sendJson(response, 401, { code: "login_required", authMode: ACCESS_CODE_AUTH_MODE });
          else sendJson(response, 200, await this.accessCodeAuthSummary(result.session));
          return;
        }
        const headers = result.token ? { "Set-Cookie": sessionCookie(result.token, this.config) } : {};
        sendJson(response, 200, await this.service.authSummary(result.session), headers);
        return;
      }
      if (this.accessCodeMode && request.method === "POST" && url.pathname === "/api/login") {
        await this.loginWithAccessCode(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        // Выход не требует действующего корпоративного входа: закрывается только сессия,
        // токен которой предъявлен (POST уже прошёл проверку Origin, cookie SameSite=Strict).
        const token = this.sessionToken(request);
        await this.service.logout(await this.service.sessionByToken(token, { touch: false }));
        sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(this.config) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        sendJson(response, 200, await this.service.stateFor(await this.session(request)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mutate") {
        const body = await requestBody(request, this.config.maxRequestBytes);
        body.mutationId ||= request.headers["x-plan-fact-mutation-id"];
        sendJson(response, 200, await this.service.mutate(await this.session(request), body));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/users") {
        sendJson(response, 200, { users: await this.service.listManagedUsers(await this.session(request)) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/locks/acquire") {
        const body = await requestBody(request, this.config.maxRequestBytes);
        sendJson(response, 200, await this.service.acquireLock(await this.session(request), body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/locks/heartbeat") {
        const body = await requestBody(request, this.config.maxRequestBytes);
        sendJson(response, 200, await this.service.heartbeatLock(await this.session(request), body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/locks/release") {
        const body = await requestBody(request, this.config.maxRequestBytes);
        sendJson(response, 200, await this.service.releaseLock(await this.session(request), body));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/tracker/sync") {
        const body = await requestBody(request, this.config.maxRequestBytes);
        sendJson(response, 202, await this.service.requestTrackerSync(await this.session(request), body));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/audit") {
        sendJson(response, 200, { events: await this.service.listAudit(await this.session(request), {
          actorId: url.searchParams.get("actorId"),
          before: url.searchParams.get("before"),
          limit: url.searchParams.get("limit")
        }) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        const session = await this.service.requireSession(await this.session(request));
        const assertActive = this.corporateMode
          ? () => this.service.corporateSessionUser(session, { locations: [] }) : null;
        assertActive?.();
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no"
        });
        // В режиме access-code сессию закрывают и другие процессы (команда issue-access-code), и отключение
        // пользователя: поток сам проверяет её с каждым сигналом «соединение живо» и закрывается, если её нет.
        const token = this.sessionToken(request);
        const isActive = this.sessionOnlyMode
          ? async () => {
            const live = this.corporateMode ? await this.session(request, { touch: false })
              : await this.service.sessionByToken(token, { touch: false });
            if (!live || live.id !== session.id) return false;
            assertActive?.();
            return true;
          }
          : null;
        const unsubscribe = this.realtime.subscribe(session.id, response, { isActive, assertActive });
        request.on("close", unsubscribe);
        return;
      }
      if (request.method === "GET" && this.config.staticDir && !url.pathname.startsWith("/api/")) {
        if (url.pathname === "/runtime-config.js") {
          const runtime = Buffer.from('globalThis.PLAN_FACT_RUNTIME = Object.freeze({ mode: "server" });\n');
          sendBuffer(response, 200, runtime, STATIC_CONTENT_TYPES[".js"]);
          return;
        }
        let relative;
        try {
          relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
        } catch {
          throw new AppError("Некорректный URL", 400, "invalid_url");
        }
        const root = path.resolve(this.config.staticDir);
        const filePath = path.resolve(root, relative);
        if (filePath !== root && filePath.startsWith(`${root}${path.sep}`)) {
          try {
            const stat = await fs.promises.stat(filePath);
            if (stat.isFile()) {
              const body = await fs.promises.readFile(filePath);
              sendBuffer(response, 200, body, STATIC_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
              return;
            }
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      }
      sendJson(response, 404, { error: "Endpoint не найден", code: "not_found" });
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500 && !this.corporateMode) {
        console.error("Plan Fact request failed", {
          code: error?.code || "internal_error",
          message: String(error?.message || "Internal error").slice(0, 500),
          ...(error?.diagnostic ? { diagnostic: String(error.diagnostic).slice(0, 80) } : {})
        });
      }
      const details = error.details && typeof error.details === "object" ? error.details : {};
      if (!response.headersSent) {
        sendJson(response, status, {
          error: this.corporateMode && status >= 500 ? "Не удалось проверить доступ. Попробуйте позже" : status >= 500 ? "Внутренняя ошибка сервера" : error.message,
          code: error.code || "internal_error",
          ...details,
          ...(this.corporateMode ? this.corporateAuthSettings() : {})
        });
      } else {
        response.end();
      }
    }
  }

  corporateAuthSettings() {
    return { authMode: CORPORATE_AUTH_MODE, roleSource: "tirole", loginUrl: "/api/corporate/login", idmRequestUrl: this.config.idmRequestUrl || null };
  }

  corporateDiagnostics() {
    const diagnostics = this.service.roles?.diagnostics?.() || {};
    return { authMode: CORPORATE_AUTH_MODE, loginStatus: this.corporateLogin.diagnostics().status,
      rolesStatus: diagnostics.status || "unverified", lastConfirmedAt: diagnostics.lastConfirmedAt || null };
  }

  async finishCorporateLogin(request, response) {
    let location = "/";
    const cookies = [attemptCookie("", true), clearSessionCookie(this.config)];
    try {
      const identity = await this.corporateLogin.complete(request.url, request.headers.cookie, { clientIp: this.accessCodeClientIp(request) });
      const result = await this.service.loginWithStaff({ identity, ip: this.accessCodeClientIp(request), userAgent: request.headers["user-agent"] });
      cookies[1] = sessionCookie(result.token, this.config);
    } catch (error) {
      const denied = error.statusCode === 403;
      location = `/?login_error=${denied ? "no_access" : "access_check_failed"}`;
      // No URL, state, token or upstream exception is logged or returned.
      if (typeof this.service.auditCorporateLoginFailure === "function") await this.service.auditCorporateLoginFailure(denied ? "no_access" : "access_check_failed");
    }
    response.writeHead(303, { ...securityHeaders(), "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", Location: location, "Set-Cookie": cookies });
    response.end();
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off("error", reject);
        resolve(this.server.address());
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.corporateLogin?.clear();
      this.realtime.close();
      if (!this.server.listening) { resolve(); return; }
      this.server.close((error) => error ? reject(error) : resolve());
    });
  }
}

module.exports = {
  PlanFactHttpServer,
  SESSION_COOKIE,
  clearSessionCookie,
  parseCookies,
  requestBody,
  securityHeaders,
  sendBuffer,
  sendJson,
  sessionCookie
};
