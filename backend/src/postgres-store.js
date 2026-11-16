"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { AppError } = require("./errors.js");
const { grantAuditEvent, planIdmGrant, planIdmRevoke, revokeAuditEvent } = require("./idm.js");
const { iso } = require("./time.js");

const MIGRATION_LOCK_KEY = 18810424;
// Пространство ключей для pg_advisory_xact_lock(int, int): запросы IDM по одному логину идут по очереди.
const IDM_ROLE_LOCK_NAMESPACE = 18810425;

function parseJson(value, fallback = null) {
  if (value == null || value === "") return fallback;
  return typeof value === "string" ? JSON.parse(value) : value;
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

function auditRecord(row) {
  return row ? {
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
  } : null;
}

function poolOptions(config) {
  const sslMode = config.databaseSsl;
  if (!["disable", "require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new AppError("Некорректный PLAN_FACT_DATABASE_SSL", 500, "postgres_ssl_invalid");
  }
  if (config.production && sslMode === "disable") {
    throw new AppError("TLS для PostgreSQL обязателен в production", 500, "postgres_ssl_required");
  }
  if (config.production && /[?&]sslmode=/i.test(config.databaseUrl)) {
    throw new AppError(
      "Не задавайте sslmode в PLAN_FACT_DATABASE_URL; используйте PLAN_FACT_DATABASE_SSL и CA file",
      500,
      "postgres_ssl_invalid"
    );
  }
  const options = {
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: config.databaseStatementTimeoutMs,
    application_name: "plan-fact"
  };
  if (sslMode !== "disable") {
    options.ssl = {
      rejectUnauthorized: true,
      ...(config.databaseCaFile ? { ca: fs.readFileSync(config.databaseCaFile, "utf8") } : {})
    };
  }
  return options;
}

class PostgresStore {
  constructor(pool) {
    this.pool = pool;
  }

  static async create(config, { initialState }) {
    const store = new PostgresStore(new Pool(poolOptions(config)));
    try {
      await store.initialize(initialState);
      return store;
    } catch (error) {
      await store.close().catch(() => {});
      throw error;
    }
  }

  async initialize(initialState) {
    await this._migrate();
    await this._ensureState(initialState);
  }

  async close() {
    await this.pool.end();
  }

  async _migrate() {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `);
      const directory = path.join(__dirname, "..", "migrations", "postgres");
      const migrations = fs.readdirSync(directory)
        .filter((file) => /^\d+_.+\.sql$/.test(file))
        .sort();
      for (const file of migrations) {
        const version = Number.parseInt(file, 10);
        const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
        if (applied.rowCount) continue;
        await client.query("BEGIN");
        try {
          await client.query(fs.readFileSync(path.join(directory, file), "utf8"));
          await client.query("INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)", [version, iso()]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
      client.release();
    }
  }

  async _ensureState(initialState) {
    const state = initialState();
    await this.pool.query(`
      INSERT INTO application_state(singleton, revision, schema_version, body_json, updated_at)
      VALUES (1, $1, $2, $3::jsonb, $4)
      ON CONFLICT(singleton) DO NOTHING
    `, [Number(state.revision) || 0, Number(state.schemaVersion) || 1, json(state), iso()]);
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getState(executor = this.pool) {
    const result = await executor.query(
      "SELECT revision, schema_version, body_json FROM application_state WHERE singleton = 1"
    );
    const row = result.rows[0];
    return { ...parseJson(row.body_json, {}), revision: Number(row.revision), schemaVersion: Number(row.schema_version) };
  }

  async checkReady() {
    const result = await this.pool.query(
      "SELECT revision FROM application_state WHERE singleton = 1"
    );
    if (result.rowCount !== 1) throw new Error("application_state is not initialized");
    return { revision: Number(result.rows[0].revision) };
  }

  async saveState(state, expectedRevision, executor = this.pool) {
    const result = await executor.query(`
      UPDATE application_state
      SET revision = $1, schema_version = $2, body_json = $3::jsonb, updated_at = $4
      WHERE singleton = 1 AND revision = $5
    `, [Number(state.revision), Number(state.schemaVersion), json(state), iso(), Number(expectedRevision)]);
    return result.rowCount === 1;
  }

  async commitStateMutation({ mutationId, expectedRevision, nextState, audit }) {
    return this.transaction(async (client) => {
      if (mutationId) {
        const existing = await this.findAuditByMutationId(mutationId, client);
        if (existing) return { saved: true, eventId: existing.id, idempotent: true };
      }
      if (!await this.saveState(nextState, expectedRevision, client)) return { saved: false };
      const eventId = await this.appendAudit(audit, client);
      return { saved: true, eventId, idempotent: false };
    });
  }

  async countUsers(role = null) {
    const result = role
      ? await this.pool.query("SELECT count(*)::int AS count FROM users WHERE role = $1 AND active = 1", [role])
      : await this.pool.query("SELECT count(*)::int AS count FROM users");
    return Number(result.rows[0].count);
  }

  async getUser(id, executor = this.pool) {
    return (await executor.query("SELECT * FROM users WHERE id = $1", [id])).rows[0] || null;
  }

  async getUserByStaffLogin(login, executor = this.pool) {
    return (await executor.query("SELECT * FROM users WHERE staff_login = $1", [login])).rows[0] || null;
  }

  async getUserByStaffUid(uid, executor = this.pool) {
    return (await executor.query("SELECT * FROM users WHERE staff_uid = $1", [uid])).rows[0] || null;
  }

  async bindStaffUid(id, uid) {
    const result = await this.pool.query(`
      UPDATE users
      SET staff_uid = $1, updated_at = $2
      WHERE id = $3 AND active = 1 AND (staff_uid IS NULL OR staff_uid = $1)
      RETURNING *
    `, [uid, iso(), id]);
    return result.rows[0] || this.getUser(id);
  }

  async listUsers() {
    const rows = (await this.pool.query(`
      SELECT * FROM users
      ORDER BY name_key, id
    `)).rows;
    const result = [];
    for (const row of rows) result.push(publicUser(row, await this.getLocationAccess(row.id)));
    return result;
  }

  async publicUser(id, executor = this.pool) {
    const row = await this.getUser(id, executor);
    return publicUser(row, row ? await this.getLocationAccess(row.id, executor) : {});
  }

  async createUser(input) {
    return this.transaction(async (client) => {
      await client.query(`
        INSERT INTO users(
          id, name, name_key, staff_login, staff_uid, role, default_location_access, active,
          created_at, created_by_id, updated_at, updated_by_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, NULL, NULL)
      `, [
        input.id, input.name, input.nameKey, input.staffLogin, input.staffUid || null,
        input.role, input.defaultLocationAccess === "view" ? "view" : "hidden",
        input.createdAt || iso(), input.createdById || null
      ]);
      await this.replaceLocationAccess(input.id, input.locationAccess || {}, client);
      return this.publicUser(input.id, client);
    });
  }

  async updateUser(id, changes) {
    return this.transaction(async (client) => {
      // FOR UPDATE: строку не изменит параллельный запрос IDM между чтением и записью.
      const current = (await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [id])).rows[0] || null;
      if (!current) return null;
      assertExpectedUser(current, changes.expect);
      await client.query(`
        UPDATE users SET
          name = $1, name_key = $2, staff_login = $3, staff_uid = $4, role = $5,
          default_location_access = $6, active = $7, updated_at = $8, updated_by_id = $9
        WHERE id = $10
      `, [
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
      ]);
      if (changes.locationAccess) await this.replaceLocationAccess(id, changes.locationAccess, client);
      return this.publicUser(id, client);
    });
  }

  async getLocationAccess(userId, executor = this.pool) {
    const rows = (await executor.query(
      "SELECT location_id, access FROM user_location_access WHERE user_id = $1 ORDER BY location_id",
      [userId]
    )).rows;
    return Object.fromEntries(rows.map((row) => [row.location_id, row.access]));
  }

  async replaceLocationAccess(userId, access, executor = this.pool) {
    await executor.query("DELETE FROM user_location_access WHERE user_id = $1", [userId]);
    for (const [locationId, level] of Object.entries(access || {})) {
      if (["hidden", "view", "edit"].includes(level)) {
        await executor.query(
          "INSERT INTO user_location_access(user_id, location_id, access) VALUES ($1, $2, $3)",
          [userId, locationId, level]
        );
      }
    }
  }

  // Один запрос — один согласованный снимок для get-roles.
  async listIdmAccounts() {
    return groupIdmAccounts((await this.pool.query(`
      SELECT u.staff_login, u.role, r.role AS idm_role
      FROM users u LEFT JOIN idm_roles r ON r.staff_login = u.staff_login
      WHERE u.active = 1 AND u.staff_login IS NOT NULL
      ORDER BY u.staff_login, r.role
    `)).rows);
  }

  // Смена Staff-логина при входе: роли IDM переезжают вместе с аккаунтом. Блокировки обоих логинов
  // берутся в одном порядке, как и у запросов IDM.
  async renameStaffLogin(userId, fromLogin, toLogin) {
    return this.transaction(async (client) => {
      for (const login of [fromLogin, toLogin].filter(Boolean).sort()) {
        await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [IDM_ROLE_LOCK_NAMESPACE, login]);
      }
      await client.query(
        "UPDATE users SET staff_login = $1, name_key = $2, updated_at = $3, updated_by_id = NULL WHERE id = $4",
        [toLogin, `staff:${toLogin}`, iso(), userId]
      );
      if (fromLogin) {
        await client.query(`
          INSERT INTO idm_roles(staff_login, role, granted_at)
          SELECT $1, role, granted_at FROM idm_roles WHERE staff_login = $2
          ON CONFLICT DO NOTHING
        `, [toLogin, fromLogin]);
        await client.query("DELETE FROM idm_roles WHERE staff_login = $1", [fromLogin]);
      }
      return this.publicUser(userId, client);
    });
  }

  async lockedIdmState(client, staffLogin) {
    await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [IDM_ROLE_LOCK_NAMESPACE, staffLogin]);
    const rows = (await client.query("SELECT role FROM idm_roles WHERE staff_login = $1", [staffLogin])).rows
      .map((row) => row.role);
    return { rows, user: await this.getUserByStaffLogin(staffLogin, client) };
  }

  async grantIdmRole({ staffLogin, role, newUserId, now = iso(), requestId = null }) {
    return this.transaction(async (client) => {
      const { rows, user } = await this.lockedIdmState(client, staffLogin);
      const plan = planIdmGrant({ rows, user, role });
      if (plan.replaceRoles) await client.query("DELETE FROM idm_roles WHERE staff_login = $1", [staffLogin]);
      if (plan.insertRole) {
        await client.query(
          "INSERT INTO idm_roles(staff_login, role, granted_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
          [staffLogin, role, now]
        );
      }
      const userId = plan.createUser ? newUserId : user.id;
      if (plan.createUser) {
        await client.query(`
          INSERT INTO users(
            id, name, name_key, staff_login, staff_uid, role, default_location_access, active,
            created_at, created_by_id, updated_at, updated_by_id
          ) VALUES ($1, $2, $3, $4, NULL, $5, 'hidden', 1, $6, NULL, NULL, NULL)
        `, [userId, staffLogin, `staff:${staffLogin}`, staffLogin, plan.effectiveRole, now]);
      } else if (plan.reactivate) {
        await client.query(`
          UPDATE users SET role = $1, active = 1, default_location_access = 'hidden', updated_at = $2, updated_by_id = NULL
          WHERE id = $3
        `, [plan.effectiveRole, now, userId]);
        await client.query("DELETE FROM user_location_access WHERE user_id = $1", [userId]);
      } else {
        await client.query(
          "UPDATE users SET role = $1, updated_at = $2, updated_by_id = NULL WHERE id = $3",
          [plan.effectiveRole, now, userId]
        );
      }
      await this.appendAudit({ ...grantAuditEvent({ userId, staffLogin, role, plan, requestId }), createdAt: now }, client);
      return {
        alreadyGranted: plan.alreadyGranted,
        created: plan.createUser,
        reactivated: plan.reactivate,
        userId,
        effectiveRole: plan.effectiveRole
      };
    });
  }

  async revokeIdmRole({ staffLogin, role, fired = false, now = iso(), requestId = null }) {
    return this.transaction(async (client) => {
      const { rows, user } = await this.lockedIdmState(client, staffLogin);
      const plan = planIdmRevoke({ rows, user, role });
      if (plan.deleteRole) {
        await client.query("DELETE FROM idm_roles WHERE staff_login = $1 AND role = $2", [staffLogin, role]);
      }
      if (!plan.wasGranted) return { wasGranted: false, deactivated: false, userId: user?.id || null, sessionIds: [] };
      let sessionIds = [];
      if (user && plan.deactivate) {
        sessionIds = (await client.query("SELECT id FROM sessions WHERE user_id = $1", [user.id])).rows
          .map((row) => row.id);
        await client.query(`
          UPDATE users SET active = 0, default_location_access = 'hidden', updated_at = $1, updated_by_id = NULL
          WHERE id = $2
        `, [now, user.id]);
        await client.query("DELETE FROM user_location_access WHERE user_id = $1", [user.id]);
        await client.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
        await client.query("DELETE FROM edit_locks WHERE owner_user_id = $1", [user.id]);
      } else if (user) {
        await client.query(
          "UPDATE users SET role = $1, updated_at = $2, updated_by_id = NULL WHERE id = $3",
          [plan.effectiveRole, now, user.id]
        );
      }
      await this.appendAudit({
        ...revokeAuditEvent({ userId: user?.id || null, staffLogin, role, fired, plan, requestId }),
        createdAt: now
      }, client);
      return {
        wasGranted: true,
        deactivated: plan.deactivate,
        userId: user?.id || null,
        effectiveRole: plan.effectiveRole,
        sessionIds
      };
    });
  }

  async createSession(input) {
    await this.pool.query(`
      INSERT INTO sessions(id, user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent)
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
      ON CONFLICT(user_id) DO UPDATE SET
        id = excluded.id, token_hash = excluded.token_hash, created_at = excluded.created_at,
        last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at,
        ip = excluded.ip, user_agent = excluded.user_agent
    `, [input.id, input.userId, input.tokenHash, input.createdAt, input.expiresAt, input.ip || null, input.userAgent || null]);
    return input.id;
  }

  async getActiveUserSession(userId) {
    return (await this.pool.query("SELECT id FROM sessions WHERE user_id = $1", [userId])).rows[0] || null;
  }

  async getSessionByTokenHash(hash, now = iso()) {
    const row = (await this.pool.query(`
      SELECT s.*, u.name, u.name_key, u.staff_login, u.staff_uid, u.role, u.default_location_access,
             u.active, u.created_at AS user_created_at,
             u.updated_at AS user_updated_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.active = 1
    `, [hash, now])).rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
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

  async touchSession(id, expiresAt) {
    await this.pool.query("UPDATE sessions SET last_seen_at = $1, expires_at = $2 WHERE id = $3", [iso(), expiresAt, id]);
  }

  async deleteSession(id) {
    await this.pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  }

  async deleteUserSessions(userId) {
    await this.pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  }

  async purgeExpiredSessions(now = iso()) {
    await this.pool.query("DELETE FROM sessions WHERE expires_at <= $1", [now]);
  }

  async appendAudit(event, executor = this.pool) {
    const id = event.id || crypto.randomUUID();
    await executor.query(`
      INSERT INTO audit_events(
        id, revision, actor_id, actor_name, session_id, action, mutation_id,
        entity_type, entity_id, location_id, payload_json, before_json, after_json,
        reverses_event_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15)
    `, [
      id, event.revision ?? null, event.actorId || null, event.actorName || "Система",
      event.sessionId || null, event.action, event.mutationId || null,
      event.entityType || null, event.entityId || null, event.locationId || null,
      json(event.payload || {}), event.before == null ? null : json(event.before),
      event.after == null ? null : json(event.after), event.reversesEventId || null,
      event.createdAt || iso()
    ]);
    return id;
  }

  async findAuditByMutationId(mutationId, executor = this.pool) {
    if (!mutationId) return null;
    return (await executor.query("SELECT * FROM audit_events WHERE mutation_id = $1", [mutationId])).rows[0] || null;
  }

  async listAudit({ actorId = null, limit = 100, before = null } = {}) {
    const clauses = ["1 = 1"];
    const params = [];
    if (actorId) { params.push(actorId); clauses.push(`actor_id = $${params.length}`); }
    if (before) { params.push(before); clauses.push(`created_at < $${params.length}`); }
    params.push(Math.min(500, Math.max(1, Number(limit) || 100)));
    const rows = (await this.pool.query(`
      SELECT * FROM audit_events
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `, params)).rows;
    return rows.map(auditRecord);
  }

  async cleanupLocks(now = iso(), executor = this.pool) {
    await executor.query("DELETE FROM edit_locks WHERE expires_at <= $1", [now]);
  }

  async acquireLock(input) {
    return this.transaction(async (client) => {
      await this.cleanupLocks(input.now, client);
      const inserted = await client.query(`
        INSERT INTO edit_locks(
          resource_type, resource_id, owner_user_id, owner_session_id,
          token_hash, acquired_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(resource_type, resource_id) DO NOTHING
        RETURNING resource_type
      `, [
        input.resourceType, input.resourceId, input.userId, input.sessionId,
        input.tokenHash, input.now, input.expiresAt
      ]);
      if (inserted.rowCount === 1) return { acquired: true };
      const lock = (await client.query(`
        SELECT l.*, u.name AS owner_name
        FROM edit_locks l JOIN users u ON u.id = l.owner_user_id
        WHERE resource_type = $1 AND resource_id = $2
      `, [input.resourceType, input.resourceId])).rows[0];
      return { acquired: false, lock };
    });
  }

  async getLock(resourceType, resourceId, now = iso()) {
    return this.transaction(async (client) => {
      await this.cleanupLocks(now, client);
      return (await client.query(`
        SELECT l.*, u.name AS owner_name
        FROM edit_locks l JOIN users u ON u.id = l.owner_user_id
        WHERE resource_type = $1 AND resource_id = $2
      `, [resourceType, resourceId])).rows[0] || null;
    });
  }

  async refreshLock(resourceType, resourceId, sessionId, hash, expiresAt) {
    const result = await this.pool.query(`
      UPDATE edit_locks SET expires_at = $1
      WHERE resource_type = $2 AND resource_id = $3 AND owner_session_id = $4 AND token_hash = $5
    `, [expiresAt, resourceType, resourceId, sessionId, hash]);
    return result.rowCount === 1;
  }

  async releaseLock(resourceType, resourceId, sessionId, hash) {
    const result = await this.pool.query(`
      DELETE FROM edit_locks
      WHERE resource_type = $1 AND resource_id = $2 AND owner_session_id = $3 AND token_hash = $4
    `, [resourceType, resourceId, sessionId, hash]);
    return result.rowCount === 1;
  }

  async releaseSessionLocks(sessionId) {
    await this.pool.query("DELETE FROM edit_locks WHERE owner_session_id = $1", [sessionId]);
  }

  async deleteLocksByUser(userId) {
    await this.pool.query("DELETE FROM edit_locks WHERE owner_user_id = $1", [userId]);
  }

  async hideWarning(userId, warningId, fingerprint) {
    await this.pool.query(`
      INSERT INTO personal_warning_state(user_id, warning_id, fingerprint, hidden_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(user_id, warning_id) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        hidden_at = excluded.hidden_at
    `, [userId, warningId, fingerprint || "", iso()]);
  }

  async hiddenWarnings(userId) {
    const rows = (await this.pool.query(
      "SELECT warning_id, fingerprint FROM personal_warning_state WHERE user_id = $1",
      [userId]
    )).rows;
    return new Map(rows.map((row) => [row.warning_id, row.fingerprint]));
  }

  async createSyncJob(input) {
    const id = input.id || crypto.randomUUID();
    await this.pool.query(`
      INSERT INTO sync_jobs(
        id, kind, status, requested_by_id, session_id, scope_json, created_at,
        cancel_if_session_ends
      ) VALUES ($1, $2, 'queued', $3, $4, $5::jsonb, $6, $7)
    `, [
      id, input.kind, input.requestedById || null, input.sessionId || null,
      json(input.scope || {}), input.createdAt || iso(), input.cancelIfSessionEnds ? 1 : 0
    ]);
    return id;
  }

  async activeSyncJob(kind) {
    return (await this.pool.query(`
      SELECT * FROM sync_jobs
      WHERE kind = $1 AND status IN ('queued', 'running', 'waiting_for_locks')
      ORDER BY created_at LIMIT 1
    `, [kind])).rows[0] || null;
  }

  async getSyncJob(id) {
    const row = (await this.pool.query("SELECT * FROM sync_jobs WHERE id = $1", [id])).rows[0];
    if (!row) return null;
    return { ...row, scope: parseJson(row.scope_json, {}), result: parseJson(row.result_json, null) };
  }
}

module.exports = { PostgresStore, auditRecord, parseJson, poolOptions, publicUser };
