"use strict";

const { visibleState } = require("./access-control.js");

const ADMIN_MUTATIONS = new Set([
  "importBudget", "saveBudget", "copyBudget",
  "addLocation", "updateLocation", "archiveLocation", "deleteLocation",
  "addArticle", "updateArticle", "archiveArticle", "deleteArticle",
  "addSubarticle", "updateSubarticle", "deleteSubarticle",
  "closePeriod", "reopenPeriod"
]);

const SYSTEM_MUTATIONS = new Set([
  "syncTrackerExpenses", "recordTrackerSyncFailure"
]);

const EDIT_MUTATIONS = new Set([
  "addExpense", "updateExpense", "cancelExpense", "restoreExpense",
  "addForecast", "updateForecastAllocation", "releaseForecastTicket",
  "restoreForecastTicket", "convertForecastAllocation",
  "saveTrackerManualMapping", "deleteTrackerManualMapping"
]);

const VIEW_WRITE_MUTATIONS = new Set(["addComment", "importExpenses"]);

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "superadmin";
}

function locationAccess(user, access, locationId) {
  if (!user?.active && user?.active !== undefined) return "hidden";
  if (user?.accessSource === "tirole" && user?.accessScope === "all-locations"
      && ["member", "admin"].includes(user?.role)) return "edit";
  if (isAdmin(user)) return "edit";
  if (Object.prototype.hasOwnProperty.call(access || {}, locationId)) {
    return access[locationId] === "edit" ? "edit" : (access[locationId] === "view" ? "view" : "hidden");
  }
  return user?.defaultLocationAccess === "view" ? "view" : "hidden";
}

function canView(user, access, locationId) {
  return locationAccess(user, access, locationId) !== "hidden";
}

function canEdit(user, access, locationId) {
  return locationAccess(user, access, locationId) === "edit";
}

function ticketLocations(ticket) {
  return [...new Set((ticket?.allocations || []).map((item) => item.locationId).filter(Boolean))];
}

function warningLocation(state, warning) {
  if (warning?.locationId) return warning.locationId;
  const expense = warning?.expenseId
    ? (state.expenses || []).find((item) => item.id === warning.expenseId)
    : null;
  if (expense?.locationId) return expense.locationId;
  const issueKey = String(warning?.issueKey || "").toUpperCase();
  if (!issueKey) return null;
  const linkedExpense = (state.expenses || []).find((item) => String(item.sourceKey || "").toUpperCase() === issueKey);
  if (linkedExpense?.locationId) return linkedExpense.locationId;
  const ticket = (state.forecastTickets || []).find((item) =>
    String(item.sourceTicketKey || item.sourceRequestNumber || "").toUpperCase() === issueKey);
  if (ticket) return ticketLocations(ticket)[0] || null;
  return state.trackerSync?.manualMappings?.[issueKey]?.locationId || null;
}

function relevantArticleIds(projected) {
  const ids = new Set();
  Object.values(projected.budgets || {}).forEach((store) => {
    Object.keys(store || {}).forEach((key) => ids.add(key.split("|")[0]));
  });
  Object.values(projected.projectAttributes || {}).forEach((attributes) => {
    Object.keys(attributes || {}).forEach((id) => ids.add(id));
  });
  (projected.expenses || []).forEach((item) => ids.add(item.articleId));
  (projected.forecastTickets || []).forEach((ticket) =>
    (ticket.allocations || []).forEach((item) => ids.add(item.articleId)));
  return ids;
}

function projectState(state, user, access, hiddenWarnings = new Map()) {
  const account = {
    ...user,
    archived: user?.active === false,
    role: user?.accessSource === "tirole" ? user.role : (isAdmin(user) ? "admin" : "user"),
    defaultLocationAccess: user?.defaultLocationAccess === "view" ? "view" : "hidden",
    locationAccess: access || {}
  };
  const projected = visibleState(state, account);
  const visibleIds = new Set(projected.locations.map((item) => item.id));
  const articleIds = relevantArticleIds(projected);
  projected.articles = visibleIds.size
    ? (projected.articles || []).filter((item) => articleIds.has(item.id) || isAdmin(user) || user?.accessSource === "tirole")
    : [];
  projected.currencyCatalog = visibleIds.size ? (state.currencyCatalog || []) : [];
  projected.exchangeRatesByQuarter = visibleIds.size ? (state.exchangeRatesByQuarter || {}) : {};
  projected.legacyExchangeRates = {};
  projected.trackerSync = { ...(state.trackerSync || {}), warnings: [] };
  projected.trackerSync.warnings = (state.trackerSync?.warnings || []).filter((warning) => {
    const locationId = warningLocation(state, warning);
    if (!locationId) return isAdmin(user);
    if (!isAdmin(user) && !canEdit(user, access, locationId)) return false;
    const hiddenFingerprint = hiddenWarnings.get(warning.id);
    return hiddenFingerprint == null || hiddenFingerprint !== String(warning.fingerprint || "");
  });
  projected.permissions = {
    role: user?.role || "user",
    ...(user?.accessSource === "tirole" ? { accessSource: "tirole", accessScope: "all-locations" } : {}),
    locations: Object.fromEntries([...visibleIds].map((id) => [id, locationAccess(user, access, id)])),
    canManageUsers: user?.role === "superadmin",
    canManageBudget: isAdmin(user)
  };
  return JSON.parse(JSON.stringify(projected));
}

function mutationLocationIds(type, payload, state) {
  const result = new Set();
  const add = (value) => { if (value) result.add(value); };
  if (["addExpense", "addForecast", "saveBudget", "copyBudget"].includes(type)) add(payload?.locationId);
  if (["updateExpense", "cancelExpense", "restoreExpense"].includes(type)) {
    add((state.expenses || []).find((item) => item.id === payload?.id)?.locationId);
    add(payload?.locationId);
  }
  if (type === "addComment") {
    add((state.expenses || []).find((item) => item.id === payload?.expenseId)?.locationId);
  }
  if (["updateForecastAllocation", "convertForecastAllocation"].includes(type)) {
    const ticket = (state.forecastTickets || []).find((item) => item.id === payload?.ticketId);
    add(ticket?.allocations?.find((item) => item.id === payload?.allocationId)?.locationId);
    add(payload?.locationId);
  }
  if (["releaseForecastTicket", "restoreForecastTicket"].includes(type)) {
    const ticket = (state.forecastTickets || []).find((item) => item.id === payload?.ticketId);
    ticketLocations(ticket).forEach(add);
  }
  if (["saveTrackerManualMapping"].includes(type)) add(payload?.locationId);
  if (["deleteTrackerManualMapping"].includes(type)) {
    add(state.trackerSync?.manualMappings?.[String(payload?.issueKey || "").toUpperCase()]?.locationId);
  }
  return [...result].filter(Boolean);
}

function changedLocationIds(before, after) {
  const ids = new Set();
  const collect = (state) => {
    (state.expenses || []).forEach((item) => ids.add(item.locationId));
    (state.forecastTickets || []).forEach((ticket) => ticketLocations(ticket).forEach((id) => ids.add(id)));
  };
  const beforeExpense = new Map((before.expenses || []).map((item) => [item.id, JSON.stringify(item)]));
  (after.expenses || []).forEach((item) => {
    if (beforeExpense.get(item.id) !== JSON.stringify(item)) ids.add(item.locationId);
  });
  const beforeForecast = new Map((before.forecastTickets || []).map((item) => [item.id, JSON.stringify(item)]));
  (after.forecastTickets || []).forEach((ticket) => {
    if (beforeForecast.get(ticket.id) !== JSON.stringify(ticket)) ticketLocations(ticket).forEach((id) => ids.add(id));
  });
  if (!ids.size && JSON.stringify(before) !== JSON.stringify(after)) collect(after);
  return [...ids].filter(Boolean);
}

function authorizeMutation({ type, payload, state, user, access }) {
  if (!user) throw Object.assign(new Error("Требуется вход"), { statusCode: 401 });
  if (type === "importState") throw Object.assign(new Error("Полное восстановление общей базы через интерфейс запрещено"), { statusCode: 403 });
  if (SYSTEM_MUTATIONS.has(type)) throw Object.assign(new Error("Операция доступна только системному Tracker-агенту"), { statusCode: 403 });
  if (user.accessSource === "tirole" && ["saveTrackerManualMapping", "deleteTrackerManualMapping", "dismissTrackerWarning"].includes(type)) {
    throw Object.assign(new Error("Tracker не включён в корпоративном режиме MVP"), { statusCode: 403 });
  }
  if (ADMIN_MUTATIONS.has(type)) {
    if (!isAdmin(user)) throw Object.assign(new Error("Операция доступна только администратору"), { statusCode: 403 });
    return;
  }
  const locations = mutationLocationIds(type, payload, state);
  if (EDIT_MUTATIONS.has(type)) {
    if (!locations.length || locations.some((id) => !canEdit(user, access, id))) {
      throw Object.assign(new Error("Нет права редактирования выбранной локации"), { statusCode: 403 });
    }
    return;
  }
  if (VIEW_WRITE_MUTATIONS.has(type)) {
    if (type === "importExpenses") return; // Проверяется по фактически затронутым строкам после построения результата.
    if (!locations.length || locations.some((id) => !canView(user, access, id))) {
      throw Object.assign(new Error("Нет доступа к выбранной локации"), { statusCode: 403 });
    }
    return;
  }
  if (type === "dismissTrackerWarning") return;
  throw Object.assign(new Error("Неизвестная или недоступная операция"), { statusCode: 403 });
}

function assertImportLocations(before, after, user, access) {
  const locations = changedLocationIds(before, after);
  if (!locations.length || locations.some((id) => !canEdit(user, access, id))) {
    throw Object.assign(new Error("Импорт затрагивает локацию без права редактирования"), { statusCode: 403 });
  }
}

function stampActor(before, after, user) {
  const previousExpenses = new Map((before.expenses || []).map((item) => [item.id, JSON.stringify(item)]));
  (after.expenses || []).forEach((item) => {
    const previous = previousExpenses.get(item.id);
    if (!previous) {
      item.createdBy = user.name;
      item.createdById = user.id;
    } else if (previous !== JSON.stringify(item)) {
      item.updatedBy = user.name;
      item.updatedById = user.id;
    }
  });
  const previousTickets = new Map((before.forecastTickets || []).map((item) => [item.id, JSON.stringify(item)]));
  (after.forecastTickets || []).forEach((item) => {
    const previous = previousTickets.get(item.id);
    if (!previous) {
      item.createdBy = user.name;
      item.createdById = user.id;
    } else if (previous !== JSON.stringify(item)) {
      item.updatedBy = user.name;
      item.updatedById = user.id;
    }
  });
  const previousComments = new Set((before.comments || []).map((item) => item.id));
  (after.comments || []).forEach((item) => {
    if (!previousComments.has(item.id)) {
      item.createdBy = user.name;
      item.createdById = user.id;
    }
  });
  return after;
}

function lockResource(type, payload) {
  if (["updateExpense", "cancelExpense", "restoreExpense"].includes(type) && payload?.id) {
    return { resourceType: "expense", resourceId: payload.id };
  }
  if (["updateForecastAllocation", "releaseForecastTicket", "restoreForecastTicket", "convertForecastAllocation"].includes(type)
      && payload?.ticketId) {
    return { resourceType: "forecast", resourceId: payload.ticketId };
  }
  if (type === "saveBudget" && payload?.locationId && payload?.quarterKey) {
    return { resourceType: "budget", resourceId: `${payload.locationId}|${payload.quarterKey}` };
  }
  return null;
}

function auditEntity(type, payload) {
  if (type.includes("Expense")) return { entityType: "expense", entityId: payload?.id || payload?.expenseId || null };
  if (type.includes("Forecast")) return { entityType: "forecast", entityId: payload?.ticketId || null };
  if (type === "addComment") return { entityType: "comment", entityId: payload?.id || null };
  if (["saveBudget", "copyBudget", "importBudget"].includes(type)) {
    return { entityType: "budget", entityId: payload?.locationId && payload?.quarterKey ? `${payload.locationId}|${payload.quarterKey}` : null };
  }
  if (type.includes("Location")) return { entityType: "location", entityId: payload?.id || null };
  if (type.includes("Article")) return { entityType: "project", entityId: payload?.articleId || payload?.id || null };
  return { entityType: null, entityId: null };
}

module.exports = {
  ADMIN_MUTATIONS,
  SYSTEM_MUTATIONS,
  assertImportLocations,
  auditEntity,
  authorizeMutation,
  canEdit,
  canView,
  changedLocationIds,
  isAdmin,
  locationAccess,
  lockResource,
  mutationLocationIds,
  projectState,
  stampActor,
  warningLocation
};
