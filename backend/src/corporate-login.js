"use strict";

const crypto = require("node:crypto");
const { AppError } = require("./errors.js");
const { safeEqual } = require("./security.js");

const CORPORATE_AUTH_MODE = "corporate-idm";
const ATTEMPT_COOKIE = "__Host-plan_fact_login_attempt";
const CALLBACK_PATH = "/api/corporate/callback";
const ATTEMPT_TTL_MS = 5 * 60_000;

function unavailable() {
  return new AppError("Не удалось проверить доступ. Попробуйте позже", 503, "access_check_failed");
}

// Это граница подключения штатного WebAuth, а не собственный OAuth-сервер.
// Без явно подключённого адаптера вход закрыт. index.js подключает штатный
// WebAuth; тестовый адаптер передаётся только программно, не env.
class UnconfiguredCorporateAdapter {
  diagnostics() { return { status: "not_configured", code: "webauth_contract_unverified" }; }
  async begin() { throw unavailable(); }
  async complete() { throw unavailable(); }
}

function assertCorporateModeAllowed(config) {
  if (config.authMode !== CORPORATE_AUTH_MODE) {
    if (config.roleSource === "tirole") throw new Error("PLAN_FACT_ROLE_SOURCE=tirole требует PLAN_FACT_AUTH_MODE=corporate-idm");
    return;
  }
  if (config.storageDriver !== "sqlite" || config.production || config.host !== "127.0.0.1") {
    throw new Error("corporate-idm предназначен для стенда SQLite вне production на 127.0.0.1");
  }
  if (config.roleSource !== "tirole" || !config.secureCookies || config.deploymentProfile !== "laptop-mvp") {
    throw new Error("corporate-idm требует tirole, защищённые cookie и PLAN_FACT_DEPLOYMENT_PROFILE=laptop-mvp");
  }
  let origin;
  try { origin = new URL(config.corporatePublicUrl); } catch { throw new Error("Задайте PLAN_FACT_CORPORATE_PUBLIC_URL: HTTPS-адрес туннеля"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.port || /[<>]/.test(config.corporatePublicUrl)) {
    throw new Error("PLAN_FACT_CORPORATE_PUBLIC_URL должен быть HTTPS origin без пути, параметров и учётных данных");
  }
  if (!config.allowedOrigins?.includes(origin.origin) || config.allowedOrigins.some(value => value !== origin.origin)) {
    throw new Error("В corporate-idm PLAN_FACT_ALLOWED_ORIGINS должен совпадать с адресом туннеля");
  }
  if (!/^[a-z][a-z0-9-]{2,79}$/.test(config.idmSystemSlug || "") || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(config.tvmSelfAlias || "")) {
    throw new Error("Задайте PLAN_FACT_IDM_SYSTEM_SLUG и PLAN_FACT_TVM_SELF_ALIAS без placeholders");
  }
  if (!config.idmRequestUrl) throw new Error("Задайте PLAN_FACT_IDM_REQUEST_URL: ссылку на запрос роли в системе IDM");
  {
    let requestUrl;
    try { requestUrl = new URL(config.idmRequestUrl); } catch { throw new Error("Некорректный PLAN_FACT_IDM_REQUEST_URL"); }
    if (requestUrl.origin !== "https://idm.yandex-team.ru" || requestUrl.username || requestUrl.password || requestUrl.hash) throw new Error("PLAN_FACT_IDM_REQUEST_URL должен вести в корпоративный IDM");
  }
}

function attemptCookie(value, clear = false) {
  return `${ATTEMPT_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : ATTEMPT_TTL_MS / 1000}`;
}

function uniqueCookie(header, name) {
  const values = String(header || "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : "";
}

class CorporateLoginFlow {
  #verifiedIdentities = new WeakMap();

  constructor({ publicUrl, adapter = new UnconfiguredCorporateAdapter(), clock = Date.now, maxAttempts = 1000, callbackPath = CALLBACK_PATH }) {
    if (![CALLBACK_PATH, "/__webauth_save_oauth_token"].includes(callbackPath)) throw unavailable();
    this.callbackPath = callbackPath;
    this.callbackUrl = new URL(callbackPath, publicUrl).href;
    this.adapter = adapter;
    this.clock = clock;
    this.maxAttempts = maxAttempts;
    this.attempts = new Map();
  }

  diagnostics() { return this.adapter.diagnostics(); }

  async begin({ clientIp = "" } = {}) {
    const now = this.clock();
    for (const [key, attempt] of this.attempts) if (attempt.expiresAt <= now) this.attempts.delete(key);
    if (this.attempts.size >= this.maxAttempts) throw unavailable();
    // Reserve before asynchronous work: concurrent requests cannot exceed the bound.
    const browserSecret = crypto.randomBytes(32).toString("base64url");
    const key = crypto.createHash("sha256").update(browserSecret).digest("hex");
    this.attempts.set(key, { expiresAt: now + ATTEMPT_TTL_MS, pending: true });
    try {
      const result = await this.adapter.begin({ callbackUrl: this.callbackUrl, clientIp });
      const target = new URL(result.authorizationUrl);
      if (target.origin !== "https://oauth.yandex-team.ru" || target.pathname !== "/authorize" || target.username || target.password || target.hash || typeof result.state !== "string" || result.state.length < 16 || result.state.length > 4096 || target.searchParams.getAll("state").length !== 1 || target.searchParams.get("state") !== result.state) throw unavailable();
      for (const attempt of this.attempts.values()) {
        if (!attempt.pending && safeEqual(attempt.state, result.state)) throw unavailable();
      }
      this.attempts.set(key, { ...result, expiresAt: now + ATTEMPT_TTL_MS });
      return { location: target.href, cookie: attemptCookie(browserSecret) };
    } catch {
      this.attempts.delete(key);
      throw unavailable();
    }
  }

  async complete(requestUrl, cookieHeader, { clientIp = "" } = {}) {
    const secret = uniqueCookie(cookieHeader, ATTEMPT_COOKIE);
    const key = crypto.createHash("sha256").update(secret).digest("hex");
    const attempt = this.attempts.get(key);
    // Consume before any await, including failed/replayed callback.
    this.attempts.delete(key);
    const url = new URL(requestUrl, this.callbackUrl);
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret) || !attempt || attempt.pending || attempt.expiresAt <= this.clock() || url.origin !== new URL(this.callbackUrl).origin || url.pathname !== this.callbackPath || url.href.length > 16384 || url.searchParams.getAll("state").length !== 1 || !safeEqual(url.searchParams.get("state") || "", attempt.state)) throw unavailable();
    try {
      const identity = await this.adapter.complete({ url, state: attempt.state, context: attempt.context, callbackUrl: this.callbackUrl, clientIp });
      if (!identity || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(identity.login || "") || !/^\d{1,128}$/.test(identity.uid || "") || !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= this.clock() || attempt.expiresAt <= this.clock()) throw unavailable();
      const safeIdentity = Object.freeze({ login: identity.login, uid: identity.uid, expiresAt: identity.expiresAt });
      this.#verifiedIdentities.set(safeIdentity, identity);
      return safeIdentity;
    } catch { throw unavailable(); }
  }

  bindSession(session, identity) {
    const original = this.#verifiedIdentities.get(identity);
    this.#verifiedIdentities.delete(identity);
    if (typeof this.adapter.bindSession === "function") {
      if (!original) throw unavailable();
      this.adapter.bindSession(session, original);
    }
  }

  verifySession(session, context) { return this.adapter.verifySession?.(session, context); }
  assertVerified(sessionId) { return this.adapter.assertVerified?.(sessionId); }
  forget(sessionId) { this.adapter.forget?.(sessionId); }
  clear() { this.adapter.clear?.(); this.attempts.clear(); this.#verifiedIdentities = new WeakMap(); }
}

module.exports = { ATTEMPT_COOKIE, CALLBACK_PATH, CORPORATE_AUTH_MODE, CorporateLoginFlow, UnconfiguredCorporateAdapter, assertCorporateModeAllowed, attemptCookie };
