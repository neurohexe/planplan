#!/usr/bin/env node
"use strict";

const { loadConfig } = require("./config.js");
const { PlanFactHttpServer } = require("./http-server.js");
const { RealtimeHub } = require("./realtime.js");
const { PlanFactService } = require("./service.js");
const { createStore } = require("./store-factory.js");
const { ACCESS_CODE_AUTH_MODE, createIdentityProvider } = require("./identity-provider.js");
const { createIdmIntegration } = require("./idm.js");
const { CorporateRoles, unavailable } = require("./corporate-roles.js");
const { createVerifiedTiroleSource } = require("./tirole-source.js");
const { createTiroleFreshnessProxy } = require("./tirole-freshness-proxy.js");
const { CorporateLoginFlow } = require("./corporate-login.js");
const { WebAuthCorporateAdapter, WEBAUTH_CALLBACK_PATH } = require("./webauth-corporate-adapter.js");

async function main() {
  const config = loadConfig();
  const realtime = new RealtimeHub();
  const identityProvider = createIdentityProvider(config);
  const idm = createIdmIntegration(config);
  const corporateLogin = config.authMode === "corporate-idm" ? new CorporateLoginFlow({
    publicUrl: config.corporatePublicUrl, callbackPath: WEBAUTH_CALLBACK_PATH,
    adapter: new WebAuthCorporateAdapter({ publicUrl: config.corporatePublicUrl,
      sessionMaxAgeMs: Math.min(config.sessionMaxAgeMs, 86_400_000), timeoutMs: Math.min(config.webauthTimeoutMs, 5000) })
  }) : null;
  const freshnessProxy = corporateLogin ? createTiroleFreshnessProxy({ systemSlug: config.idmSystemSlug, port: config.tiroleProxyPort }) : null;
  let store;
  let roles;
  let server;
  const close = async () => {
    roles?.stop();
    corporateLogin?.clear();
    try { await server?.close(); }
    finally { try { await freshnessProxy?.close(); } finally { await store?.close(); } }
  };
  try {
    if (freshnessProxy) await freshnessProxy.listen();
    store = await createStore(config, PlanFactService.initialState);
    roles = config.authMode === "corporate-idm" ? new CorporateRoles({
      systemSlug: config.idmSystemSlug,
      source: config.tvmToolUrl && config.tvmToolAuthToken ? createVerifiedTiroleSource({
        baseUrl: config.tvmToolUrl, selfAlias: config.tvmSelfAlias, systemSlug: config.idmSystemSlug, localToken: config.tvmToolAuthToken, proxy: freshnessProxy
      }) : async () => { throw unavailable(); }
    }) : null;
    const service = new PlanFactService({ store, config, realtime, roles, corporateIdentity: corporateLogin });
    if (roles) {
      // A restart must verify roles before serving any data. Unconfigured adapters
      // keep /ready closed; the listening process is useful for safe diagnostics.
      await roles.start().catch(() => {});
    }
    server = new PlanFactHttpServer({ service, config, realtime, identityProvider, idm, corporateLogin });
    const address = await server.listen();
    process.stdout.write(`Plan Fact backend: http://${address.address}:${address.port}\n`);
    if (roles) process.stdout.write("auth_mode corporate-idm: WebAuth online verification and Tirole upstream proof enabled\n");
    if (identityProvider.mode === ACCESS_CODE_AUTH_MODE) {
      // Режим стенда виден в логе сразу: вход по личным кодам, внешних проверок нет.
      process.stdout.write(`auth_mode access-code secure_cookies=${config.secureCookies ? "on" : "off"}\n`);
    }
    if (typeof identityProvider.selfCheck === "function") {
      // Не блокирует старт: строка в логе сразу показывает, достижим ли WebAuth и доверен ли его сертификат.
      identityProvider.selfCheck().then((result) => {
        if (result.ok) process.stdout.write(`webauth_self_check ok status=${result.status}\n`);
        else console.error(`webauth_self_check failed code=${result.code}`);
      });
    }
    if (idm) {
      process.stdout.write(`idm_role_source enabled tvm_sources=${idm.tvmSources.join(",")}\n`);
      // Не блокирует старт: без tvmtool ручки IDM отвечают 500, и IDM повторит запрос позже.
      idm.checker.selfCheck().then((result) => {
        if (result.ok) process.stdout.write(`tvm_self_check ok status=${result.status}\n`);
        else console.error(`tvm_self_check failed ${result.code ? `code=${result.code}` : `status=${result.status}`}`);
      });
    }

    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await close();
    };
    process.once("SIGINT", () => stop().finally(() => process.exit(0)));
    process.once("SIGTERM", () => stop().finally(() => process.exit(0)));
  } catch (error) {
    await close();
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Plan Fact backend failed to start: ${String(error?.message || "unknown error").slice(0, 500)}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
