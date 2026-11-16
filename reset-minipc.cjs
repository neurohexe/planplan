"use strict";
// Runs only on the explicitly named mini-PC. No application code is changed.
// stdout is consumed privately by reset-minipc.py; never run reset directly.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
process.umask(0o077);
const ROOT = "/home/zomb-vodeyko/PlanFactMVP";
const source = path.join(ROOT, "app/backend/src");
const { loadConfig } = require(path.join(source, "config.js"));
const { PlanFactService } = require(path.join(source, "service.js"));
const { RealtimeHub } = require(path.join(source, "realtime.js"));
const { createStore } = require(path.join(source, "store-factory.js"));
const { PlanFactHttpServer } = require(path.join(source, "http-server.js"));
const { createIdentityProvider } = require(path.join(source, "identity-provider.js"));
const { writeAccessCodeFile } = require(path.join(source, "cli.js"));
const config = loadConfig();
const mode = process.argv[2];
const accounts = JSON.parse(process.argv[3] || "[]");
let phase = "preflight";
function safeDirectory(p) {
  assert(fs.lstatSync(p).isDirectory() && !fs.lstatSync(p).isSymbolicLink());
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const child = path.join(p, e.name);
    assert(!e.isSymbolicLink(), "Symlink in reset target");
    if (e.isDirectory()) safeDirectory(child);
    else assert(e.isFile(), "Non-regular reset target");
  }
}
function checkTarget() {
  assert.equal(os.hostname().split(".")[0], "zomb-vodeyko-132");
  assert.equal(fs.realpathSync(ROOT), ROOT);
  assert.equal(config.authMode, "access-code");
  assert.equal(config.roleSource, "app");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 18766);
  assert.equal(config.databasePath, path.join(ROOT, "data/plan-fact.sqlite"));
  assert.equal(config.codesDir, path.join(ROOT, "codes"));
  assert.equal(config.storageDriver, "sqlite");
  assert(!fs.existsSync(path.join(ROOT, "systemd/.offsite-enabled")));
  for (const name of ["data", "codes", "backups", "logs"]) safeDirectory(path.join(ROOT, name));
}
function validateAccounts(list) {
  assert(list.length > 0 && list.length <= 100);
  assert(list.some(a => a.role === "superadmin"));
  const seen = new Set();
  for (const a of list) {
    assert(/^[a-z][a-z0-9-]{0,63}$/.test(a.login));
    assert(["superadmin", "admin", "user"].includes(a.role));
    assert(!seen.has(a.login)); seen.add(a.login);
  }
}
function mkdir(p) { fs.mkdirSync(p, { recursive: true, mode: 0o700 }); }
function facts(database) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    const state = JSON.parse(db.prepare("SELECT body_json FROM application_state WHERE singleton=1").get().body_json);
    const users = db.prepare("SELECT staff_login AS login,role,active FROM users ORDER BY staff_login").all();
    const counts = {};
    for (const table of ["users", "access_codes", "sessions", "edit_locks", "idm_roles", "sync_jobs"]) {
      counts[table] = db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    }
    return { state, users, counts };
  } finally { db.close(); }
}
async function buildFresh(folder, list) {
  mkdir(path.join(folder, "data")); mkdir(path.join(folder, "codes"));
  const cfg = { ...config, databasePath: path.join(folder, "data/plan-fact.sqlite"), codesDir: path.join(folder, "codes") };
  const store = await createStore(cfg, PlanFactService.initialState);
  const realtime = new RealtimeHub();
  const service = new PlanFactService({ store, config: cfg, realtime });
  const credentials = [];
  try {
    assert.equal(store.countUsers(), 0);
    for (const a of list) {
      const result = await service.provisionStaffAccount({ staffLogin: a.login, name: a.login, role: a.role });
      if (a.role === "user") {
        await store.updateUser(result.account.id, { locationAccess: { default: "edit" }, defaultLocationAccess: "hidden" });
      }
      const issued = await service.issueAccessCode(a.login);
      writeAccessCodeFile(cfg.codesDir, a.login, issued.code);
      const session = await service.loginWithAccessCode({ login: a.login, code: issued.code });
      assert.equal(session.user.role, a.role);
      await service.logout(session.session);
      credentials.push({ login: a.login, role: a.role, code: issued.code });
    }
  } finally { await store.close(); }
  fs.chmodSync(cfg.databasePath, 0o600);
  const f = facts(cfg.databasePath);
  assert.deepEqual(f.state, PlanFactService.initialState());
  assert.equal(f.counts.users, list.length);
  assert.equal(f.counts.access_codes, list.length);
  assert.equal(f.counts.sessions, 0);
  return { cfg, credentials };
}
async function request(url, route, { body, cookie } = {}) {
  const headers = { Origin: url };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url + route, { method: body ? "POST" : "GET", headers,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  return { status: r.status, data, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}
async function verifyHttp(url, credentials, oldSessionToken) {
  assert.equal((await request(url, "/api/ready")).status, 200);
  assert.equal((await request(url, "/api/auth")).status, 401);
  for (const a of credentials) {
    const logged = await request(url, "/api/login", { body: { login: a.login, code: a.code } });
    assert.equal(logged.status, 200); assert.equal(logged.data.user.role, a.role);
    assert(logged.cookie);
    assert.equal((await request(url, "/api/state", { cookie: logged.cookie })).status, 200);
    assert.equal((await request(url, "/api/logout", { body: {}, cookie: logged.cookie })).status, 200);
    assert.equal((await request(url, "/api/auth", { cookie: logged.cookie })).status, 401);
  }
}
function ctl(...args) { return execFileSync("systemctl", ["--user", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function unitState(unit) { try { return ctl("is-active", unit); } catch { return "inactive"; } }
async function waitReady(url) {
  for (let i=0;i<30;i++) {
    try { if ((await request(url,"/api/ready")).status === 200) return; } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error("Ready timeout");
}
async function rehearse() {
  const dir=fs.mkdtempSync("/tmp/planfact-reset-rehearsal-");
  let server, store;
  try {
    const list=[{login:"alice",role:"superadmin"},{login:"bob",role:"admin"},{login:"carol",role:"user"}];
    const fresh=await buildFresh(dir,list);
    const cfg={...fresh.cfg,port:0};
    store=await createStore(cfg,PlanFactService.initialState);
    const realtime=new RealtimeHub();
    const service=new PlanFactService({store,config:cfg,realtime});
    server=new PlanFactHttpServer({service,config:cfg,realtime,identityProvider:createIdentityProvider(cfg),idm:null});
    const address=await server.listen(); const url=`http://127.0.0.1:${address.port}`;
    await verifyHttp(url,fresh.credentials);
    const previous=fresh.credentials[0].code;
    const replacement=await service.issueAccessCode("alice");
    assert.equal((await request(url,"/api/login",{body:{login:"alice",code:previous}})).status,401);
    await verifyHttp(url,[{login:"alice",role:"superadmin",code:replacement.code}]);
    return { status:"rehearsal_passed",tested_roles:list.map(a=>a.role),http_login_and_logout:true,reissued_code_invalidates_old:true,secure_cookies:config.secureCookies };
  } finally { if(server)await server.close(); if(store)await store.close(); fs.rmSync(dir,{recursive:true}); }
}
async function reset() {
  validateAccounts(accounts);
  const dir=fs.mkdtempSync(path.join(ROOT,".reset-stage-"));
  const moved=[]; let irreversible=false; let active=[]; let units=[];
  try {
    phase="prepare_fresh_database";
    const fresh=await buildFresh(dir,accounts);
    mkdir(path.join(dir,"backups/hourly")); mkdir(path.join(dir,"backups/daily")); mkdir(path.join(dir,"logs"));
    const names=["app.service","backup.service","backup.timer","healthcheck.service","healthcheck.timer","logrotate.service","logrotate.timer","tunnel.service"];
    units=names.map(n=>"ru.planfact.mvp."+n);
    for(const unit of units) {
      assert(fs.existsSync(path.join(ROOT,"systemd",unit)));
      const installed=path.join(os.homedir(),".config/systemd/user",unit);
      assert(fs.readFileSync(installed).equals(fs.readFileSync(path.join(ROOT,"systemd",unit))));
    }
    active=units.filter(u=>unitState(u)==="active");
    assert(active.includes("ru.planfact.mvp.app.service"));
    phase="stop_services"; ctl("stop",...units);
    for(const u of units)assert.notEqual(unitState(u),"active");
    const listeners=execFileSync("ss",["-Hltn","sport = :18766"],{encoding:"utf8"}).trim();
    assert.equal(listeners,"");
    phase="replace_application_data";
    for(const name of ["data","codes","backups","logs"]) {
      fs.renameSync(path.join(ROOT,name),path.join(dir,"old-"+name));
      moved.push(name);
      fs.renameSync(path.join(dir,name),path.join(ROOT,name));
    }
    phase="verify_new_stand";
    ctl("start","ru.planfact.mvp.app.service");
    const url="http://127.0.0.1:18766";
    await waitReady(url); await verifyHttp(url,fresh.credentials);
    const f=facts(config.databasePath);
    assert.deepEqual(f.state,PlanFactService.initialState());
    assert.equal(f.counts.users,accounts.length); assert.equal(f.counts.sessions,0);
    for(const a of accounts)assert(f.users.some(u=>u.login===a.login&&u.role===a.role&&u.active===1));
    phase="delete_old_data"; irreversible=true;
    for(const name of moved)fs.rmSync(path.join(dir,"old-"+name),{recursive:true});
    fs.rmSync(dir,{recursive:true});
    phase="resume_timers";
    const rest=active.filter(u=>u!=="ru.planfact.mvp.app.service");
    if(rest.length)ctl("start",...rest);
    phase="complete";
    return {status:"reset_complete",users:f.users,counts:f.counts,initial_state:true,
      old_data_deleted:true,old_local_backups_deleted:true,services:active.map(unit=>({unit,state:unitState(unit)})),
      credentials:fresh.credentials};
  } catch(error) {
    if(!irreversible&&moved.length) {
      ctl("stop",...units);
      for(const name of moved.reverse()) {
        const current=path.join(ROOT,name);
        if(fs.existsSync(current))fs.rmSync(current,{recursive:true});
        fs.renameSync(path.join(dir,"old-"+name),current);
      }
      if(active.length)ctl("start",...active);
      fs.rmSync(dir,{recursive:true});
    } else if(!irreversible) {
      if(active.length)ctl("start",...active);
      fs.rmSync(dir,{recursive:true});
    }
    throw error;
  }
}
(async()=>{checkTarget(); const result=mode==="rehearse"?await rehearse():mode==="reset"?await reset():null;
  assert(result,"Unknown mode"); process.stdout.write(JSON.stringify(result)+"\n");
})().catch(error=>{process.stderr.write(JSON.stringify({status:"failed",phase,error_name:error.name,error_code:error.code||null})+"\n");process.exitCode=1;});
