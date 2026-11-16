CREATE TABLE IF NOT EXISTS application_state (
  singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  body_json JSONB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'superadmin')),
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  must_change_pin SMALLINT NOT NULL DEFAULT 1 CHECK (must_change_pin IN (0, 1)),
  active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  created_by_id TEXT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at TEXT,
  updated_by_id TEXT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS user_location_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('view', 'edit')),
  PRIMARY KEY (user_id, location_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_started_at TEXT NOT NULL,
  failures INTEGER NOT NULL,
  next_allowed_at TEXT,
  notified_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  revision INTEGER,
  actor_id TEXT REFERENCES users(id),
  actor_name TEXT NOT NULL,
  session_id TEXT,
  action TEXT NOT NULL,
  mutation_id TEXT UNIQUE,
  entity_type TEXT,
  entity_id TEXT,
  location_id TEXT,
  payload_json JSONB NOT NULL,
  before_json JSONB,
  after_json JSONB,
  reverses_event_id TEXT REFERENCES audit_events(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_revision_idx ON audit_events(revision);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_events(actor_id, created_at);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS audit_location_idx ON audit_events(location_id, created_at);

CREATE OR REPLACE FUNCTION reject_audit_event_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_change();

DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_change();

CREATE TABLE IF NOT EXISTS edit_locks (
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_session_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS edit_locks_expiry_idx ON edit_locks(expires_at);

CREATE TABLE IF NOT EXISTS personal_warning_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  warning_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  hidden_at TEXT NOT NULL,
  PRIMARY KEY (user_id, warning_id)
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting_for_locks', 'succeeded', 'partially_succeeded', 'failed', 'cancelled')),
  requested_by_id TEXT REFERENCES users(id),
  session_id TEXT,
  scope_json JSONB NOT NULL,
  result_json JSONB,
  error_text TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  cancel_if_session_ends SMALLINT NOT NULL DEFAULT 0 CHECK (cancel_if_session_ends IN (0, 1))
);

CREATE INDEX IF NOT EXISTS sync_jobs_status_idx ON sync_jobs(kind, status, created_at);
