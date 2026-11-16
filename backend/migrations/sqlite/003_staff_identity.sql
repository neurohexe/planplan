PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

DELETE FROM sessions;
DELETE FROM edit_locks;
DROP TABLE IF EXISTS login_attempts;

CREATE TABLE users_staff_identity (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  staff_login TEXT,
  staff_uid TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'superadmin')),
  default_location_access TEXT NOT NULL DEFAULT 'hidden' CHECK (default_location_access IN ('hidden', 'view')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  created_by_id TEXT REFERENCES users_staff_identity(id),
  updated_at TEXT,
  updated_by_id TEXT REFERENCES users_staff_identity(id),
  CHECK (active = 0 OR staff_login IS NOT NULL)
);

INSERT INTO users_staff_identity(
  id, name, name_key, staff_login, staff_uid, role, default_location_access, active,
  created_at, created_by_id, updated_at, updated_by_id
)
SELECT
  id, name, name_key, NULL, NULL, role, 'hidden', 0,
  created_at, created_by_id, updated_at, updated_by_id
FROM users;

DROP TABLE users;
ALTER TABLE users_staff_identity RENAME TO users;

CREATE TABLE user_location_access_staff_identity (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('hidden', 'view', 'edit')),
  PRIMARY KEY (user_id, location_id)
);

INSERT INTO user_location_access_staff_identity(user_id, location_id, access)
SELECT user_id, location_id, access FROM user_location_access;

DROP TABLE user_location_access;
ALTER TABLE user_location_access_staff_identity RENAME TO user_location_access;

CREATE UNIQUE INDEX users_staff_login_unique
ON users(staff_login) WHERE staff_login IS NOT NULL;

CREATE UNIQUE INDEX users_staff_uid_unique
ON users(staff_uid) WHERE staff_uid IS NOT NULL;

COMMIT;
PRAGMA foreign_keys = ON;
