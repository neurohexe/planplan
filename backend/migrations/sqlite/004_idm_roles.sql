-- Роли, выданные IDM (PLAN_FACT_ROLE_SOURCE=idm). У сотрудника может быть несколько ролей;
-- в users.role хранится старшая из них.
CREATE TABLE IF NOT EXISTS idm_roles (
  staff_login TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'superadmin')),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (staff_login, role)
);
