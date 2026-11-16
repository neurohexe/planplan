"use strict";

const crypto = require("node:crypto");
const {
  applyLocalMutation,
  createInitialState,
  normalizeState
} = require("../../app/app.js");
const {
  assertImportLocations,
  auditEntity,
  authorizeMutation,
  canEdit,
  canView,
  isAdmin,
  lockResource,
  mutationLocationIds,
  projectState,
  stampActor,
  warningLocation
} = require("./domain.js");
const {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  LockedError
} = require("./errors.js");
const {
  normalizeName,
  randomToken,
  safeEqual,
  tokenHash,
} = require("./security.js");
const { normalizeStaffLogin } = require("./identity-provider.js");
const { roleAssignments } = require("./idm.js");
const { iso } = require("./time.js");

function publicSessionUser(row, access = {}) {
  return {
    id: row.id,
    name: row.name,
    staffLogin: row.staff_login,
    staffUidBound: Boolean(row.staff_uid),
    role: row.role,
    active: row.active === 1,
    defaultLocationAccess: row.default_location_access || "hidden",
    locationAccess: access
  };
}

function cleanPayload(payload, user) {
  const safe = payload && typeof payload === "object"
    ? JSON.parse(JSON.stringify(payload))
    : {};
  safe.author = user.name;
  safe.actor = user.name;
  delete safe.createdById;
  delete safe.updatedById;
  return safe;
}

const SENSITIVE_PAYLOAD_KEYS = new Set(["pin", "currentPin", "newPin", "token", "lockToken"]);

function maskSensitiveKeys(value) {
  if (Array.isArray(value)) return value.map(maskSensitiveKeys);
  if (value && typeof value === "object") {
    const masked = {};
    for (const [key, nested] of Object.entries(value)) {
      masked[key] = SENSITIVE_PAYLOAD_KEYS.has(key) ? "***" : maskSensitiveKeys(nested);
    }
    return masked;
  }
  return value;
}

function sanitizeAuditPayload(payload) {
  // Маскировать нужно на любой глубине: сами мутации вложенных секретов не
  // содержат, но payload проходит в audit-лог без строгой схемы (см. CR-04).
  const copy = maskSensitiveKeys(JSON.parse(JSON.stringify(payload || {})));
  if (copy.state) copy.state = { omitted: true };
  if (copy.rows && Array.isArray(copy.rows)) copy.rows = { count: copy.rows.length };
  if (copy.issues && Array.isArray(copy.issues)) copy.issues = { count: copy.issues.length };
  return copy;
}

const RETRYABLE_CREATE_COLLECTIONS = Object.freeze({
  addComment: "comments",
  addExpense: "expenses",
  addForecast: "forecastTickets",
  addLocation: "locations"
});

function canRetryCreateMutation(type, payload, state) {
  const collection = RETRYABLE_CREATE_COLLECTIONS[type];
  const id = String(payload?.id || "").trim();
  if (!collection || !id || !Array.isArray(state?.[collection])) return false;
  return !state[collection].some((item) => String(item?.id || "") === id);
}

// crypto.scrypt берётся в момент вызова, а не при загрузке модуля: тест может подсмотреть вызовы.
function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

// Личный код доступа: 20 символов Crockford Base32 (100 бит), вид XXXXX-XXXXX-XXXXX-XXXXX.
const ACCESS_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ACCESS_CODE_LENGTH = 20;
const ACCESS_CODE_GROUP_LENGTH = 5;
// Параметры scrypt хранятся рядом с хэшем: код всегда проверяется с теми, с которыми он выдан.
const ACCESS_CODE_KDF = Object.freeze({ algorithm: "scrypt", N: 16384, r: 8, p: 1, keylen: 32 });
const ACCESS_CODE_SALT_BYTES = 16;
const ACCESS_CODE_MAX_FAILURES = 5;
const ACCESS_CODE_LOCK_MS = 15 * 60 * 1000;
const ACCESS_CODE_FAILURE_MESSAGE = "Неверный логин или код. После 5 ошибок подряд вход блокируется на 15 минут.";
// Для несуществующего логина scrypt считается так же, как для настоящего: по времени ответа
// нельзя понять, есть ли такой логин.
const ACCESS_CODE_DUMMY_SALT = crypto.randomBytes(ACCESS_CODE_SALT_BYTES).toString("hex");

function generateAccessCode() {
  // 256 делится на 32 без остатка, поэтому «байт & 31» выбирает символы поровну, без смещения.
  const symbols = Array.from(crypto.randomBytes(ACCESS_CODE_LENGTH), (byte) => ACCESS_CODE_ALPHABET[byte & 31]);
  const groups = [];
  for (let start = 0; start < ACCESS_CODE_LENGTH; start += ACCESS_CODE_GROUP_LENGTH) {
    groups.push(symbols.slice(start, start + ACCESS_CODE_GROUP_LENGTH).join(""));
  }
  return groups.join("-");
}

// При вводе регистр, пробелы и дефисы не важны; O читается как 0, I и L — как 1. Длиннее 64 символов
// обрезаем: настоящий код короче и лишнее всё равно не совпадёт, а считать scrypt от огромной строки незачем.
function normalizeAccessCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .slice(0, 64);
}

function looksLikeAccessCode(value) {
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(normalizeAccessCode(value));
}

function parseAccessCodeKdf(text) {
  try {
    const params = JSON.parse(text);
    const { N, r, p, keylen } = params;
    if (params.algorithm !== "scrypt" || ![N, r, p, keylen].every(Number.isInteger)) return null;
    if (keylen < 16 || keylen > 64) return null;
    return { algorithm: "scrypt", N, r, p, keylen };
  } catch {
    return null;
  }
}

function deriveAccessCodeKey(code, saltHex, { N, r, p, keylen }) {
  return scryptAsync(code, Buffer.from(saltHex, "hex"), keylen, { N, r, p });
}

// Неизвестный логин для журнала. В поле логина могут вставить код доступа — целиком, с лишним текстом или с
// опечаткой, — а журнал видят администраторы. Поэтому введённое пишется как есть, только если оно похоже на логин
// и в нём не больше 15 латинских букв и цифр: даже если это часть кода, неизвестными остаются минимум 5 его символов
// (32^5 ≈ 33 млн вариантов), а при блокировке после 5 ошибок их перебор занял бы в среднем около 95 лет.
// Иначе в журнале только длина.
const AUDIT_LOGIN_MAX_ALPHANUMERICS = 15;

function auditLoginValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (looksLikeAccessCode(text)) return "[похоже на код доступа]";
  let login = null;
  try {
    login = normalizeStaffLogin(text);
  } catch {
    // Не похоже на логин: пробелы, кириллица (в том числе код в русской раскладке), кавычки и т. п.
  }
  if (login && login.replace(/[^a-z0-9]/g, "").length <= AUDIT_LOGIN_MAX_ALPHANUMERICS) return text;
  return `[скрыто, длина ${text.length}]`;
}

function auditClient(ip, userAgent) {
  return { ip: ip ? String(ip).slice(0, 64) : null, userAgent: String(userAgent || "").slice(0, 500) };
}

// Внутренняя причина отказа; наружу она не выходит, только в журнал.
function accessCodeRejection({ user, record, kdf, derived, at }) {
  if (!user) return "unknown_login";
  if (user.active !== 1) return "inactive";
  if (!record || !kdf || !derived) return "no_code";
  if (record.locked_until && record.locked_until > at) return "locked";
  if (!safeEqual(derived.toString("hex"), record.code_hash)) return "wrong_code";
  return null;
}

class PlanFactService {
  constructor({ store, config, realtime, roles = null, corporateIdentity = null }) {
    this.store = store;
    this.config = config;
    this.realtime = realtime;
    this.roles = roles;
    this.corporateIdentity = corporateIdentity;
    this.corporateRolesAvailable = null;
    if (this.corporateIdm()) roles?.subscribe(() => this.reconcileCorporateSessions());
  }

  corporateIdm() { return this.config?.authMode === "corporate-idm"; }

  sessionMode() { return this.config?.authMode || "legacy"; }

  assertLocalAccessAllowed() {
    if (this.corporateIdm()) throw new AppError("Доступом управляет только IDM", 403, "idm_managed_access");
  }

  corporateRole(uid) {
    if (!this.roles) throw new AppError("Не удалось проверить доступ. Попробуйте позже", 503, "corporate_roles_unavailable");
    return this.roles.roleFor(uid);
  }

  async auditCorporateLoginFailure(reason) {
    const allowed = new Set(["no_role", "roles_unavailable", "identity_conflict", "invalid_identity", "invalid_attempt", "no_access", "access_check_failed", "login_unavailable"]);
    try {
      await this.store.appendAudit({ action: "auth.corporate_login_denied",
        payload: { reason: allowed.has(reason) ? reason : "invalid_attempt" } });
    } catch {
      // Отказ остаётся отказом даже при недоступном журнале; исходная ошибка и
      // параметры корпоративного ответа никогда не подставляются в лог.
    }
  }

  async reconcileCorporateSessions() {
    if (!this.corporateIdm()) return;
    const available = this.roles?.diagnostics().status === "verified";
    if (available !== this.corporateRolesAvailable) {
      this.corporateRolesAvailable = available;
      await this.store.appendAudit({
        action: available ? "auth.corporate_roles_verified" : "auth.corporate_roles_unavailable",
        payload: available ? { source: "tirole" } : { reason: "unverified_or_stale_source" }
      });
    }
    for (const session of await this.store.listCorporateSessions()) {
      let role = null;
      let reason = "corporate_role_revoked";
      const expired = !Number.isFinite(Date.parse(session.authExpiresAt))
        || Date.parse(session.authExpiresAt) <= Date.now() || Date.parse(session.expiresAt) <= Date.now();
      if (expired) reason = "corporate_session_expired";
      else {
        try { role = this.corporateRole(session.uid); } catch { reason = "corporate_roles_unavailable"; }
      }
      if (!role || role !== session.role) {
        if (!role) this.corporateIdentity?.forget(session.id);
        await this.store.releaseSessionLocks(session.id);
        if (role) await this.store.updateSessionRole(session.id, role);
        else await this.store.deleteSession(session.id);
        this.realtime?.closeSession(session.id, role ? "corporate_role_changed" : reason);
        await this.store.appendAudit({
          actorId: session.userId, actorName: session.name, sessionId: session.id,
          action: role ? "auth.corporate_role_changed" : "auth.corporate_access_revoked",
          entityType: "user", entityId: session.userId,
          payload: { role, reason: role ? "role_changed" : reason }
        });
      }
    }
  }

  static initialState() {
    return normalizeState(createInitialState());
  }

  // PLAN_FACT_ROLE_SOURCE=idm: уровень роли и сам доступ выдаёт только IDM; приложение лишь
  // раздаёт пользователям доступ к локациям.
  idmManagesRoles() {
    return this.config?.roleSource === "idm";
  }

  assertRolesManagedByApp(message) {
    this.assertLocalAccessAllowed();
    if (this.idmManagesRoles()) throw new AppError(message, 409, "idm_managed_access");
  }

  async listIdmRoles() {
    this.assertLocalAccessAllowed();
    return roleAssignments(await this.store.listIdmAccounts());
  }

  async idmAddRole({ login, role }, { requestId = null } = {}) {
    this.assertLocalAccessAllowed();
    return this.store.grantIdmRole({
      staffLogin: login,
      role,
      newUserId: crypto.randomUUID(),
      now: iso(),
      requestId
    });
  }

  async idmRemoveRole({ login, role, fired }, { requestId = null } = {}) {
    this.assertLocalAccessAllowed();
    // Неизвестной роли или логина в системе быть не может — отзывать нечего.
    if (!login || !role) return { wasGranted: false, deactivated: false, sessionIds: [] };
    const result = await this.store.revokeIdmRole({ staffLogin: login, role, fired, now: iso(), requestId });
    for (const sessionId of result.sessionIds || []) this.realtime?.closeSession(sessionId, "idm_role_revoked");
    return result;
  }

  async readiness() {
    const result = await this.store.checkReady();
    return {
      status: this.corporateIdm() && this.roles?.diagnostics().status !== "verified" ? "not_ready" : "ready",
      ...(this.corporateIdm() ? { authMode: "corporate-idm", roles: this.roles?.diagnostics() || { status: "unavailable" } } : {}),
      storageDriver: this.config.storageDriver,
      revision: Number(result.revision) || 0
    };
  }

  async provisionStaffAccount({
    staffLogin,
    name,
    role,
    allowExisting = false,
    auditAction = "staff_access.provisioned"
  }) {
    this.assertRolesManagedByApp("Роли выдаёт IDM: техническое заведение пользователей выключено");
    const login = normalizeStaffLogin(staffLogin);
    const normalizedName = normalizeName(name) || login;
    const normalizedRole = ["user", "admin", "superadmin"].includes(role) ? role : null;
    if (!normalizedRole) throw new AppError("Некорректная роль для provisioning");
    const existing = await this.store.getUserByStaffLogin(login);
    if (existing) {
      if (!allowExisting) throw new ConflictError("Пользователь с таким Staff login уже существует");
      if (existing.active !== 1 || existing.role !== normalizedRole) {
        throw new ConflictError(
          `Staff login ${login} уже существует с другим статусом или ролью`
        );
      }
      return { account: await this.store.publicUser(existing.id), created: false };
    }
    const user = await this.store.createUser({
      id: crypto.randomUUID(),
      name: normalizedName,
      nameKey: `staff:${login}`,
      staffLogin: login,
      staffUid: null,
      role: normalizedRole,
      defaultLocationAccess: "hidden",
      locationAccess: {},
      createdAt: iso()
    });
    await this.store.appendAudit({
      actorName: "Техническая процедура",
      action: auditAction,
      entityType: "user",
      entityId: user.id,
      payload: {
        staffLogin: login,
        role: normalizedRole,
        defaultLocationAccess: user.defaultLocationAccess
      }
    });
    return { account: user, created: true };
  }

  async provisionStaffAccounts(accounts) {
    this.assertRolesManagedByApp("Роли выдаёт IDM: техническое заведение пользователей выключено");
    if (!Array.isArray(accounts) || !accounts.length) {
      throw new AppError("Список Staff-аккаунтов для provisioning пуст");
    }
    const normalized = accounts.map((account) => {
      const staffLogin = normalizeStaffLogin(account.staffLogin);
      if (!["user", "admin", "superadmin"].includes(account.role)) {
        throw new AppError(`Некорректная роль для Staff login ${staffLogin}`);
      }
      return {
        staffLogin,
        name: normalizeName(account.name) || staffLogin,
        role: account.role
      };
    });
    const seen = new Set();
    for (const account of normalized) {
      if (seen.has(account.staffLogin)) {
        throw new AppError(`Staff login ${account.staffLogin} указан несколько раз`);
      }
      seen.add(account.staffLogin);
      const existing = await this.store.getUserByStaffLogin(account.staffLogin);
      if (existing && (existing.active !== 1 || existing.role !== account.role)) {
        throw new ConflictError(
          `Staff login ${account.staffLogin} уже существует с другим статусом или ролью`
        );
      }
    }
    const results = [];
    for (const account of normalized) {
      results.push(await this.provisionStaffAccount({ ...account, allowExisting: true }));
    }
    return results;
  }

  async provisionSuperadmin({ staffLogin, name }) {
    const result = await this.provisionStaffAccount({
      staffLogin,
      name,
      role: "superadmin",
      auditAction: "superadmin.provisioned"
    });
    return result.account;
  }

  async authSummary(session = null) {
    return {
      user: session ? await this.sessionUser(session) : null,
      authentication: this.corporateIdm() ? "corporate-idm" : "staff-webauth"
    };
  }

  async sessionUser(session) {
    if (!session?.user) return null;
    if (this.corporateIdm()) {
      await this.requireSession(session);
      const state = await this.store.getState();
      return this.corporateSessionUser(session, state);
    }
    const embeddedAccess = session.user.location_access;
    const access = embeddedAccess && typeof embeddedAccess === "object"
      ? embeddedAccess
      : await this.store.getLocationAccess(session.userId);
    return publicSessionUser(session.user, access);
  }

  // corporate-idm разрешён только с синхронным SQLite. Последняя проверка
  // непосредственно перед выдачей данных/записью не содержит await: отзыв,
  // смена роли или замена сессии не вклиниваются между проверкой и действием.
  corporateSessionUser(session, state) {
    this.corporateIdentity?.assertVerified(session.id);
    const live = this.store.getSessionById(session.id);
    if (!live || live.authMode !== "corporate-idm" || !Number.isFinite(Date.parse(live.authExpiresAt))
        || Date.parse(live.authExpiresAt) <= Date.now()) throw new AuthenticationError();
    const role = this.corporateRole(live.user.staff_uid);
    if (!role) throw new AppError("Нет доступа к приложению", 403, "corporate_access_denied");
    return {
      ...publicSessionUser(live.user), role, active: true,
      accessSource: "tirole", accessScope: "all-locations", defaultLocationAccess: "hidden",
      locationAccess: Object.fromEntries((state.locations || []).map((location) => [location.id, "edit"]))
    };
  }

  async sessionByToken(token, { touch = true } = {}) {
    if (!token) return null;
    const session = await this.store.getSessionByTokenHash(tokenHash(token));
    if (!session) return null;
    try { await this.requireSession(session); } catch (error) {
      if (error.code === "corporate_roles_unavailable") throw error;
      return null;
    }
    return touch ? this.touchSession(session) : session;
  }

  async touchSession(session) {
    const remainingLifetime = Date.parse(session.expiresAt) - Date.now();
    if (remainingLifetime <= this.config.sessionMaxAgeMs / 2) {
      const expiresAt = iso(Math.min(Date.now() + this.config.sessionMaxAgeMs,
        session.authExpiresAt ? Date.parse(session.authExpiresAt) : Infinity));
      await this.store.touchSession(session.id, expiresAt);
      session.expiresAt = expiresAt;
    }
    return session;
  }

  async loginWithStaff({ identity, ip, userAgent }) {
    if (this.corporateIdm()) return this.loginWithCorporateIdentity({ identity, ip, userAgent });
    const login = normalizeStaffLogin(identity?.login);
    const uid = String(identity?.uid || "").trim();
    if (!uid) throw new AuthenticationError("WebAuth не подтвердил корпоративную identity");

    let user = await this.store.getUserByStaffUid(uid);
    if (user) {
      if (user.active !== 1) {
        throw new AppError("Доступ этого сотрудника отключён", 403, "staff_access_disabled");
      }
      if (user.staff_login !== login) {
        const collision = await this.store.getUserByStaffLogin(login);
        if (collision && collision.id !== user.id) {
          throw new AppError("Новый Staff login уже назначен другому пользователю", 403, "staff_identity_conflict");
        }
        await this.store.renameStaffLogin(user.id, user.staff_login, login);
        user = await this.store.getUser(user.id);
      }
    } else {
      user = await this.store.getUserByStaffLogin(login);
      if (!user) {
        throw new AppError(
          `Для Staff login ${login} доступ к приложению не назначен`,
          403,
          "staff_access_not_provisioned"
        );
      }
      if (user.active !== 1) {
        throw new AppError("Доступ этого сотрудника отключён", 403, "staff_access_disabled");
      }
      if (user.staff_uid && !safeEqual(user.staff_uid, uid)) {
        throw new AppError("Staff identity не совпадает с привязанным UID", 403, "staff_identity_mismatch");
      }
      if (!user.staff_uid) {
        user = await this.store.bindStaffUid(user.id, uid);
        if (!user || user.active !== 1) {
          throw new AppError("Доступ этого сотрудника отключён", 403, "staff_access_disabled");
        }
        if (!user.staff_uid || !safeEqual(user.staff_uid, uid)) {
          throw new AppError("Staff identity уже привязана к другому UID", 403, "staff_identity_mismatch");
        }
      }
    }
    return this.openSession(user, {
      ip,
      userAgent,
      auditAction: "auth.staff_login",
      auditPayload: { staffLogin: login }
    });
  }

  async loginWithCorporateIdentity({ identity, ip, userAgent }) {
    if (!this.corporateIdm()) throw new AuthenticationError();
    const uid = String(identity?.uid || "").trim();
    const login = normalizeStaffLogin(identity?.login);
    if (!/^[1-9][0-9]{0,31}$/.test(uid) || !Number.isFinite(identity?.expiresAt)
        || identity.expiresAt <= Date.now()) throw new AuthenticationError("Корпоративный вход не подтверждён");
    let role;
    try {
      role = this.corporateRole(uid);
      if (!role) throw new AppError("Нет доступа к приложению", 403, "corporate_access_denied");
    } catch (error) {
      await this.store.appendAudit({ action: "auth.corporate_login_denied", payload: {
        reason: error.code === "corporate_access_denied" ? "no_role" : "roles_unavailable"
      } });
      throw error;
    }
    let user;
    try {
      user = await this.store.ensureCorporateProfile({
        uid, login, name: normalizeName(identity?.name) || login, newUserId: crypto.randomUUID()
      });
    } catch (error) {
      await this.auditCorporateLoginFailure("identity_conflict");
      throw error;
    }
    // Повторная проверка непосредственно перед созданием сессии: ожидание БД не
    // должно позволить войти со снимком, который за это время был отозван.
    role = this.corporateRole(uid);
    if (!role) throw new AppError("Нет доступа к приложению", 403, "corporate_access_denied");
    return this.openSession(user, { ip, userAgent, auditAction: "auth.corporate_login", verifiedCorporateIdentity: identity,
      auditPayload: { role }, authRole: role, authExpiresAt: iso(identity.expiresAt) });
  }

  // Общая часть любого входа: закрыть прежнюю сессию в realtime, создать новую (у пользователя
  // она одна) и записать вход в журнал.
  async openSession(user, { ip, userAgent, auditAction, auditPayload, authRole = null, authExpiresAt = null, verifiedCorporateIdentity = null }) {
    const now = Date.now();
    const previous = await this.store.getActiveUserSession(user.id);
    if (previous) this.corporateIdentity?.forget(previous.id);
    if (previous) this.realtime?.closeSession(previous.id, "session_replaced");
    const token = randomToken();
    const sessionId = crypto.randomUUID();
    await this.store.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash: tokenHash(token),
      createdAt: iso(now),
      expiresAt: iso(Math.min(now + this.config.sessionMaxAgeMs, authExpiresAt ? Date.parse(authExpiresAt) : Infinity)),
      authMode: this.sessionMode(), authRole, authExpiresAt,
      ip,
      userAgent: String(userAgent || "").slice(0, 500)
    });
    const session = await this.store.getSessionByTokenHash(tokenHash(token));
    if (this.corporateIdentity) {
      try { this.corporateIdentity.bindSession(session, verifiedCorporateIdentity); }
      catch (error) {
        this.corporateIdentity.forget(sessionId);
        await this.store.deleteSession(sessionId);
        throw error;
      }
    }
    await this.store.appendAudit({
      actorId: user.id,
      actorName: user.name,
      sessionId,
      action: auditAction,
      entityType: "user",
      entityId: user.id,
      payload: { ...auditPayload, replacedPreviousSession: Boolean(previous) }
    });
    return { token, session, user: await this.sessionUser(session) };
  }

  // Выдача личного кода (команда issue-access-code). Код возвращается только вызывающему:
  // в базе остаётся один хэш, в журнал и в ошибки код не попадает.
  async issueAccessCode(login) {
    this.assertLocalAccessAllowed();
    const staffLogin = normalizeStaffLogin(login);
    const user = await this.store.getUserByStaffLogin(staffLogin);
    if (!user) {
      throw new AppError(
        `Пользователь ${staffLogin} не найден: сначала заведите его (superadmin — командой provision-staff-access, остальных — в интерфейсе)`,
        404,
        "not_found"
      );
    }
    if (user.active !== 1) {
      throw new AppError(`Доступ пользователя ${staffLogin} отключён: код не выдаётся`, 403, "staff_access_disabled");
    }
    const code = generateAccessCode();
    const salt = crypto.randomBytes(ACCESS_CODE_SALT_BYTES).toString("hex");
    const hash = await deriveAccessCodeKey(normalizeAccessCode(code), salt, ACCESS_CODE_KDF);
    await this.store.saveAccessCode({
      userId: user.id,
      codeHash: hash.toString("hex"),
      salt,
      kdfParams: ACCESS_CODE_KDF,
      issuedAt: iso(Date.now())
    });
    // Прежние сессии закрываются так же, как при выходе: блокировки записей, сами сессии, realtime.
    const previous = await this.store.getActiveUserSession(user.id);
    await this.store.deleteLocksByUser(user.id);
    await this.store.deleteUserSessions(user.id);
    if (previous) this.realtime?.closeSession(previous.id, "access_code_reissued");
    await this.store.appendAudit({
      actorName: "Техническая процедура",
      action: "auth.access_code_issued",
      entityType: "user",
      entityId: user.id,
      payload: { login: staffLogin, closedSession: Boolean(previous) }
    });
    return { login: staffLogin, code };
  }

  // Вход по личному коду. Любая неудача выглядит одинаково (AuthenticationError 401 с общим текстом);
  // настоящая причина (unknown_login, inactive, no_code, locked, wrong_code) попадает только в журнал.
  async loginWithAccessCode({ login, code, ip, userAgent } = {}) {
    this.assertLocalAccessAllowed();
    const at = iso(Date.now());
    let staffLogin = null;
    try {
      staffLogin = normalizeStaffLogin(login);
    } catch {
      // Логин неверного вида — такая же неудача, как неизвестный логин.
    }
    const user = staffLogin ? await this.store.getUserByStaffLogin(staffLogin) : null;
    const record = user ? await this.store.getAccessCode(user.id) : null;
    const kdf = record ? parseAccessCodeKdf(record.kdf_params) : null;
    // scrypt считается всегда и с теми же затратами, какой бы ни была причина отказа.
    let derived = null;
    try {
      derived = await deriveAccessCodeKey(
        normalizeAccessCode(code),
        kdf ? record.salt : ACCESS_CODE_DUMMY_SALT,
        kdf || ACCESS_CODE_KDF
      );
    } catch {
      // Испорченные параметры в записи: такой код считается невыданным.
    }

    let reason = accessCodeRejection({ user, record, kdf, derived, at });
    if (!reason && !await this.store.resetAccessCodeFailures(user.id, { now: at, codeHash: record.code_hash })) {
      // Пока проверялся код, логин успели заблокировать или код заменили.
      reason = "locked";
    }
    if (reason) {
      const failure = reason === "wrong_code"
        ? await this.store.recordAccessCodeFailure(user.id, {
          now: at,
          maxFailures: ACCESS_CODE_MAX_FAILURES,
          lockMs: ACCESS_CODE_LOCK_MS
        })
        : null;
      await this.store.appendAudit({
        action: "auth.access_code_failed",
        entityType: "user",
        entityId: user?.id || null,
        payload: {
          reason,
          login: user ? user.staff_login : auditLoginValue(login),
          ...auditClient(ip, userAgent),
          ...(failure ? { failedAttempts: failure.failedAttempts, lockedUntil: failure.lockedUntil } : {})
        }
      });
      throw new AuthenticationError(ACCESS_CODE_FAILURE_MESSAGE);
    }
    return this.openSession(user, {
      ip,
      userAgent,
      auditAction: "auth.access_code_login",
      auditPayload: { login: user.staff_login, ...auditClient(ip, userAgent) }
    });
  }

  async logout(session, { reason = null } = {}) {
    if (!session) return;
    this.corporateIdentity?.forget(session.id);
    await this.store.releaseSessionLocks(session.id);
    await this.store.deleteSession(session.id);
    await this.store.appendAudit({
      actorId: session.userId,
      actorName: session.user.name,
      sessionId: session.id,
      action: "auth.logout",
      entityType: "user",
      entityId: session.userId,
      payload: reason ? { reason } : {}
    });
    this.realtime?.closeSession(session.id, reason || "logout");
  }

  sessionMatchesIdentity(session, identity) {
    return Boolean(session?.user?.staff_uid && safeEqual(session.user.staff_uid, identity?.uid));
  }

  assertStaffIdentity(session, identity) {
    if (!session?.user) throw new AuthenticationError();
    if (!this.sessionMatchesIdentity(session, identity)) {
      throw new AuthenticationError("Корпоративная identity изменилась; обновите страницу");
    }
    return session;
  }

  async requireSession(session) {
    if (!session) throw new AuthenticationError();
    if ((session.authMode || (this.corporateIdm() ? "legacy" : this.sessionMode())) !== this.sessionMode()) {
      await this.logout(session, { reason: "auth_mode_changed" });
      throw new AuthenticationError();
    }
    if (this.corporateIdm()) {
      if (!await this.store.getSessionById(session.id) || !session.authExpiresAt
          || !Number.isFinite(Date.parse(session.authExpiresAt)) || Date.parse(session.authExpiresAt) <= Date.now()) {
        await this.logout(session, { reason: "corporate_session_expired" });
        throw new AuthenticationError();
      }
      let role;
      try { role = this.corporateRole(session.user.staff_uid); } catch (error) {
        await this.logout(session, { reason: "corporate_roles_unavailable" });
        throw error;
      }
      if (!role) {
        await this.logout(session, { reason: "corporate_role_revoked" });
        throw new AppError("Нет доступа к приложению", 403, "corporate_access_denied");
      }
    }
    return session;
  }

  async stateFor(session) {
    await this.requireSession(session);
    const state = await this.store.getState();
    let user = await this.sessionUser(session);
    const warnings = await this.store.hiddenWarnings(session.userId);
    if (this.corporateIdm()) user = this.corporateSessionUser(session, state);
    const access = user.locationAccess;
    return {
      user,
      state: projectState(state, user, access, warnings)
    };
  }

  async projectedStateForSession(session, state, user, access) {
    const warnings = await this.store.hiddenWarnings(session.userId);
    if (this.corporateIdm()) {
      user = this.corporateSessionUser(session, state);
      access = user.locationAccess;
    }
    return projectState(state, user, access, warnings);
  }

  async listManagedUsers(session) {
    this.assertLocalAccessAllowed();
    await this.requireSession(session);
    const actor = await this.sessionUser(session);
    if (actor.role !== "superadmin") {
      throw new AuthorizationError("Пользователями и доступами управляет только superadmin");
    }
    return (await this.store.listUsers()).filter((item) => {
      if (item.role === "superadmin") return item.id === actor.id;
      return true;
    });
  }

  async saveAccount(session, payload, mutationId = null) {
    this.assertLocalAccessAllowed();
    await this.requireSession(session);
    const actor = await this.sessionUser(session);
    if (actor.role !== "superadmin") {
      throw new AuthorizationError("Пользователями и доступами управляет только superadmin");
    }
    const state = await this.store.getState();
    const validLocations = new Set((state.locations || []).map((item) => item.id));
    const requestedAccess = Object.fromEntries(Object.entries(payload.locationAccess || {})
      .filter(([id, level]) => validLocations.has(id) && ["hidden", "view", "edit"].includes(level)));
    const staffLogin = normalizeStaffLogin(payload.staffLogin);
    const name = normalizeName(payload.name) || staffLogin;
    const role = payload.role === "admin" ? "admin" : "user";
    const defaultLocationAccess = role === "user" && payload.defaultLocationAccess === "view" ? "view" : "hidden";
    const existing = payload.id ? await this.store.getUser(payload.id) : null;
    if (payload.id && !existing) throw new AppError("Пользователь не найден", 404, "not_found");
    if (existing?.role === "superadmin") throw new AuthorizationError("Аккаунты superadmin управляются только технически");
    const idmManaged = this.idmManagesRoles();
    if (idmManaged) {
      if (!existing) {
        throw new AppError("Пользователей добавляет IDM: запросите для сотрудника роль в IDM", 409, "idm_managed_access");
      }
      if (existing.active !== 1) {
        // Доступы отключённому сотруднику не назначаются: иначе они вернутся вместе с ролью без решения superadmin.
        throw new AppError("Роль сотрудника отозвана в IDM: доступ к локациям назначается после повторной выдачи роли", 409, "idm_managed_access");
      }
      if (existing.role !== role || existing.staff_login !== staffLogin) {
        throw new AppError("Уровень роли и Staff login меняются только через IDM", 409, "idm_managed_access");
      }
    }
    if (existing?.staff_uid && existing.staff_login !== staffLogin) {
      throw new AppError("Привязанный Staff login обновляется автоматически при корпоративном входе");
    }
    const duplicate = await this.store.getUserByStaffLogin(staffLogin);
    if (duplicate && duplicate.id !== existing?.id) {
      throw new ConflictError("Пользователь с таким Staff login уже существует");
    }
    const identityChanged = Boolean(existing && existing.staff_login !== staffLogin);
    const result = existing
      ? await this.store.updateUser(existing.id, {
          name,
          // В режиме IDM роль и логин не перезаписываются, а хранилище под блокировкой проверяет,
          // что IDM не изменил их после открытия карточки.
          ...(idmManaged
            ? { expect: { active: true, role: existing.role } }
            : { nameKey: `staff:${staffLogin}`, staffLogin, role }),
          defaultLocationAccess,
          locationAccess: role === "user" ? requestedAccess : {},
          updatedById: actor.id
        })
      : await this.store.createUser({
          id: crypto.randomUUID(),
          name,
          nameKey: `staff:${staffLogin}`,
          staffLogin,
          staffUid: null,
          role,
          defaultLocationAccess,
          locationAccess: role === "user" ? requestedAccess : {},
          createdById: actor.id
        });
    await this.store.appendAudit({
      actorId: actor.id,
      actorName: actor.name,
      sessionId: session.id,
      action: existing ? "account.updated" : "account.created",
      mutationId,
      entityType: "user",
      entityId: result.id,
      payload: {
        staffLogin,
        name: result.name,
        role: result.role,
        defaultLocationAccess,
        locationAccess: result.locationAccess
      }
    });
    if (identityChanged) {
      const oldSession = await this.store.getActiveUserSession(existing.id);
      await this.store.deleteUserSessions(existing.id);
      if (oldSession) this.realtime?.closeSession(oldSession.id, "staff_identity_changed");
    }
    return result;
  }

  async archiveAccount(session, { id, archived }, mutationId = null) {
    this.assertLocalAccessAllowed();
    await this.requireSession(session);
    const actor = await this.sessionUser(session);
    if (actor.role !== "superadmin") {
      throw new AuthorizationError("Пользователями и доступами управляет только superadmin");
    }
    this.assertRolesManagedByApp("Доступ включают и отключают выдачей или отзывом роли в IDM");
    const target = await this.store.getUser(id);
    if (!target) throw new AppError("Пользователь не найден", 404, "not_found");
    if (target.role === "superadmin") throw new AuthorizationError("Аккаунты superadmin управляются только технически");
    if (target.id === actor.id) throw new AuthorizationError("Нельзя отключить собственный аккаунт");
    if (archived !== true && !target.staff_login) {
      // Перенесённый PIN-аккаунт без Staff login нельзя включить: схема БД это запрещает,
      // а без логина человек всё равно не сможет войти.
      throw new AppError("Сначала укажите Staff login, затем включите пользователя", 400, "staff_login_required");
    }
    const account = await this.store.updateUser(target.id, { active: archived !== true, updatedById: actor.id });
    if (archived === true) {
      await this.store.deleteUserSessions(target.id);
      await this.store.deleteLocksByUser(target.id);
    }
    await this.store.appendAudit({
      actorId: actor.id,
      actorName: actor.name,
      sessionId: session.id,
      action: archived === true ? "account.disabled" : "account.enabled",
      mutationId,
      entityType: "user",
      entityId: target.id,
      payload: { targetName: target.name }
    });
    return account;
  }

  async acquireLock(session, { resourceType, resourceId }) {
    await this.requireSession(session);
    if (this.corporateIdm() && ["budget", "project", "location"].includes(resourceType)
        && this.corporateRole(session.user.staff_uid) !== "admin") throw new AuthorizationError();
    const allowedTypes = new Set(["expense", "forecast", "budget", "project", "location"]);
    if (!allowedTypes.has(resourceType) || !String(resourceId || "").trim()) throw new AppError("Некорректный ресурс блокировки");
    const token = randomToken();
    const now = iso();
    const expiresAt = iso(Date.now() + this.config.lockTtlMs);
    if (this.corporateIdm()) {
      const actor = this.corporateSessionUser(session, { locations: [] });
      if (["budget", "project", "location"].includes(resourceType) && actor.role !== "admin") throw new AuthorizationError();
    }
    const result = await this.store.acquireLock({
      resourceType,
      resourceId: String(resourceId),
      userId: session.userId,
      sessionId: session.id,
      ownerName: session.user.name,
      tokenHash: tokenHash(token),
      now,
      expiresAt
    });
    if (!result.acquired) {
      throw new LockedError(`Запись редактирует ${result.lock.owner_name}`, {
        ownerName: result.lock.owner_name,
        expiresAt: result.lock.expires_at
      });
    }
    return { resourceType, resourceId: String(resourceId), lockToken: token, expiresAt };
  }

  async heartbeatLock(session, { resourceType, resourceId, lockToken }) {
    await this.requireSession(session);
    const expiresAt = iso(Date.now() + this.config.lockTtlMs);
    if (this.corporateIdm()) this.corporateSessionUser(session, { locations: [] });
    if (!await this.store.refreshLock(resourceType, String(resourceId), session.id, tokenHash(lockToken), expiresAt)) {
      throw new LockedError("Блокировка потеряна или истекла");
    }
    return { expiresAt };
  }

  async releaseLock(session, { resourceType, resourceId, lockToken }) {
    await this.requireSession(session);
    if (this.corporateIdm()) this.corporateSessionUser(session, { locations: [] });
    return { released: await this.store.releaseLock(resourceType, String(resourceId), session.id, tokenHash(lockToken)) };
  }

  async assertMutationLock(session, type, payload) {
    if (!this.config.requireLocks) return;
    const resource = lockResource(type, payload);
    if (!resource) return;
    const lock = await this.store.getLock(resource.resourceType, resource.resourceId);
    if (!lock || lock.owner_session_id !== session.id || lock.token_hash !== tokenHash(payload.lockToken)) {
      throw new LockedError(lock
        ? `Запись редактирует ${lock.owner_name}`
        : "Сначала откройте запись в режиме редактирования и получите блокировку",
      lock ? { ownerName: lock.owner_name, expiresAt: lock.expires_at } : null);
    }
  }

  async mutate(session, command) {
    await this.requireSession(session);
    const type = String(command?.type || "");
    const mutationId = String(command?.mutationId || crypto.randomUUID());
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(mutationId)) {
      throw new AppError("Некорректный mutationId", 400, "invalid_mutation_id");
    }
    const idempotent = await this.store.findAuditByMutationId(mutationId);
    if (idempotent) return { ...await this.stateFor(session), idempotent: true, auditEventId: idempotent.id };
    let actor = await this.sessionUser(session);
    const access = actor.locationAccess;
    const rawPayload = command?.payload && typeof command.payload === "object" ? command.payload : {};

    if (type === "saveAccount") {
      const account = await this.saveAccount(session, rawPayload, mutationId);
      return { ...await this.stateFor(session), account };
    }
    if (type === "archiveAccount") {
      const account = await this.archiveAccount(session, rawPayload, mutationId);
      return { ...await this.stateFor(session), account };
    }
    if (type === "dismissTrackerWarning") return this.dismissWarning(session, rawPayload, mutationId);

    const baseRevision = Number(command?.baseRevision);
    if (!Number.isInteger(baseRevision)) {
      const current = await this.store.getState();
      throw new ConflictError("Некорректная ревизия данных", {
        state: await this.projectedStateForSession(session, current, actor, access)
      });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.store.getState();
      const retryableCreate = canRetryCreateMutation(type, rawPayload, before);
      if (baseRevision !== before.revision && !retryableCreate) {
        throw new ConflictError("Данные уже изменились. Получена актуальная версия.", {
          state: await this.projectedStateForSession(session, before, actor, access)
        });
      }
      authorizeMutation({ type, payload: rawPayload, state: before, user: actor, access });
      await this.assertMutationLock(session, type, rawPayload);
      const payload = cleanPayload(rawPayload, actor);
      let after = applyLocalMutation(before, type, payload);
      after = stampActor(before, after, actor);
      after.revision = before.revision + 1;
      if (type === "importExpenses") assertImportLocations(before, after, actor, access);
      const entity = auditEntity(type, payload);
      const eventLocations = mutationLocationIds(type, payload, before);
      let result;
      try {
        if (this.corporateIdm()) {
          actor = this.corporateSessionUser(session, before);
          authorizeMutation({ type, payload: rawPayload, state: before, user: actor, access: actor.locationAccess });
          if (type === "importExpenses") assertImportLocations(before, after, actor, actor.locationAccess);
        }
        result = await this.store.commitStateMutation({
          mutationId,
          expectedRevision: before.revision,
          nextState: after,
          audit: {
            revision: after.revision,
            actorId: actor.id,
            actorName: actor.name,
            sessionId: session.id,
            action: `mutation.${type}`,
            mutationId,
            ...entity,
            locationId: eventLocations.length === 1 ? eventLocations[0] : null,
            payload: sanitizeAuditPayload(payload)
          }
        });
      } catch (error) {
        if (error instanceof ConflictError && !error.details?.state) {
          const current = await this.store.getState();
          error.details = {
            ...(error.details || {}),
            state: await this.projectedStateForSession(session, current, actor, access)
          };
        }
        throw error;
      }
      if (result.saved === false) {
        if (retryableCreate && attempt < 2) continue;
        const current = await this.store.getState();
        throw new ConflictError("Состояние было изменено параллельно", {
          state: await this.projectedStateForSession(session, current, actor, access)
        });
      }
      if (result.idempotent) {
        return { ...await this.stateFor(session), idempotent: true, auditEventId: result.eventId };
      }
      // Рассылается всем подключённым сессиям без учёта ACL локации, поэтому
      // payload не должен содержать ничего, что раскрывает, кто и где именно
      // внёс изменение (см. CR-02 из security-ревью).
      this.realtime?.publish({
        type: "state-changed",
        revision: after.revision,
        mutationType: type
      });
      if (this.corporateIdm()) return { ...await this.stateFor(session), auditEventId: result.eventId };
      return {
        user: actor,
        state: projectState(after, actor, access, await this.store.hiddenWarnings(actor.id)),
        auditEventId: result.eventId
      };
    }
    throw new ConflictError("Не удалось применить изменение после повторной проверки");
  }

  async dismissWarning(session, payload, mutationId) {
    if (this.corporateIdm()) throw new AuthorizationError("Tracker не включён в корпоративном режиме MVP");
    const actor = await this.sessionUser(session);
    const state = await this.store.getState();
    const warning = (state.trackerSync?.warnings || []).find((item) => item.id === payload.id);
    if (!warning) throw new AppError("Предупреждение не найдено", 404, "not_found");
    const locationId = warningLocation(state, warning);
    const access = actor.locationAccess;
    if (!locationId || (!isAdmin(actor) && !canEdit(actor, access, locationId))) throw new AuthorizationError();
    await this.store.hideWarning(actor.id, warning.id, String(warning.fingerprint || ""));
    await this.store.appendAudit({
      revision: state.revision,
      actorId: actor.id,
      actorName: actor.name,
      sessionId: session.id,
      action: "tracker.warning_hidden_personally",
      mutationId,
      entityType: "tracker_warning",
      entityId: warning.id,
      payload: { fingerprint: warning.fingerprint || "", locationId }
    });
    return this.stateFor(session);
  }

  async requestTrackerSync(session, { locationIds = [] } = {}) {
    if (this.corporateIdm()) throw new AuthorizationError("Tracker не включён в корпоративном режиме MVP");
    await this.requireSession(session);
    const actor = await this.sessionUser(session);
    const access = actor.locationAccess;
    const state = await this.store.getState();
    const allLocationIds = new Set((state.locations || []).filter((item) => !item.archived).map((item) => item.id));
    const requested = [...new Set((locationIds || []).map(String))];
    const selected = requested.length
      ? requested
      : [...allLocationIds].filter((id) => canView(actor, access, id));
    if (selected.some((id) => !allLocationIds.has(id) || !canView(actor, access, id))) throw new AuthorizationError("Нет доступа к одной из выбранных локаций");
    const existing = await this.store.activeSyncJob("tracker");
    if (existing) return { jobId: existing.id, joined: true };
    const id = await this.store.createSyncJob({
      kind: "tracker",
      requestedById: actor.id,
      sessionId: session.id,
      scope: { locationIds: selected },
      cancelIfSessionEnds: false
    });
    await this.store.appendAudit({
      actorId: actor.id,
      actorName: actor.name,
      sessionId: session.id,
      action: "tracker.sync_requested",
      entityType: "sync_job",
      entityId: id,
      payload: { locationIds: selected }
    });
    this.realtime?.publish({ type: "tracker-sync-queued", jobId: id, locationIds: selected });
    return { jobId: id, joined: false };
  }

  async listAudit(session, options = {}) {
    await this.requireSession(session);
    if (this.corporateIdm()) {
      const state = await this.store.getState();
      const rows = await this.store.listAudit({ limit: 500, before: options.before });
      const current = this.corporateSessionUser(session, state);
      const visible = new Set(Object.keys(current.locationAccess));
      return rows.filter((event) => isAdmin(current)
        ? (!options.actorId || event.actorId === options.actorId)
        : event.actorId === current.id || (event.locationId && visible.has(event.locationId)))
        .slice(0, Math.min(500, Math.max(1, Number(options.limit) || 100)));
    }
    const actor = await this.sessionUser(session);
    if (isAdmin(actor)) {
      return this.store.listAudit({ actorId: options.actorId || null, limit: options.limit, before: options.before });
    }
    const access = actor.locationAccess;
    const visible = new Set(Object.entries(access).filter(([, level]) => level === "view" || level === "edit").map(([id]) => id));
    return (await this.store.listAudit({ limit: 500, before: options.before }))
      .filter((event) => event.actorId === actor.id || (event.locationId && visible.has(event.locationId)))
      .slice(0, Math.min(500, Math.max(1, Number(options.limit) || 100)));
  }
}

module.exports = {
  PlanFactService,
  canRetryCreateMutation,
  cleanPayload,
  generateAccessCode,
  normalizeAccessCode,
  publicSessionUser,
  sanitizeAuditPayload
};
