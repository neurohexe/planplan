"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const { AppError, AuthenticationError } = require("./errors.js");

const CORPORATE_COOKIE_NAMES = new Set(["Session_id", "sessionid2", "webauth_oauth_token"]);
const STAFF_LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const ACCESS_CODE_AUTH_MODE = "access-code";

function normalizeIp(value) {
  let ip = String(value || "").trim();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  if (/^::ffff:/i.test(ip) && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  return net.isIP(ip) ? ip : "";
}

// IP пользователя для WebAuth: сессия, начатая вне корпоративной сети, привязана к
// IP, и без него WebAuth считает куки невалидными. X-Forwarded-For-Y ставит
// AWACS-балансер (trafficSource TS_DIRECT перезаписывает присланное клиентом);
// клиентский X-Forwarded-For не используется. Для авторизации в приложении этот
// IP не применяется — только передаётся в WebAuth и пишется в аудит сессии.
function clientIpFromRequest(request) {
  const raw = request?.headers?.["x-forwarded-for-y"];
  const forwarded = String(Array.isArray(raw) ? raw[0] : raw || "").split(",")[0];
  return normalizeIp(forwarded) || normalizeIp(request?.socket?.remoteAddress);
}

function normalizeStaffLogin(value) {
  const login = String(value || "").trim().toLowerCase();
  if (!STAFF_LOGIN_PATTERN.test(login)) {
    throw new AppError("Некорректный Staff login", 400, "staff_login_invalid");
  }
  return login;
}

function corporateCookieHeader(rawHeader) {
  const selected = [];
  for (const part of String(rawHeader || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!CORPORATE_COOKIE_NAMES.has(name) || !value || /[\r\n]/.test(value)) continue;
    selected.push(`${name}=${value}`);
  }
  return selected.join("; ");
}

function identityFromHeaders(headers) {
  let login;
  try {
    login = normalizeStaffLogin(headers.get("x-webauth-login"));
  } catch {
    throw new AppError("WebAuth вернул некорректный Staff login", 502, "webauth_identity_invalid");
  }
  const uid = String(headers.get("x-webauth-uid") || "").trim();
  if (!uid || uid.length > 128 || /[\r\n]/.test(uid)) {
    throw new AppError("WebAuth не вернул корпоративный UID", 502, "webauth_identity_invalid");
  }
  return Object.freeze({ login, uid });
}

class WebAuthIdentityProvider {
  constructor({
    url,
    timeoutMs = 5_000,
    cacheTtlMs = 30_000,
    cacheMaxEntries = 1_000,
    fetchFn = globalThis.fetch
  }) {
    if (typeof fetchFn !== "function") throw new Error("WebAuth требует fetch");
    this.url = new URL(url);
    if (!this.url.searchParams.has("required")) this.url.searchParams.set("required", "cookies");
    this.timeoutMs = timeoutMs;
    this.cacheTtlMs = cacheTtlMs;
    this.cacheMaxEntries = Number.isInteger(cacheMaxEntries) && cacheMaxEntries > 0 ? cacheMaxEntries : 1_000;
    this.fetchFn = fetchFn;
    this.cache = new Map();
  }

  async authenticate(request) {
    const cookie = corporateCookieHeader(request?.headers?.cookie);
    if (!cookie) throw new AuthenticationError("Войдите через корпоративный аккаунт");
    const clientIp = clientIpFromRequest(request);
    // IP входит в ключ кэша: кука, предъявленная с другого адреса, снова проверяется в WebAuth.
    const cacheKey = crypto.createHash("sha256").update(`${clientIp}\n${cookie}`).digest("hex");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.identity;
    if (cached) this.cache.delete(cacheKey);

    const headers = { Accept: "application/json", Cookie: cookie };
    if (clientIp) {
      headers["X-Forwarded-For"] = clientIp;
      headers["X-Forwarded-For-Y"] = clientIp;
    }
    const response = await this.request(headers);

    if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      throw new AuthenticationError("Войдите через корпоративный аккаунт");
    }
    if (!response.ok) {
      throw webauthUnavailable("WebAuth недоступен", `http_${response.status}`);
    }

    const identity = identityFromHeaders(response.headers);
    const now = Date.now();
    if (this.cache.size >= this.cacheMaxEntries) {
      for (const [key, value] of this.cache) {
        if (value.expiresAt <= now) this.cache.delete(key);
      }
    }
    while (this.cache.size >= this.cacheMaxEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(cacheKey, { identity, expiresAt: now + this.cacheTtlMs });
    return identity;
  }

  async request(headers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(this.url, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw webauthUnavailable("WebAuth не ответил вовремя", "timeout");
      }
      throw webauthUnavailable("WebAuth недоступен", transportErrorCode(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  // Проверка связи и TLS до WebAuth без пользовательских кук: ожидаемый ответ — 401/403.
  // Ошибка сертификата (например, SELF_SIGNED_CERT_IN_CHAIN) видна здесь сразу после старта,
  // а не только при первом входе пользователя.
  async selfCheck() {
    try {
      const response = await this.request({ Accept: "application/json" });
      return { ok: response.status < 500, status: response.status };
    } catch (error) {
      return { ok: false, code: error.diagnostic || error.code || "unknown" };
    }
  }
}

function transportErrorCode(error) {
  return String(error?.cause?.code || error?.code || error?.name || "network_error").slice(0, 80);
}

function webauthUnavailable(message, diagnostic) {
  const error = new AppError(message, 503, "webauth_unavailable");
  // Только для серверного лога; клиенту уходит лишь code.
  error.diagnostic = diagnostic;
  return error;
}

class DevelopmentHeaderIdentityProvider {
  async authenticate(request) {
    const rawLogin = request?.headers?.["x-plan-fact-staff-login"];
    const uid = String(request?.headers?.["x-plan-fact-staff-uid"] || "").trim();
    if (!rawLogin || !uid) throw new AuthenticationError("Укажите тестовую корпоративную identity");
    const login = normalizeStaffLogin(rawLogin);
    return Object.freeze({ login, uid });
  }
}

class DevelopmentFixedIdentityProvider {
  constructor({ login, uid }) {
    if (!login || !uid) throw new AppError(
      "Для development-fixed задайте PLAN_FACT_DEVELOPMENT_STAFF_LOGIN и PLAN_FACT_DEVELOPMENT_STAFF_UID",
      500,
      "development_identity_required"
    );
    this.identity = Object.freeze({ login: normalizeStaffLogin(login), uid: String(uid) });
  }

  async authenticate() {
    return this.identity;
  }
}

// Вход по личному коду (POST /api/login): личность берётся из сессии приложения, внешних сервисов
// режим не вызывает. Корпоративной identity здесь нет, поэтому authenticate() всегда отказывает:
// HTTP-сервер в этом режиме его не вызывает.
class AccessCodeIdentityProvider {
  get mode() {
    return ACCESS_CODE_AUTH_MODE;
  }

  async authenticate() {
    throw new AuthenticationError("Войдите по личному коду доступа");
  }
}

// Вход по кодам — только для тестового стенда: вне production и только с SQLite, где лежат коды.
function assertAccessCodeModeAllowed(config) {
  if (config.production) {
    throw new AppError(
      "Вход по личным кодам (PLAN_FACT_AUTH_MODE=access-code) запрещён в production: уберите NODE_ENV=production или выберите другой режим входа",
      500,
      "access_code_mode_production"
    );
  }
  if (config.storageDriver !== "sqlite") {
    throw new AppError(
      "Вход по личным кодам (PLAN_FACT_AUTH_MODE=access-code) работает только с хранилищем SQLite: задайте PLAN_FACT_STORAGE_DRIVER=sqlite",
      500,
      "access_code_mode_storage"
    );
  }
}

// webauth.yandex-team.ru подписан YandexInternalCA, которого нет во встроенном списке
// корневых сертификатов Node: без NODE_EXTRA_CA_CERTS каждый вход превращался бы в 503.
// Node читает эту переменную только при старте процесса, поэтому проверяем её здесь.
function assertWebAuthCaReadable(caFile) {
  if (!caFile) {
    throw new AppError(
      "Для WebAuth в production задайте NODE_EXTRA_CA_CERTS с корневым сертификатом YandexInternalRootCA",
      500,
      "webauth_ca_required"
    );
  }
  try {
    fs.accessSync(caFile, fs.constants.R_OK);
  } catch {
    throw new AppError("Файл из NODE_EXTRA_CA_CERTS недоступен для чтения", 500, "webauth_ca_unreadable");
  }
}

function createIdentityProvider(config, options = {}) {
  if (config.authMode === "corporate-idm") {
    require("./corporate-login.js").assertCorporateModeAllowed(config);
    return { mode: "corporate-idm", async authenticate() { throw new AuthenticationError("Войдите через Staff"); } };
  }
  // Раньше общей проверки production: так причина отказа понятнее.
  if (config.authMode === ACCESS_CODE_AUTH_MODE) {
    assertAccessCodeModeAllowed(config);
    return new AccessCodeIdentityProvider();
  }
  if (config.production && config.authMode !== "webauth") {
    throw new AppError(
      "В production разрешён только PLAN_FACT_AUTH_MODE=webauth",
      500,
      "production_auth_required"
    );
  }
  if (config.authMode === "webauth") {
    if (config.production && new URL(config.webauthUrl).protocol !== "https:") {
      throw new AppError("WebAuth URL в production должен использовать HTTPS", 500, "webauth_url_invalid");
    }
    if (config.production) assertWebAuthCaReadable(config.webauthCaFile);
    return new WebAuthIdentityProvider({
      url: config.webauthUrl,
      timeoutMs: config.webauthTimeoutMs,
      cacheTtlMs: config.webauthCacheTtlMs,
      fetchFn: options.fetchFn
    });
  }
  if (config.authMode === "development-headers" && !config.production) {
    return new DevelopmentHeaderIdentityProvider();
  }
  if (config.authMode === "development-fixed" && !config.production) {
    return new DevelopmentFixedIdentityProvider({
      login: config.developmentStaffLogin,
      uid: config.developmentStaffUid
    });
  }
  throw new AppError("Некорректный PLAN_FACT_AUTH_MODE", 500, "auth_mode_invalid");
}

module.exports = {
  ACCESS_CODE_AUTH_MODE,
  AccessCodeIdentityProvider,
  CORPORATE_COOKIE_NAMES,
  DevelopmentHeaderIdentityProvider,
  DevelopmentFixedIdentityProvider,
  WebAuthIdentityProvider,
  assertAccessCodeModeAllowed,
  clientIpFromRequest,
  corporateCookieHeader,
  createIdentityProvider,
  identityFromHeaders,
  normalizeIp,
  normalizeStaffLogin
};
