-- Совместимое добавление: прежние версии игнорируют эти поля.
-- При явном возврате к прежней версии сессии обязательно завершаются.
ALTER TABLE sessions ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE sessions ADD COLUMN auth_role TEXT;
ALTER TABLE sessions ADD COLUMN auth_expires_at TEXT;
