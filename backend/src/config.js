"use strict";

const os = require("node:os");
const path = require("node:path");

function integer(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function boolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function metadata(value, fallback = "unknown") {
  const normalized = String(value || "").trim();
  return (normalized || fallback).slice(0, 200);
}

// Каталог личных кодов доступа: PLAN_FACT_CODES_DIR, по умолчанию ~/PlanFactMVP/codes.
// Одна настройка для сервера и команды issue-access-code; сам сервер коды не читает.
function accessCodesDirectory(env = process.env) {
  return path.resolve(env.PLAN_FACT_CODES_DIR || path.join(os.homedir(), "PlanFactMVP", "codes"));
}

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const port = integer(env.PLAN_FACT_PORT || env.PORT, 18766, { min: 1, max: 65535 });
  const allowedOrigins = String(env.PLAN_FACT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!allowedOrigins.length && !production) {
    allowedOrigins.push(`http://127.0.0.1:${port}`, `http://localhost:${port}`);
  }
  const trustedProxyIps = String(env.PLAN_FACT_TRUSTED_PROXY_IPS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const config = Object.freeze({
    host: env.PLAN_FACT_HOST || (production ? "0.0.0.0" : "127.0.0.1"),
    port,
    databasePath: path.resolve(env.PLAN_FACT_DATABASE || path.join(__dirname, "..", "var", "plan-fact.sqlite")),
    databaseUrl: String(env.PLAN_FACT_DATABASE_URL || env.DATABASE_URL || "").trim(),
    databaseSsl: String(env.PLAN_FACT_DATABASE_SSL || (production ? "verify-full" : "disable")).trim().toLowerCase(),
    databaseCaFile: env.PLAN_FACT_DATABASE_CA_FILE ? path.resolve(env.PLAN_FACT_DATABASE_CA_FILE) : null,
    databasePoolMax: integer(env.PLAN_FACT_DATABASE_POOL_MAX, 10, { min: 1, max: 50 }),
    databaseStatementTimeoutMs: integer(env.PLAN_FACT_DATABASE_STATEMENT_TIMEOUT_MS, 30_000, { min: 1_000, max: 300_000 }),
    storageDriver: String(env.PLAN_FACT_STORAGE_DRIVER || (production ? "" : "sqlite")).trim().toLowerCase(),
    deploymentProfile: String(env.PLAN_FACT_DEPLOYMENT_PROFILE || "full").trim().toLowerCase(),
    backendVersion: metadata(env.PLAN_FACT_BACKEND_VERSION, "0.1.0"),
    buildCommit: metadata(env.PLAN_FACT_BUILD_COMMIT),
    imageDigest: metadata(env.PLAN_FACT_IMAGE_DIGEST),
    authMode: String(env.PLAN_FACT_AUTH_MODE || "webauth").trim().toLowerCase(),
    corporatePublicUrl: String(env.PLAN_FACT_CORPORATE_PUBLIC_URL || "").trim(),
    idmSystemSlug: String(env.PLAN_FACT_IDM_SYSTEM_SLUG || "").trim(),
    idmRequestUrl: String(env.PLAN_FACT_IDM_REQUEST_URL || "").trim(),
    webauthUrl: String(env.PLAN_FACT_WEBAUTH_URL || "https://webauth.yandex-team.ru/auth_request").trim(),
    webauthTimeoutMs: integer(env.PLAN_FACT_WEBAUTH_TIMEOUT_MS, 5_000, { min: 500, max: 30_000 }),
    webauthCacheTtlMs: integer(env.PLAN_FACT_WEBAUTH_CACHE_TTL_MS, 30_000, { min: 0, max: 5 * 60_000 }),
    webauthCaFile: String(env.NODE_EXTRA_CA_CERTS || "").trim(),
    developmentStaffLogin: String(env.PLAN_FACT_DEVELOPMENT_STAFF_LOGIN || "").trim().toLowerCase(),
    developmentStaffUid: String(env.PLAN_FACT_DEVELOPMENT_STAFF_UID || "").trim(),
    staticDir: env.PLAN_FACT_STATIC_DIR ? path.resolve(env.PLAN_FACT_STATIC_DIR) : null,
    codesDir: accessCodesDirectory(env),
    allowedOrigins,
    trustedProxyIps,
    secureCookies: boolean(env.PLAN_FACT_SECURE_COOKIES, production),
    sessionMaxAgeMs: integer(env.PLAN_FACT_SESSION_MAX_AGE_MS, 24 * 60 * 60 * 1000, { min: 60_000 }),
    lockTtlMs: integer(env.PLAN_FACT_LOCK_TTL_MS, 120_000, { min: 30_000, max: 15 * 60_000 }),
    maxRequestBytes: integer(env.PLAN_FACT_MAX_REQUEST_BYTES, 5 * 1024 * 1024, { min: 1024 }),
    requireLocks: boolean(env.PLAN_FACT_REQUIRE_LOCKS, true),
    // app — роли ведутся в приложении; idm — уровень роли выдаёт только IDM (см. docs/IDM-INTEGRATION.md).
    roleSource: String(env.PLAN_FACT_ROLE_SOURCE || "app").trim().toLowerCase(),
    idmTvmSources: String(env.PLAN_FACT_IDM_TVM_SOURCES || "2001600")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    tvmToolUrl: String(env.DEPLOY_TVM_TOOL_URL || "").trim(),
    tvmToolAuthToken: String(env.TVMTOOL_LOCAL_AUTHTOKEN || "").trim(),
    tvmSelfAlias: String(env.PLAN_FACT_TVM_SELF_ALIAS || "").trim(),
    tiroleProxyPort: integer(env.PLAN_FACT_TIROLE_PROXY_PORT, 18769, { min: 18767, max: 65535 }),
    tvmTimeoutMs: integer(env.PLAN_FACT_TVM_TIMEOUT_MS, 2_000, { min: 200, max: 10_000 }),
    production
  });
  require("./corporate-login.js").assertCorporateModeAllowed(config);
  return config;
}

module.exports = { accessCodesDirectory, boolean, integer, loadConfig, metadata };
