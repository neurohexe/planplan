-- Личные коды доступа (PLAN_FACT_AUTH_MODE=access-code): одна строка на пользователя.
-- Сам код в базе не хранится, только scrypt-хэш. Параметры хэширования лежат рядом (kdf_params),
-- чтобы позже их можно было усилить, не ломая уже выданные коды.
CREATE TABLE IF NOT EXISTS access_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  kdf_params TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TEXT,
  last_failed_at TEXT
);
