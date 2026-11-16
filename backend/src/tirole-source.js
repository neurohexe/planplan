"use strict";

const { AppError } = require("./errors.js");
const { unavailable, validateSnapshot } = require("./corporate-roles.js");
const { hash, readLimited } = require("./tirole-freshness-proxy.js");

function createVerifiedTiroleSource({ baseUrl, selfAlias, systemSlug, localToken, proxy }, {
  fetch = globalThis.fetch, clock = Date.now, timeoutMs = 5_000
} = {}) {
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
    if (endpoint.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(endpoint.hostname)
        || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/"
        || !/^[a-zA-Z0-9_-]{1,100}$/.test(selfAlias || "")
        || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(systemSlug || "")
        || typeof localToken !== "string" || !/^[!-~]{1,8192}$/.test(localToken)
        || proxy?.systemSlug !== systemSlug || typeof proxy.verifySnapshot !== "function"
        || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) throw unavailable();
    endpoint.pathname = "/v2/roles";
    endpoint.searchParams.set("self", selfAlias);
  } catch { throw new AppError("Неверно настроена проверка корпоративных ролей через tvmtool"); }
  return async () => {
    try {
      const response = await fetch(endpoint, {
        method: "GET", headers: { Authorization: localToken, Accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.status !== 200) throw unavailable();
      const raw = await readLimited(response);
      const wireBody = JSON.parse(raw.toString("utf8"));
      // IDM omits empty user/tvm maps. Normalize only absence; malformed values
      // such as null or arrays must still fail the shared strict validator.
      const body = { ...wireBody,
        user: Object.hasOwn(wireBody, "user") ? wireBody.user : {},
        tvm: Object.hasOwn(wireBody, "tvm") ? wireBody.tvm : {}
      };
      // Verify structure before accepting any new high-water mark in the proxy.
      validateSnapshot({ body, systemSlug, confirmedAt: clock() }, systemSlug, clock(), 600_000);
      const confirmedAt = proxy.verifySnapshot({ body: wireBody, rawHash: hash(raw), rawSize: raw.length });
      return { body, systemSlug, confirmedAt };
    } catch { throw unavailable(); }
  };
}

module.exports = { createVerifiedTiroleSource };
