"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { classifyCorporateAuth, corporateLoginRedirectAllowed, translateToEnglish } = require("../app.js");

function response(status, type = "basic") {
  return { status, type, ok: status >= 200 && status < 300 };
}

test("CorporateAuth_BalancerRedirectAndUnauthorizedRequireSignIn", () => {
  assert.equal(classifyCorporateAuth(response(0, "opaqueredirect")).kind, "login_required");
  assert.equal(classifyCorporateAuth(response(401), { code: "authentication_required" }).kind, "login_required");
  assert.equal(classifyCorporateAuth(response(200), { user: {} }).kind, "ok");
});

test("CorporateAuth_RefusalsGetClearMessagesWithoutRedirect", () => {
  const notProvisioned = classifyCorporateAuth(response(403), { code: "staff_access_not_provisioned", error: "server text" });
  assert.equal(notProvisioned.kind, "forbidden");
  assert.match(notProvisioned.message, /ещё не открыт доступ/);
  assert.equal(classifyCorporateAuth(response(403), { code: "staff_access_disabled" }).kind, "forbidden");
  assert.equal(classifyCorporateAuth(response(403), { code: "other", error: "Особый отказ" }).message, "Особый отказ");

  const unavailable = classifyCorporateAuth(response(503), { code: "webauth_unavailable", error: "Внутренняя ошибка сервера" });
  assert.equal(unavailable.kind, "unavailable");
  assert.match(unavailable.message, /временно недоступен/);
  assert.equal(classifyCorporateAuth(response(500), { code: "internal_error" }).kind, "error");
});

test("CorporateAuth_RedirectGuardAllowsOneAutomaticAttemptPerWindow", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const start = 1_000_000;
  assert.equal(corporateLoginRedirectAllowed(storage, start), true);
  assert.equal(corporateLoginRedirectAllowed(storage, start + 60_000), false);
  assert.equal(corporateLoginRedirectAllowed(storage, start + 2 * 60_000 + 1), true);

  const broken = { getItem() { throw new Error("storage disabled"); }, setItem() {} };
  assert.equal(corporateLoginRedirectAllowed(broken, start), false);
});

test("CorporateAuth_MessagesAreTranslated", () => {
  for (const code of ["staff_access_not_provisioned", "staff_access_disabled", "staff_identity_mismatch"]) {
    const { message } = classifyCorporateAuth(response(403), { code });
    assert.doesNotMatch(translateToEnglish(message), /[А-Яа-яЁё]/, code);
  }
  const { message } = classifyCorporateAuth(response(503), { code: "webauth_unavailable" });
  assert.doesNotMatch(translateToEnglish(message), /[А-Яа-яЁё]/);
});
