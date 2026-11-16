"use strict";

const { AppError } = require("./errors.js");

function unavailable() {
  return new AppError("Не удалось проверить доступ. Попробуйте позже", 503, "corporate_identity_unavailable");
}

function validIdentity(identity) {
  return identity && typeof identity.login === "string" && typeof identity.uid === "string"
    && /^[a-z0-9][a-z0-9._-]{1,63}$/.test(identity.login)
    && /^[1-9][0-9]{0,31}$/.test(identity.uid);
}

function checkedIp(value) {
  const ip = value == null ? "" : value;
  if (typeof ip !== "string" || ip.length > 128 || /[\r\n]/.test(ip)) throw unavailable();
  return ip;
}

// Credentials are deliberately private and ephemeral. SQLite only stores the
// application session; restarting this component requires a fresh corporate login.
class CorporateIdentitySessions {
  #verifyCredential;
  #clock;
  #maxAgeMs;
  #maxSessions;
  #entries = new Map();
  #lastNow = null;

  constructor({ verifyCredential, clock = Date.now, maxAgeMs = 30_000, maxSessions = 1000 } = {}) {
    if (typeof verifyCredential !== "function" || typeof clock !== "function"
        || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 30_000
        || !Number.isSafeInteger(maxSessions) || maxSessions < 1) throw unavailable();
    this.#verifyCredential = verifyCredential;
    this.#clock = clock;
    this.#maxAgeMs = maxAgeMs;
    this.#maxSessions = maxSessions;
  }

  #now() {
    let now;
    try { now = this.#clock(); } catch { this.clear(); throw unavailable(); }
    if (!Number.isSafeInteger(now) || now < 0 || (this.#lastNow != null && now < this.#lastNow)) {
      this.clear();
      if (Number.isSafeInteger(now) && now >= 0) this.#lastNow = now;
      throw unavailable();
    }
    this.#lastNow = now;
    return now;
  }

  bind(sessionId, { credential, identity, expiresAt, clientIp, verifiedAt } = {}) {
    // A failed replacement must never retain the previous credential.
    this.forget(sessionId);
    try {
      const now = this.#now();
      const ip = checkedIp(clientIp);
      const confirmedAt = verifiedAt === undefined ? now : verifiedAt;
      if (typeof sessionId !== "string" || !sessionId || sessionId.length > 256
          || credential == null || credential === "" || !validIdentity(identity)
          || !Number.isSafeInteger(expiresAt) || expiresAt <= now
          || !Number.isSafeInteger(confirmedAt) || confirmedAt < 0 || confirmedAt > now
          || now - confirmedAt > this.#maxAgeMs) throw unavailable();
      for (const [id, entry] of this.#entries) {
        if (entry.expiresAt <= now) this.#entries.delete(id);
      }
      if (this.#entries.size >= this.#maxSessions) throw unavailable();
      const verifiedIdentity = Object.freeze({ login: identity.login, uid: identity.uid });
      this.#entries.set(sessionId, {
        credential, identity: verifiedIdentity, expiresAt, clientIp: ip,
        confirmedAt, pending: null
      });
      return verifiedIdentity;
    } catch { throw unavailable(); }
  }

  assertVerified(sessionId) {
    const now = this.#now();
    const entry = this.#entries.get(sessionId);
    if (!entry) throw unavailable();
    if (entry.expiresAt <= now) {
      this.forget(sessionId);
      throw unavailable();
    }
    // An expired local lease can be renewed by verify(), using the retained
    // credential. It is never sufficient for a synchronous protected action.
    if (entry.confirmedAt == null || now - entry.confirmedAt > this.#maxAgeMs) throw unavailable();
    return entry.identity;
  }

  async verify(sessionId, { clientIp } = {}) {
    let entry;
    try {
      const now = this.#now();
      entry = this.#entries.get(sessionId);
      if (!entry) throw unavailable();
      const ip = checkedIp(clientIp);
      if (entry.expiresAt <= now) throw unavailable();
      if (entry.pending) {
        // Only identical IP-bound requests can share an upstream verification.
        // Concurrent changes of IP cannot race to install conflicting leases.
        if (entry.pending.clientIp !== ip) throw unavailable();
        return await entry.pending.promise;
      }
      if (entry.clientIp === ip && entry.confirmedAt != null
          && now - entry.confirmedAt <= this.#maxAgeMs) return entry.identity;

      const startedAt = now;
      const operation = { clientIp: ip, promise: null };
      entry.confirmedAt = null;
      entry.pending = operation;
      operation.promise = (async () => {
        try {
          const identity = await this.#verifyCredential({ credential: entry.credential, clientIp: ip });
          const completedAt = this.#now();
          if (this.#entries.get(sessionId) !== entry || entry.pending !== operation
              || completedAt >= entry.expiresAt || completedAt - startedAt > this.#maxAgeMs
              || !validIdentity(identity) || identity.login !== entry.identity.login
              || identity.uid !== entry.identity.uid) throw unavailable();
          // Network latency consumes the lease instead of extending it.
          entry.confirmedAt = startedAt;
          entry.clientIp = ip;
          entry.pending = null;
          return entry.identity;
        } catch {
          if (this.#entries.get(sessionId) === entry) this.forget(sessionId);
          throw unavailable();
        }
      })();
      return await operation.promise;
    } catch {
      if (entry && this.#entries.get(sessionId) === entry) this.forget(sessionId);
      throw unavailable();
    }
  }

  forget(sessionId) {
    this.#entries.delete(sessionId);
  }

  clear() {
    this.#entries.clear();
  }
}

module.exports = { CorporateIdentitySessions };
