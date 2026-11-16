"use strict";

const http = require("node:http");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { AppError } = require("./errors.js");
const { unavailable } = require("./corporate-roles.js");

// tvmtool explicitly supports backends.tirole_url for a proxy:
// https://docs.yandex-team.ru/tvm/pages/tvmtool/setup/config
// It remains the Tirole client; this proxy only forwards its requests. The
// private cache, /ping and local HTTP 200 never supply freshness evidence.
const UPSTREAM = "https://tirole-api.yandex.net/v1/get_actual_roles";
const MAX_AGE_MS = 600_000;
const MAX_BYTES = 2 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validRevision = (value) => typeof value === "string" && /^[!-~]{1,256}$/.test(value)
  && !/["\\,]/.test(value);

async function readLimited(response, maxBytes = MAX_BYTES) {
  if (!response.body?.getReader || Number(response.headers.get("content-length")) > maxBytes) throw unavailable();
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw unavailable(); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

function quotedRevision(value) {
  if (typeof value !== "string" || value[0] !== '"' || value.at(-1) !== '"') throw unavailable();
  const revision = value.slice(1, -1);
  if (!validRevision(revision)) throw unavailable();
  return revision;
}

function compressionProof(header, bytes) {
  if (!header) return { rawHash: hash(bytes), rawSize: bytes.length };
  // This metadata is obtained over authenticated HTTPS, never from tvmtool's
  // disk cache. Its SHA256 refers to the decoded bytes returned by /v2/roles.
  // Unknown future formats fail closed instead of guessing a decoder.
  const match = /^1:(brotli|gzip|zstd):([1-9][0-9]{0,7}):([a-fA-F0-9]{64})$/.exec(header);
  if (!match || Number(match[2]) > MAX_BYTES) throw unavailable();
  return { rawHash: match[3].toLowerCase(), rawSize: Number(match[2]) };
}

function createTiroleFreshnessProxy({ systemSlug, port }, {
  fetch = globalThis.fetch, clock = Date.now, monotonic = () => performance.now(), timeoutMs = 5_000
} = {}) {
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(systemSlug || "")
      || !Number.isInteger(port) || port < 0 || port > 65535
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) {
    throw new AppError("Неверно настроена проверка актуальности корпоративных ролей");
  }
  let baseUrl = null;
  let proof = null;
  let sequence = 0;
  let accepted = null;
  const previousRevisions = new Set();

  const fail = (response, status = 502) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end('{"error":"roles_upstream_unavailable"}');
  };

  async function handle(request, response) {
    let requestSequence;
    try {
      if (!baseUrl || request.socket.remoteAddress !== "127.0.0.1" || request.method !== "GET"
          || request.headers.host !== new URL(baseUrl).host || !request.url.startsWith("/")
          || request.url.startsWith("//") || request.headers.origin || request.headers.cookie
          || request.headers.authorization || request.headers["transfer-encoding"]
          || (request.headers["content-length"] && request.headers["content-length"] !== "0")) {
        fail(response, 400); return;
      }
      const url = new URL(request.url, baseUrl);
      const keys = [...url.searchParams.keys()];
      const ticket = request.headers["x-ya-service-ticket"];
      if (url.pathname !== "/v1/get_actual_roles" || url.hash || keys.length !== 2
          || url.searchParams.getAll("system_slug").length !== 1
          || url.searchParams.get("system_slug") !== systemSlug
          || url.searchParams.getAll("lib_version").length !== 1
          || !/^[a-zA-Z0-9_.-]{1,100}$/.test(url.searchParams.get("lib_version") || "")
          || typeof ticket !== "string" || !/^[!-~]{1,8192}$/.test(ticket)) {
        fail(response, 400); return;
      }
      const revision = request.headers["if-none-match"] == null ? null
        : quotedRevision(request.headers["if-none-match"]);
      const startedAt = clock();
      const startedMono = monotonic();
      requestSequence = ++sequence;
      const upstream = new URL(UPSTREAM);
      upstream.search = url.search;
      const headers = { "X-Ya-Service-Ticket": ticket, "Accept-Encoding": "identity" };
      // Bootstrap with a full response even if tvmtool restored a disk cache.
      // Later 304s can renew only a revision whose exact bytes we already bound.
      const conditional = revision && accepted?.revision === revision ? { ...accepted } : null;
      if (conditional) headers["If-None-Match"] = `"${revision}"`;
      const result = await fetch(upstream, {
        method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(timeoutMs)
      });
      let bytes = null;
      let next;
      if (result.status === 304 && conditional) {
        next = { revision, rawHash: conditional.rawHash, rawSize: conditional.rawSize };
      } else if (result.status === 200) {
        bytes = await readLimited(result);
        next = compressionProof(result.headers.get("x-tirole-compression"), bytes);
      } else throw unavailable();
      if (requestSequence !== sequence || clock() < startedAt || monotonic() < startedMono
          || monotonic() - startedMono > timeoutMs) throw unavailable();
      // Use request start, conservatively excluding response transit time.
      proof = { ...next, sequence: requestSequence, confirmedAt: startedAt, confirmedMono: startedMono };
      const outgoing = { "Cache-Control": "no-store" };
      if (result.status === 200) {
        outgoing["Content-Type"] = "application/octet-stream";
        const compression = result.headers.get("x-tirole-compression");
        if (compression) outgoing["X-Tirole-Compression"] = compression;
      }
      response.writeHead(result.status, outgoing);
      response.end(bytes);
    } catch {
      if (requestSequence === sequence) proof = null;
      if (!response.headersSent) fail(response);
      else response.destroy();
    }
  }

  const server = http.createServer({ maxHeaderSize: 12 * 1024 }, (request, response) => {
    handle(request, response).catch(() => { response.destroy(); });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;

  return {
    get baseUrl() { return baseUrl; },
    get systemSlug() { return systemSlug; },
    async listen() {
      if (baseUrl) return baseUrl;
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
      });
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      return baseUrl;
    },
    async close() {
      proof = null;
      sequence += 1;
      baseUrl = null;
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    },
    verifySnapshot({ body, rawHash, rawSize }) {
      const evidence = proof;
      const now = clock();
      const mono = monotonic();
      if (!baseUrl || !evidence || !Number.isFinite(now) || !Number.isFinite(mono)
          || now < evidence.confirmedAt || now - evidence.confirmedAt > MAX_AGE_MS
          || mono < evidence.confirmedMono || mono - evidence.confirmedMono > MAX_AGE_MS
          || !body || !validRevision(body.revision) || !Number.isSafeInteger(body.born_date)
          || body.born_date <= 0 || body.born_date * 1000 > now
          || (evidence.rawHash && (evidence.rawHash !== rawHash || evidence.rawSize !== rawSize))
          || (evidence.revision && evidence.revision !== body.revision)) throw unavailable();
      if (accepted && (body.born_date < accepted.bornDate
          || evidence.confirmedAt < accepted.confirmedAt || evidence.sequence < accepted.sequence
          || (body.revision !== accepted.revision && previousRevisions.has(body.revision))
          || (body.revision === accepted.revision && rawHash !== accepted.rawHash))) throw unavailable();
      // The first match binds the authenticated upstream response to this exact
      // slug/revision/body. A subsequent local 200 cannot advance confirmedAt.
      evidence.revision = body.revision;
      evidence.rawHash = rawHash;
      evidence.rawSize = rawSize;
      if (accepted && body.revision !== accepted.revision) previousRevisions.add(accepted.revision);
      accepted = { revision: body.revision, bornDate: body.born_date, rawHash, rawSize,
        confirmedAt: evidence.confirmedAt, sequence: evidence.sequence };
      return evidence.confirmedAt;
    }
  };
}

module.exports = { createTiroleFreshnessProxy, readLimited, hash };
