"use strict";
// Run only through provision-minipc.py: stdout contains newly issued credentials.
// Adds missing accounts; never resets data or rotates an existing account's code.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
process.umask(0o077);
const ROOT = "/home/zomb-vodeyko/PlanFactMVP";
const source = path.join(ROOT, "app/backend/src");
const { loadConfig } = require(path.join(source, "config.js"));
const { PlanFactService } = require(path.join(source, "service.js"));
const { RealtimeHub } = require(path.join(source, "realtime.js"));
const { createStore } = require(path.join(source, "store-factory.js"));
const { writeAccessCodeFile } = require(path.join(source, "cli.js"));
const config = loadConfig();
const mode = process.argv[2];
const manifest = JSON.parse(process.argv[3]);
const credentials = [];
let phase = "preflight";
function codeMetadata(login) {
  const s = fs.lstatSync(path.join(config.codesDir, login + ".txt"));
  assert(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.mode & 0o777, 0o600);
  return { ino: s.ino, size: s.size, mtime: s.mtimeMs, ctime: s.ctimeMs };
}
function checkTarget() {
  assert.equal(os.hostname().split(".")[0], "zomb-vodeyko-132");
  assert.equal(fs.realpathSync(ROOT), ROOT);
  assert.equal(config.databasePath, path.join(ROOT, "data/plan-fact.sqlite"));
  assert.equal(fs.realpathSync(config.databasePath), config.databasePath);
  assert.equal(config.codesDir, path.join(ROOT, "codes"));
  assert.equal(fs.realpathSync(config.codesDir), config.codesDir);
  assert.equal(fs.statSync(config.codesDir).mode & 0o777, 0o700);
  assert.equal(config.authMode, "access-code");
  assert.equal(config.roleSource, "app");
  assert.equal(config.storageDriver, "sqlite");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 18766);
  assert(["inspect", "provision"].includes(mode));
  assert.equal(manifest.preserve.role, "superadmin");
  assert.equal(manifest.create.length, 7);
  const all = [manifest.preserve, ...manifest.create];
  assert.equal(new Set(all.map(a => a.login)).size, all.length);
  for (const a of all) {
    assert(/^[a-z][a-z0-9-]{0,63}$/.test(a.login));
    assert(["superadmin", "admin"].includes(a.role));
  }
}
function facts() {
  const db = new DatabaseSync(config.databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    const state = JSON.parse(db.prepare("SELECT body_json FROM application_state WHERE singleton=1").get().body_json);
    const users = db.prepare("SELECT staff_login AS login, role, active FROM users ORDER BY staff_login").all();
    const counts = {};
    for (const table of ["users", "access_codes", "sessions", "edit_locks", "idm_roles", "sync_jobs"]) {
      counts[table] = db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    }
    const owner = db.prepare(`SELECT u.id, u.staff_login, u.role, u.active, u.created_at,
      a.issued_at FROM users u JOIN access_codes a ON a.user_id=u.id WHERE u.staff_login=?`).get(manifest.preserve.login);
    const newSessions = db.prepare(`SELECT count(*) AS n FROM sessions s
      JOIN users u ON s.user_id=u.id WHERE u.staff_login<>?`).get(manifest.preserve.login).n;
    return { state, users, counts, owner, newSessions };
  } finally { db.close(); }
}
async function request(route, { body, cookie } = {}) {
  const url = "http://127.0.0.1:18766";
  const headers = { Origin: url };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url + route, { method: body ? "POST" : "GET", headers,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  let data; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}
async function verifyLogin(a) {
  const logged = await request("/api/login", { body: { login: a.login, code: a.code } });
  assert.equal(logged.status, 200);
  assert(logged.cookie);
  try {
    assert.equal(logged.data.user.role, a.role);
    assert.equal(logged.data.user.staffLogin, a.login);
    assert.equal((await request("/api/state", { cookie: logged.cookie })).status, 200);
  } finally {
    assert.equal((await request("/api/logout", { body: {}, cookie: logged.cookie })).status, 200);
  }
  assert.equal((await request("/api/auth", { cookie: logged.cookie })).status, 401);
}
(async () => {
  checkTarget();
  const before = facts();
  const ownerFile = codeMetadata(manifest.preserve.login);
  assert(before.owner && before.owner.role === manifest.preserve.role && before.owner.active === 1);
  assert.equal((await request("/api/ready")).status, 200);
  if (mode === "inspect") {
    return { status: "inspected", users: before.users, counts: before.counts,
      code_files: fs.readdirSync(config.codesDir).sort(), integrity: "ok",
      initial_state: JSON.stringify(before.state) === JSON.stringify(PlanFactService.initialState()) };
  }
  assert.equal(before.users.length, 1);
  assert.equal(before.counts.access_codes, 1);
  assert.deepEqual(before.state, PlanFactService.initialState());
  for (const a of manifest.create) {
    assert(!before.users.some(u => u.login === a.login));
    assert(!fs.existsSync(path.join(config.codesDir, a.login + ".txt")));
  }
  phase = "provision_accounts";
  const store = await createStore(config, PlanFactService.initialState);
  try {
    const service = new PlanFactService({ store, config, realtime: new RealtimeHub() });
    for (const a of manifest.create) {
      await service.provisionStaffAccount({ staffLogin: a.login, name: a.login, role: a.role });
      const issued = await service.issueAccessCode(a.login);
      credentials.push({ login: a.login, role: a.role, code: issued.code });
      writeAccessCodeFile(config.codesDir, a.login, issued.code);
      codeMetadata(a.login);
    }
  } finally { await store.close(); }
  phase = "verify_http_logins";
  assert.equal((await request("/api/auth")).status, 401);
  for (const a of credentials) await verifyLogin(a);
  phase = "verify_final_state";
  const after = facts();
  assert.deepEqual(after.state, before.state);
  assert.deepEqual(after.owner, before.owner);
  assert.deepEqual(codeMetadata(manifest.preserve.login), ownerFile);
  assert.equal(after.counts.users, 8);
  assert.equal(after.counts.access_codes, 8);
  assert.equal(after.newSessions, 0);
  for (const a of [manifest.preserve, ...manifest.create]) {
    assert(after.users.some(u => u.login === a.login && u.role === a.role && u.active === 1));
  }
  return { status: "provision_complete", users: after.users, counts: after.counts,
    http_login_state_logout_verified: credentials.map(a => a.login), integrity: "ok",
    initial_state_unchanged: true, owner_account_and_code_unchanged: true, credentials };
})().then(result => process.stdout.write(JSON.stringify(result) + "\n"))
  .catch(error => {
    // Wrapper also delivers codes on partial failure; raw errors are never printed.
    process.stdout.write(JSON.stringify({ status: "failed", phase, error_name: error.name,
      error_code: error.code || null, credentials }) + "\n");
    process.exitCode = 1;
  });
