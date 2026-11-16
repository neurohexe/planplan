"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { AppError } = require("./errors.js");
const { grantAuditEvent, planIdmGrant, planIdmRevoke, revokeAuditEvent } = require("./idm.js");
const { iso } = require("./time.js");

function parseJson(value, fallback = null) {
  if (value == null || value === "") return fallback;
  return JSON.parse(value);
}

function json(value) {
  return JSON.stringify(value ?? null);
}

// В режиме IDM карточку сохраняют только с той ролью и активностью, которые были при открытии:
// если IDM успел отозвать или изменить роль, запись старых данных вернула бы доступ в обход IDM.
function assertExpectedUser(current, expect) {
  if (!expect) return;
  if ((expect.active && Number(current.active) !== 1) || (expect.role && current.role !== expect.role)) {
    throw new AppError("Доступ сотрудника изменился в IDM: обновите страницу и повторите", 409, "idm_access_changed");
  }
}

function groupIdmAccounts(rows) {
  const accounts = new Map();
  for (const row of rows) {
    if (!accounts.has(row.staff_login)) {
      accounts.set(row.staff_login, { staffLogin: row.staff_login, role: row.role, active: true, idmRoles: [] });
    }
    if (row.idm_role) accounts.get(row.staff_login).idmRoles.push(row.idm_role);
  }
  return [...accounts.values()];
}

function publicUser(row, access = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    staffLogin: row.staff_login,
    staffUidBound: Boolean(row.staff_uid),
    role: row.role,
    active: row.active === 1,
    archived: row.active !== 1,
    defaultLocationAccess: row.default_location_access || "hidden",
    locationAccess: access,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  };
}

class SqliteStore {
  constructor(databasePath, { initialState }) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.databasePath = databasePath;
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this._migrate();
    this._ensureState(initialState);
  }

  close() {
    this.db.close();
  }

  _migrate() {
    const directory = path.join(__dirname, "..", "migrations", "sqlite");
    const migrations = fs.readdirSync(directory)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    for (const file of migrations) {
      const version = Number.parseInt(file, 10);
      if (version !== 1) {
        const applied = this.db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version);
        if (applied) continue;
      }
      this.db.exec(fs.readFileSync(path.join(directory, file), "utf8"));
      this.db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(version, iso());
    }
  }

  _ensureState(initialState) {
    const state = initialState();
    this.db.prepare(`
      INSERT OR IGNORE INTO application_state(singleton, revision, schema_version, body_json, updated_at)
      VALUES (1, ?, ?, ?, ?)
    `).run(Number(state.revision) || 0, Number(state.schemaVersion) || 1, json(state), iso());
  }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  getState() {
    const row = this.db.prepare("SELECT revision, schema_version, body_json, updated_at FROM application_state WHERE singleton = 1").get();
    return { ...parseJson(row.body_json, {}), revision: Number(row.revision), schemaVersion: Number(row.schema_version) };
  }

  checkReady() {
    const row = this.db.prepare(
      "SELECT revision FROM application_state WHERE singleton = 1"
    ).get();
    if (!row) throw new Error("application_state is not initialized");
    return { revision: Number(row.revision) };
  }

  saveState(state, expectedRevision) {
    const result = this.db.prepare(`
      UPDATE application_state
      SET revision = ?, schema_version = ?, body_json = ?, updated_at = ?
      WHERE singleton = 1 AND revision = ?
    `).run(Number(state.revision), Number(state.schemaVersion), json(state), iso(), Number(expectedRevision));
    return Number(result.changes) === 1;
  }

  commitStateMutation({ expectedRevision, nextState, audit }) {
    return this.transaction(() => {
      if (!this.saveState(nextState, expectedRevision)) return { saved: false };
      return { saved: true, eventId: this.appendAudit(audit), idempotent: false };
    });
  }

  countUsers(role = null) {
    const row = role
      ? this.db.prepare("SELECT count(*) AS count FROM users WHERE role = ? AND active = 1").get(role)
      : this.db.prepare("SELECT count(*) AS count FROM users").get();
    return Number(row.count);
  }

  getUser(id) {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
  }

  getUserByStaffLogin(login) {
    return this.db.prepare("SELECT * FROM users WHERE staff_login = ?").get(login) || null;
  }

  getUserByStaffUid(uid) {
    return this.db.prepare("SELECT * FROM users WHERE staff_uid = ?").get(uid) || null;
  }

  // Локальная роль/активность/ACL сохраняются для управляемого возврата. Они не
  // разрешают корпоративный вход; новый профиль в прежнем режиме неактивен.
  ensureCorporateProfile({ uid, login, name, newUserId }) {
    return this.transaction(() => {
      const byUid = this.getUserByStaffUid(uid);
      const byLogin = this.getUserByStaffLogin(login);
      if ((byUid && byLogin && byUid.id !== byLogin.id)
          || (byLogin?.staff_uid && byLogin.staff_uid !== uid)) {
        throw new AppError("Корпоративная личность конфликтует с прежним профилем", 403, "staff_identity_conflict");
      }
      const existing = byUid || byLogin;
      if (existing) {
        this.db.prepare("UPDATE users SET staff_uid = ?, staff_login = ?, name_key = ?, updated_at = ? WHERE id = ?")
          .run(uid, login, `staff:${login}`, iso(), existing.id);
        return this.getUser(existing.id);
      }
      this.db.prepare(`
        INSERT INTO users(id, name, name_key, staff_login, staff_uid, role, active, default_location_access, created_at)
        VALUES (?, ?, ?, ?, ?, 'user', 0, 'hidden', ?)
      `).run(newUserId, name || login, `staff:${login}`, login, uid, iso());
      return this.getUser(newUserId);
    });
  }

  bindStaffUid(id, uid) {
    this.db.prepare(`
      UPDATE users
      SET staff_uid = ?, updated_at = ?
      WHERE id = ? AND active = 1 AND (staff_uid IS NULL OR staff_uid = ?)
    `).run(uid, iso(), id, uid);
    return this.getUser(id);
  }

  listUsers() {
    const rows = this.db.prepare(`
      SELECT * FROM users
      ORDER BY name_key, id
    `).all();
    return rows.map((row) => publicUser(row, this.getLocationAccess(row.id)));
  }

  publicUser(id) {
    const row = this.getUser(id);
    return publicUser(row, row ? this.getLocationAccess(row.id) : {});
  }

  createUser(input) {
    this.db.prepare(`
      INSERT INTO users(
        id, name, name_key, staff_login, staff_uid, role, default_location_access, active,
        created_at, created_by_id, updated_at, updated_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL)
    `).run(
      input.id, input.name, input.nameKey, input.staffLogin, input.staffUid || null,
      input.role, input.defaultLocationAccess === "view" ? "view" : "hidden",
      input.createdAt || iso(), input.createdById || null
    );
    this.replaceLocationAccess(input.id, input.locationAccess || {});
    return this.publicUser(input.id);
  }

  updateUser(id, changes) {
    return this.transaction(() => {
      const current = this.getUser(id);
      if (!current) return null;
      assertExpectedUser(current, changes.expect);
      return this.writeUser(id, current, changes);
    });
  }

  writeUser(id, current, changes) {
    this.db.prepare(`
      UPDATE users SET
        name = ?, name_key = ?, staff_login = ?, staff_uid = ?, role = ?,
        default_location_access = ?, active = ?, updated_at = ?, updated_by_id = ?
      WHERE id = ?
    `).run(
      changes.name ?? current.name,
      changes.nameKey ?? current.name_key,
      changes.staffLogin ?? current.staff_login,
      changes.staffUid ?? current.staff_uid,
      changes.role ?? current.role,
      changes.defaultLocationAccess ?? current.default_location_access,
      changes.active == null ? current.active : (changes.active ? 1 : 0),
      changes.updatedAt || iso(),
      changes.updatedById || null,
      id
    );
    if (changes.locationAccess) this.replaceLocationAccess(id, changes.locationAccess);
    return this.publicUser(id);
  }

  getLocationAccess(userId) {
    return Object.fromEntries(this.db.prepare(
      "SELECT location_id, access FROM user_location_access WHERE user_id = ? ORDER BY location_id"
    ).all(userId).map((row) => [row.location_id, row.access]));
  }

  replaceLocationAccess(userId, access) {
    this.db.prepare("DELETE FROM user_location_access WHERE user_id = ?").run(userId);
    const statement = this.db.prepare(
      "INSERT INTO user_location_access(user_id, location_id, access) VALUES (?, ?, ?)"
    );
    Object.entries(access || {}).forEach(([locationId, level]) => {
      if (["hidden", "view", "edit"].includes(level)) statement.run(userId, locationId, level);
    });
  }

  // Один запрос — один согласованный снимок для get-roles.
  listIdmAccounts() {
    return groupIdmAccounts(this.db.prepare(`
      SELECT u.staff_login, u.role, r.role AS idm_role
      FROM users u LEFT JOIN idm_roles r ON r.staff_login = u.staff_login
      WHERE u.active = 1 AND u.staff_login IS NOT NULL
      ORDER BY u.staff_login, r.role
    `).all());
  }

  // Смена Staff-логина при входе: роли IDM переезжают вместе с аккаунтом.
  renameStaffLogin(userId, fromLogin, toLogin) {
    return this.transaction(() => {
      this.db.prepare("UPDATE users SET staff_login = ?, name_key = ?, updated_at = ?, updated_by_id = NULL WHERE id = ?")
        .run(toLogin, `staff:${toLogin}`, iso(), userId);
      if (fromLogin) {
        this.db.prepare(`
          INSERT OR IGNORE INTO idm_roles(staff_login, role, granted_at)
          SELECT ?, role, granted_at FROM idm_roles WHERE staff_login = ?
        `).run(toLogin, fromLogin);
        this.db.prepare("DELETE FROM idm_roles WHERE staff_login = ?").run(fromLogin);
      }
      return this.publicUser(userId);
    });
  }

  idmRolesFor(staffLogin) {
    return this.db.prepare("SELECT role FROM idm_roles WHERE staff_login = ?").all(staffLogin).map((row) => row.role);
  }

  grantIdmRole({ staffLogin, role, newUserId, now = iso(), requestId = null }) {
    return this.transaction(() => {
      const user = this.getUserByStaffLogin(staffLogin);
      const plan = planIdmGrant({ rows: this.idmRolesFor(staffLogin), user, role });
      if (plan.replaceRoles) this.db.prepare("DELETE FROM idm_roles WHERE staff_login = ?").run(staffLogin);
      if (plan.insertRole) {
        this.db.prepare("INSERT OR IGNORE INTO idm_roles(staff_login, role, granted_at) VALUES (?, ?, ?)")
          .run(staffLogin, role, now);
      }
      const userId = plan.createUser ? newUserId : user.id;
      if (plan.createUser) {
        this.db.prepare(`
          INSERT INTO users(
            id, name, name_key, staff_login, staff_uid, role, default_location_access, active,
            created_at, created_by_id, updated_at, updated_by_id
          ) VALUES (?, ?, ?, ?, NULL, ?, 'hidden', 1, ?, NULL, NULL, NULL)
        `).run(userId, staffLogin, `staff:${staffLogin}`, staffLogin, plan.effectiveRole, now);
      } else if (plan.reactivate) {
        this.db.prepare(`
          UPDATE users SET role = ?, active = 1, default_location_access = 'hidden', updated_at = ?, updated_by_id = NULL
          WHERE id = ?
        `).run(plan.effectiveRole, now, userId);
        this.db.prepare("DELETE FROM user_location_access WHERE user_id = ?").run(userId);
      } else {
        this.db.prepare("UPDATE users SET role = ?, updated_at = ?, updated_by_id = NULL WHERE id = ?")
          .run(plan.effectiveRole, now, userId);
      }
      this.appendAudit({ ...grantAuditEvent({ userId, staffLogin, role, plan, requestId }), createdAt: now });
      return {
        alreadyGranted: plan.alreadyGranted,
        created: plan.createUser,
        reactivated: plan.reactivate,
        userId,
        effectiveRole: plan.effectiveRole
      };
    });
  }

  revokeIdmRole({ staffLogin, role, fired = false, now = iso(), requestId = null }) {
    return this.transaction(() => {
      const user = this.getUserByStaffLogin(staffLogin);
      const plan = planIdmRevoke({ rows: this.idmRolesFor(staffLogin), user, role });
      if (plan.deleteRole) {
        this.db.prepare("DELETE FROM idm_roles WHERE staff_login = ? AND role = ?").run(staffLogin, role);
      }
      if (!plan.wasGranted) return { wasGranted: false, deactivated: false, userId: user?.id || null, sessionIds: [] };
      let sessionIds = [];
      if (user && plan.deactivate) {
        sessionIds = this.db.prepare("SELECT id FROM sessions WHERE user_id = ?").all(user.id).map((row) => row.id);
        this.db.prepare(`
          UPDATE users SET active = 0, default_location_access = 'hidden', updated_at = ?, updated_by_id = NULL
          WHERE id = ?
        `).run(now, user.id);
        this.db.prepare("DELETE FROM user_location_access WHERE user_id = ?").run(user.id);
        this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
        this.db.prepare("DELETE FROM edit_locks WHERE owner_user_id = ?").run(user.id);
      } else if (user) {
        this.db.prepare("UPDATE users SET role = ?, updated_at = ?, updated_by_id = NULL WHERE id = ?")
          .run(plan.effectiveRole, now, user.id);
      }
      this.appendAudit({
        ...revokeAuditEvent({ userId: user?.id || null, staffLogin, role, fired, plan, requestId }),
        createdAt: now
      });
      return {
        wasGranted: true,
        deactivated: plan.deactivate,
        userId: user?.id || null,
        effectiveRole: plan.effectiveRole,
        sessionIds
      };
    });
  }

  createSession(input) {
    this.deleteLocksByUser(input.userId);
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(input.userId);
    this.db.prepare(`
      INSERT INTO sessions(id, user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent, auth_mode, auth_role, auth_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id, input.userId, input.tokenHash, input.createdAt, input.createdAt,
      input.expiresAt, input.ip || null, input.userAgent || null, input.authMode || "legacy", input.authRole || null,
      input.authExpiresAt || null
    );
    return input.id;
  }

  getActiveUserSession(userId) {
    return this.db.prepare("SELECT id FROM sessions WHERE user_id = ?").get(userId) || null;
  }

  getSessionById(id) {
    const row = this.db.prepare("SELECT token_hash FROM sessions WHERE id = ?").get(id);
    return row ? this.getSessionByTokenHash(row.token_hash) : null;
  }

  listCorporateSessions() {
    return this.db.prepare(`
      SELECT s.id, s.user_id AS userId, s.auth_role AS role, s.expires_at AS expiresAt,
             s.auth_expires_at AS authExpiresAt, u.staff_uid AS uid, u.name
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.auth_mode = 'corporate-idm'
    `).all();
  }

  updateSessionRole(id, role) {
    this.db.prepare("UPDATE sessions SET auth_role = ? WHERE id = ? AND auth_mode = 'corporate-idm'").run(role, id);
  }

  getSessionByTokenHash(hash, now = iso()) {
    const row = this.db.prepare(`
      SELECT s.*, u.name, u.name_key, u.staff_login, u.staff_uid, u.role, u.default_location_access,
             u.active, u.created_at AS user_created_at,
             u.updated_at AS user_updated_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND (u.active = 1 OR s.auth_mode = 'corporate-idm')
    `).get(hash, now);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      authMode: row.auth_mode,
      authRole: row.auth_role,
      authExpiresAt: row.auth_expires_at,
      user: {
        id: row.user_id,
        name: row.name,
        name_key: row.name_key,
        staff_login: row.staff_login,
        staff_uid: row.staff_uid,
        role: row.role,
        default_location_access: row.default_location_access,
        active: row.active,
        created_at: row.user_created_at,
        updated_at: row.user_updated_at
      }
    };
  }

  touchSession(id, expiresAt) {
    this.db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?")
      .run(iso(), expiresAt, id);
  }

  deleteSession(id) {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  deleteUserSessions(userId) {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  purgeExpiredSessions(now = iso()) {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  }

  // Личный код доступа: одна строка на пользователя, в базе только хэш (см. service.js).
  getAccessCode(userId) {
    return this.db.prepare("SELECT * FROM access_codes WHERE user_id = ?").get(userId) || null;
  }

  // Новый код заменяет прежний и сразу обнуляет счётчик ошибок и блокировку.
  saveAccessCode({ userId, codeHash, salt, kdfParams, issuedAt }) {
    this.db.prepare(`
      INSERT INTO access_codes(
        user_id, code_hash, salt, kdf_params, issued_at, failed_attempts, locked_until, last_failed_at
      ) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL)
      ON CONFLICT(user_id) DO UPDATE SET
        code_hash = excluded.code_hash,
        salt = excluded.salt,
        kdf_params = excluded.kdf_params,
        issued_at = excluded.issued_at,
        failed_attempts = 0,
        locked_until = NULL,
        last_failed_at = NULL
    `).run(userId, codeHash, salt, json(kdfParams), issuedAt);
  }

  // Неверный код: счётчик +1, на maxFailures-й ошибке подряд ставится locked_until. Всё делается в одной
  // транзакции BEGIN IMMEDIATE, поэтому параллельные попытки (и из другого процесса с этой же базой)
  // не теряют друг друга. Пока логин заблокирован, ничего не меняется: новые попытки блокировку не
  // продлевают. Когда блокировка закончилась, счёт начинается заново.
  recordAccessCodeFailure(userId, { now = iso(), maxFailures, lockMs }) {
    return this.transaction(() => {
      const current = this.getAccessCode(userId);
      if (!current) return null;
      if (current.locked_until && current.locked_until > now) {
        return { failedAttempts: current.failed_attempts, lockedUntil: current.locked_until, locked: true };
      }
      const failedAttempts = (current.locked_until ? 0 : current.failed_attempts) + 1;
      const lockedUntil = failedAttempts >= maxFailures ? iso(Date.parse(now) + lockMs) : null;
      this.db.prepare(
        "UPDATE access_codes SET failed_attempts = ?, locked_until = ?, last_failed_at = ? WHERE user_id = ?"
      ).run(failedAttempts, lockedUntil, now, userId);
      return { failedAttempts, lockedUntil, locked: lockedUntil !== null };
    });
  }

  // Успешный вход обнуляет счётчик. Возвращает false, если пока проверялся код, логин успели
  // заблокировать (параллельные неверные попытки) или код заменили: такой вход надо отклонить.
  resetAccessCodeFailures(userId, { now = iso(), codeHash }) {
    const result = this.db.prepare(`
      UPDATE access_codes SET failed_attempts = 0, locked_until = NULL
      WHERE user_id = ? AND code_hash = ? AND (locked_until IS NULL OR locked_until <= ?)
    `).run(userId, codeHash, now);
    return Number(result.changes) === 1;
  }

  appendAudit(event) {
    const id = event.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO audit_events(
        id, revision, actor_id, actor_name, session_id, action, mutation_id,
        entity_type, entity_id, location_id, payload_json, before_json, after_json,
        reverses_event_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, event.revision ?? null, event.actorId || null, event.actorName || "Система",
      event.sessionId || null, event.action, event.mutationId || null,
      event.entityType || null, event.entityId || null, event.locationId || null, json(event.payload || {}),
      event.before == null ? null : json(event.before), event.after == null ? null : json(event.after),
      event.reversesEventId || null, event.createdAt || iso()
    );
    return id;
  }

  findAuditByMutationId(mutationId) {
    if (!mutationId) return null;
    return this.db.prepare("SELECT * FROM audit_events WHERE mutation_id = ?").get(mutationId) || null;
  }

  listAudit({ actorId = null, limit = 100, before = null } = {}) {
    let sql = "SELECT * FROM audit_events WHERE 1 = 1";
    const params = [];
    if (actorId) { sql += " AND actor_id = ?"; params.push(actorId); }
    if (before) { sql += " AND created_at < ?"; params.push(before); }
    sql += " ORDER BY created_at DESC, id DESC LIMIT ?";
    params.push(Math.min(500, Math.max(1, Number(limit) || 100)));
    return this.db.prepare(sql).all(...params).map((row) => ({
      id: row.id,
      revision: row.revision,
      actorId: row.actor_id,
      actorName: row.actor_name,
      sessionId: row.session_id,
      action: row.action,
      mutationId: row.mutation_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      locationId: row.location_id,
      payload: parseJson(row.payload_json, {}),
      reversesEventId: row.reverses_event_id,
      createdAt: row.created_at
    }));
  }

  cleanupLocks(now = iso()) {
    this.db.prepare("DELETE FROM edit_locks WHERE expires_at <= ?").run(now);
  }

  acquireLock(input) {
    return this.transaction(() => {
      this.cleanupLocks(input.now);
      const existing = this.db.prepare(`
        SELECT l.*, u.name AS owner_name
        FROM edit_locks l JOIN users u ON u.id = l.owner_user_id
        WHERE resource_type = ? AND resource_id = ?
      `).get(input.resourceType, input.resourceId);
      if (existing) return { acquired: false, lock: existing };
      this.db.prepare(`
        INSERT INTO edit_locks(
          resource_type, resource_id, owner_user_id, owner_session_id,
          token_hash, acquired_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.resourceType, input.resourceId, input.userId, input.sessionId,
        input.tokenHash, input.now, input.expiresAt
      );
      return { acquired: true };
    });
  }

  getLock(resourceType, resourceId, now = iso()) {
    this.cleanupLocks(now);
    return this.db.prepare(`
      SELECT l.*, u.name AS owner_name
      FROM edit_locks l JOIN users u ON u.id = l.owner_user_id
      WHERE resource_type = ? AND resource_id = ?
    `).get(resourceType, resourceId) || null;
  }

  refreshLock(resourceType, resourceId, sessionId, hash, expiresAt) {
    const result = this.db.prepare(`
      UPDATE edit_locks SET expires_at = ?
      WHERE resource_type = ? AND resource_id = ? AND owner_session_id = ? AND token_hash = ?
    `).run(expiresAt, resourceType, resourceId, sessionId, hash);
    return Number(result.changes) === 1;
  }

  releaseLock(resourceType, resourceId, sessionId, hash) {
    const result = this.db.prepare(`
      DELETE FROM edit_locks
      WHERE resource_type = ? AND resource_id = ? AND owner_session_id = ? AND token_hash = ?
    `).run(resourceType, resourceId, sessionId, hash);
    return Number(result.changes) === 1;
  }

  releaseSessionLocks(sessionId) {
    this.db.prepare("DELETE FROM edit_locks WHERE owner_session_id = ?").run(sessionId);
  }

  deleteLocksByUser(userId) {
    this.db.prepare("DELETE FROM edit_locks WHERE owner_user_id = ?").run(userId);
  }

  hideWarning(userId, warningId, fingerprint) {
    this.db.prepare(`
      INSERT INTO personal_warning_state(user_id, warning_id, fingerprint, hidden_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, warning_id) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        hidden_at = excluded.hidden_at
    `).run(userId, warningId, fingerprint || "", iso());
  }

  hiddenWarnings(userId) {
    return new Map(this.db.prepare(
      "SELECT warning_id, fingerprint FROM personal_warning_state WHERE user_id = ?"
    ).all(userId).map((row) => [row.warning_id, row.fingerprint]));
  }

  createSyncJob(input) {
    const id = input.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO sync_jobs(
        id, kind, status, requested_by_id, session_id, scope_json, created_at,
        cancel_if_session_ends
      ) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)
    `).run(
      id, input.kind, input.requestedById || null, input.sessionId || null,
      json(input.scope || {}), input.createdAt || iso(), input.cancelIfSessionEnds ? 1 : 0
    );
    return id;
  }

  activeSyncJob(kind) {
    return this.db.prepare(`
      SELECT * FROM sync_jobs
      WHERE kind = ? AND status IN ('queued', 'running', 'waiting_for_locks')
      ORDER BY created_at LIMIT 1
    `).get(kind) || null;
  }

  getSyncJob(id) {
    const row = this.db.prepare("SELECT * FROM sync_jobs WHERE id = ?").get(id);
    if (!row) return null;
    return { ...row, scope: parseJson(row.scope_json, {}), result: parseJson(row.result_json, null) };
  }
}

module.exports = { SqliteStore, iso, parseJson, publicUser };
