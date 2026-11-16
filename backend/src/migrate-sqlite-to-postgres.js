#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadConfig } = require("./config.js");
const { PlanFactService } = require("./service.js");
const { PostgresStore } = require("./postgres-store.js");

function usage() {
  return "Использование: node --experimental-sqlite backend/src/migrate-sqlite-to-postgres.js --source <backup.sqlite>";
}

function sourcePath(argv) {
  const index = argv.indexOf("--source");
  if (index < 0 || !argv[index + 1]) throw new Error(usage());
  const resolved = path.resolve(argv[index + 1]);
  if (!fs.statSync(resolved).isFile()) throw new Error("Source SQLite backup не является файлом");
  return resolved;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function rows(db, table) {
  return tableExists(db, table) ? db.prepare(`SELECT * FROM ${table}`).all() : [];
}

async function insertUsers(client, sourceRows) {
  for (const row of sourceRows) {
    await client.query(`
      INSERT INTO users(
        id, name, name_key, staff_login, staff_uid, role, default_location_access, active,
        created_at, created_by_id, updated_at, updated_by_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      row.id, row.name, row.name_key, row.staff_login || null, row.staff_uid || null,
      row.role, row.default_location_access === "view" ? "view" : "hidden",
      row.staff_login ? row.active : 0, row.created_at, row.created_by_id || null,
      row.updated_at || null, row.updated_by_id || null
    ]);
  }
}

async function insertAccess(client, sourceRows) {
  for (const row of sourceRows) {
    await client.query(
      "INSERT INTO user_location_access(user_id, location_id, access) VALUES ($1, $2, $3)",
      [row.user_id, row.location_id, row.access]
    );
  }
}

async function insertAudit(client, sourceRows) {
  for (const row of sourceRows) {
    await client.query(`
      INSERT INTO audit_events(
        id, revision, actor_id, actor_name, session_id, action, mutation_id,
        entity_type, entity_id, location_id, payload_json, before_json, after_json,
        reverses_event_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15)
    `, [
      row.id, row.revision ?? null, row.actor_id || null, row.actor_name,
      row.session_id || null, row.action, row.mutation_id || null,
      row.entity_type || null, row.entity_id || null, row.location_id || null,
      row.payload_json || "{}", row.before_json || null, row.after_json || null,
      row.reverses_event_id || null, row.created_at
    ]);
  }
}

async function insertWarnings(client, sourceRows) {
  for (const row of sourceRows) {
    await client.query(`
      INSERT INTO personal_warning_state(user_id, warning_id, fingerprint, hidden_at)
      VALUES ($1, $2, $3, $4)
    `, [row.user_id, row.warning_id, row.fingerprint, row.hidden_at]);
  }
}

async function insertSyncJobs(client, sourceRows) {
  for (const row of sourceRows) {
    await client.query(`
      INSERT INTO sync_jobs(
        id, kind, status, requested_by_id, session_id, scope_json, result_json,
        error_text, created_at, started_at, finished_at, cancel_if_session_ends
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
    `, [
      row.id, row.kind, row.status, row.requested_by_id || null, row.session_id || null,
      row.scope_json || "{}", row.result_json || null, row.error_text || null,
      row.created_at, row.started_at || null, row.finished_at || null,
      row.cancel_if_session_ends || 0
    ]);
  }
}

async function migrate(sqlitePath, config) {
  if (config.storageDriver !== "postgres") {
    throw new Error("Для миграции задайте PLAN_FACT_STORAGE_DRIVER=postgres");
  }
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  let store;
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get();
    if (String(integrity?.integrity_check || "").toLowerCase() !== "ok") {
      throw new Error("SQLite integrity_check не прошёл");
    }
    const stateRow = db.prepare(
      "SELECT revision, schema_version, body_json, updated_at FROM application_state WHERE singleton = 1"
    ).get();
    if (!stateRow) throw new Error("В SQLite отсутствует application_state");
    const sourceState = {
      ...JSON.parse(stateRow.body_json),
      revision: Number(stateRow.revision),
      schemaVersion: Number(stateRow.schema_version)
    };
    const snapshot = {
      users: rows(db, "users"),
      access: rows(db, "user_location_access"),
      audit: rows(db, "audit_events"),
      warnings: rows(db, "personal_warning_state"),
      syncJobs: rows(db, "sync_jobs")
    };

    store = await PostgresStore.create(config, { initialState: PlanFactService.initialState });
    const migratedCounts = await store.transaction(async (client) => {
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      const counts = await client.query(`
        SELECT
          (SELECT count(*)::int FROM users) AS users,
          (SELECT count(*)::int FROM audit_events) AS audit,
          (SELECT revision FROM application_state WHERE singleton = 1) AS revision
      `);
      const target = counts.rows[0];
      if (Number(target.users) !== 0 || Number(target.audit) !== 0 || Number(target.revision) !== 0) {
        throw new Error("Целевая PostgreSQL не пуста; миграция остановлена без изменений");
      }
      await client.query(`
        UPDATE application_state
        SET revision = $1, schema_version = $2, body_json = $3::jsonb, updated_at = $4
        WHERE singleton = 1
      `, [sourceState.revision, sourceState.schemaVersion, JSON.stringify(sourceState), stateRow.updated_at]);
      await insertUsers(client, snapshot.users);
      await insertAccess(client, snapshot.access);
      await insertAudit(client, snapshot.audit);
      await insertWarnings(client, snapshot.warnings);
      await insertSyncJobs(client, snapshot.syncJobs);
      const targetStateRow = (await client.query(
        "SELECT revision, schema_version, body_json FROM application_state WHERE singleton = 1"
      )).rows[0];
      const targetState = {
        ...targetStateRow.body_json,
        revision: Number(targetStateRow.revision),
        schemaVersion: Number(targetStateRow.schema_version)
      };
      if (digest(sourceState) !== digest(targetState)) {
        throw new Error("Контрольная сумма состояния после миграции не совпала");
      }
      const targetCounts = await client.query(`
        SELECT
          (SELECT count(*)::int FROM users) AS users,
          (SELECT count(*)::int FROM user_location_access) AS access,
          (SELECT count(*)::int FROM audit_events) AS audit,
          (SELECT count(*)::int FROM personal_warning_state) AS warnings,
          (SELECT count(*)::int FROM sync_jobs) AS sync_jobs
      `);
      const verified = targetCounts.rows[0];
      for (const [name, expected] of Object.entries({
        users: snapshot.users.length,
        access: snapshot.access.length,
        audit: snapshot.audit.length,
        warnings: snapshot.warnings.length,
        sync_jobs: snapshot.syncJobs.length
      })) {
        if (Number(verified[name]) !== expected) throw new Error(`Не совпало количество строк: ${name}`);
      }
      return verified;
    });

    process.stdout.write(JSON.stringify({
      status: "ok",
      revision: sourceState.revision,
      stateDigest: digest(sourceState),
      counts: Object.fromEntries(Object.entries(migratedCounts).map(([key, value]) => [key, Number(value)])),
      sessionsMigrated: false,
      locksMigrated: false,
      loginAttemptsMigrated: false
    }) + "\n");
  } finally {
    db.close();
    if (store) await store.close();
  }
}

if (require.main === module) {
  Promise.resolve()
    .then(() => migrate(sourcePath(process.argv.slice(2)), loadConfig()))
    .catch((error) => {
      process.stderr.write(`Миграция не выполнена: ${String(error?.message || "unknown error").slice(0, 500)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { digest, migrate, sourcePath, stable };
