"use strict";

const { AppError } = require("./errors.js");
const { CorporateIdentitySessions } = require("./corporate-identity-sessions.js");

const WEBAUTH_ORIGIN = "https://webauth.yandex-team.ru";
const WEBAUTH_CALLBACK_PATH = "/__webauth_save_oauth_token";
const TOKEN_COOKIE = "webauth_oauth_token";
const CSRF_COOKIE = "webauth_csrf_token";

function unavailable() {
  return new AppError("Не удалось проверить доступ. Попробуйте позже", 503, "corporate_identity_unavailable");
}

function cookieValue(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 8192
    && !/[\x00-\x20\x7f;,]/.test(value);
}

function identity(headers) {
  const login = headers.get("x-webauth-login");
  const uid = headers.get("x-webauth-uid");
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(login || "") || !/^[1-9][0-9]{0,31}$/.test(uid || "")) throw unavailable();
  return { login, uid };
}

// The documented assessor flow returns an opaque *session* cookie, with no
// upstream expiry timestamp. Its validity is checked online by check_oauth_token.
// expiresAt below is an application session ceiling, never a claimed token TTL.
class WebAuthCorporateAdapter {
  #publicUrl;
  #fetch;
  #clock;
  #timeoutMs;
  #sessionMaxAgeMs;
  #pendingCredentials = new WeakMap();
  #sessions;
  #status = "unchecked";

  constructor({ publicUrl, sessionMaxAgeMs = 86_400_000, timeoutMs = 5000, fetchFn = globalThis.fetch, clock = Date.now } = {}) {
    const target = new URL(publicUrl);
    if (target.protocol !== "https:" || target.username || target.password || target.port || target.search || target.hash || target.pathname !== "/"
        || typeof fetchFn !== "function" || !Number.isSafeInteger(sessionMaxAgeMs) || sessionMaxAgeMs < 60_000
        || sessionMaxAgeMs > 86_400_000 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw unavailable();
    this.#publicUrl = target.href;
    this.#fetch = fetchFn;
    this.#clock = clock;
    this.#timeoutMs = timeoutMs;
    this.#sessionMaxAgeMs = sessionMaxAgeMs;
    this.#sessions = new CorporateIdentitySessions({
      clock, verifyCredential: async ({ credential, clientIp }) => this.#verify(credential, clientIp)
    });
  }

  diagnostics() { return { status: this.#status === "verified" ? "ready" : "unavailable", code: this.#status }; }

  async #request(path, { cookie, clientIp = "", query } = {}) {
    const url = new URL(path, WEBAUTH_ORIGIN);
    if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const headers = { Accept: "application/json", "Webauth-Retpath": this.#publicUrl };
    if (cookie) headers.Cookie = cookie;
    // Only an already verified transport address may enter this argument.
    // Never copy arbitrary browser proxy headers to WebAuth.
    if (clientIp) {
      if (!require("node:net").isIP(clientIp)) throw unavailable();
      headers["X-Forwarded-For"] = clientIp;
      headers["X-Forwarded-For-Y"] = clientIp;
    }
    try {
      const response = await this.#fetch(url, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(this.#timeoutMs) });
      // Authentication uses headers only. Do not read/log opaque response bodies.
      await response.body?.cancel();
      return response;
    } catch {
      this.#status = "transport_unavailable";
      throw unavailable();
    }
  }

  async begin({ clientIp = "" } = {}) {
    const response = await this.#request("/check_oauth_token", { clientIp });
    const wireState = response.headers.get("webauth-csrf-state");
    const csrf = response.headers.get("webauth-csrf-token");
    const clientId = response.headers.get("webauth-oauth-app-id");
    // A generic gateway 401/403 is not a WebAuth challenge.
    if (response.status !== 401 || !cookieValue(csrf) || !/^[a-zA-Z0-9_-]{1,128}$/.test(clientId || "")
        || typeof wireState !== "string" || wireState.length > 8192 || /[\s&#]/.test(wireState)) {
      this.#status = "challenge_unavailable";
      throw unavailable();
    }
    let state;
    try { state = decodeURIComponent(wireState.replace(/\+/g, " ")); } catch { throw unavailable(); }
    if (state.length < 16 || state.length > 4096 || /[\r\n]/.test(state)) throw unavailable();
    // WebAuth supplies URL-encoded state. Preserve this wire representation;
    // encoding it again would break its HMAC/browser binding on callback.
    const authorizationUrl = `https://oauth.yandex-team.ru/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&state=${wireState}`;
    if (new URL(authorizationUrl).searchParams.get("state") !== state) throw unavailable();
    this.#status = "verified";
    return { authorizationUrl, state, context: { csrf, clientIp } };
  }

  async #verify(credential, clientIp) {
    if (!cookieValue(credential)) throw unavailable();
    const response = await this.#request("/check_oauth_token", { cookie: `${TOKEN_COOKIE}=${credential}`, clientIp });
    if (response.status !== 200) throw unavailable();
    return identity(response.headers);
  }

  async complete({ url, state, context, clientIp = "" }) {
    const verifiedAt = this.#clock();
    if (!context || !cookieValue(context.csrf) || url.searchParams.getAll("token").length !== 1
        || !cookieValue(url.searchParams.get("token")) || url.searchParams.get("state") !== state) throw unavailable();
    const response = await this.#request("/save_oauth_token", {
      cookie: `${CSRF_COOKIE}=${context.csrf}`, clientIp,
      query: { state, token: url.searchParams.get("token") }
    });
    if (response.status !== 302 || response.headers.get("location") !== this.#publicUrl) throw unavailable();
    const issued = (response.headers.getSetCookie?.() || []).filter(value => value.startsWith(`${TOKEN_COOKIE}=`));
    if (issued.length !== 1) throw unavailable();
    const credential = issued[0].split(";", 1)[0].slice(TOKEN_COOKIE.length + 1);
    if (!cookieValue(credential)) throw unavailable();
    const verifiedIdentity = await this.#verify(credential, clientIp);
    const expiresAt = verifiedAt + this.#sessionMaxAgeMs;
    if (this.#clock() < verifiedAt || this.#clock() - verifiedAt > 30_000) throw unavailable();
    const result = Object.freeze({ ...verifiedIdentity, expiresAt });
    this.#pendingCredentials.set(result, { credential, identity: verifiedIdentity, expiresAt, verifiedAt, clientIp });
    return result;
  }

  bindSession(session, result) {
    const pending = this.#pendingCredentials.get(result);
    this.#pendingCredentials.delete(result);
    if (!pending || String(session.user?.staff_uid) !== pending.identity.uid) throw unavailable();
    this.#sessions.bind(session.id, pending);
  }

  verifySession(session, { clientIp = "" } = {}) { return this.#sessions.verify(session.id, { clientIp }); }
  assertVerified(sessionId) { return this.#sessions.assertVerified(sessionId); }
  forget(sessionId) { this.#sessions.forget(sessionId); }
  clear() { this.#sessions.clear(); this.#pendingCredentials = new WeakMap(); }
}

module.exports = { WebAuthCorporateAdapter, WEBAUTH_CALLBACK_PATH };
