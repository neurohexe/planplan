DELETE FROM sessions;
DELETE FROM edit_locks;
DROP TABLE IF EXISTS login_attempts;

ALTER TABLE users ADD COLUMN staff_login TEXT;
ALTER TABLE users ADD COLUMN staff_uid TEXT;
ALTER TABLE users ADD COLUMN default_location_access TEXT NOT NULL DEFAULT 'hidden'
CHECK (default_location_access IN ('hidden', 'view'));

UPDATE users SET active = 0;

ALTER TABLE users DROP COLUMN pin_salt;
ALTER TABLE users DROP COLUMN pin_hash;
ALTER TABLE users DROP COLUMN must_change_pin;

ALTER TABLE users ADD CONSTRAINT active_user_requires_staff_login
CHECK (active = 0 OR staff_login IS NOT NULL);

ALTER TABLE user_location_access DROP CONSTRAINT user_location_access_access_check;
ALTER TABLE user_location_access ADD CONSTRAINT user_location_access_access_check
CHECK (access IN ('hidden', 'view', 'edit'));

CREATE UNIQUE INDEX users_staff_login_unique
ON users(staff_login) WHERE staff_login IS NOT NULL;

CREATE UNIQUE INDEX users_staff_uid_unique
ON users(staff_uid) WHERE staff_uid IS NOT NULL;
