"use strict";

const ACCESS_LEVELS = new Set(["hidden", "view", "edit"]);

function normalizeAccess(value, fallback = "hidden") {
  return ACCESS_LEVELS.has(value) ? value : fallback;
}

function locationPermission(account, locationId) {
  if (!account || account.archived || account.active === false) return "hidden";
  if (account.accessSource === "tirole" && account.accessScope === "all-locations"
      && ["member", "admin"].includes(account.role)) return "edit";
  if (account.role === "admin" || account.role === "superadmin") return "edit";
  if (Object.prototype.hasOwnProperty.call(account.locationAccess || {}, locationId)) {
    return normalizeAccess(account.locationAccess[locationId], "hidden");
  }
  return account.defaultLocationAccess === "view" ? "view" : "hidden";
}

function canViewLocation(account, locationId) {
  return locationPermission(account, locationId) !== "hidden";
}

function visibleClosedPeriods(closedPeriods, visibleLocationIds) {
  const source = closedPeriods && typeof closedPeriods === "object" ? closedPeriods : {};
  const quarters = {};
  Object.entries(source.quarters || {}).forEach(([quarterKey, entry]) => {
    const snapshot = entry?.snapshot;
    const byLocation = {};
    Object.entries(snapshot?.byLocation || {}).forEach(([locationId, value]) => {
      if (visibleLocationIds.has(locationId)) byLocation[locationId] = value;
    });
    quarters[quarterKey] = snapshot
      ? { ...entry, snapshot: { ...snapshot, byLocation } }
      : entry;
  });
  return { months: { ...(source.months || {}) }, quarters };
}

function visibleState(state, account) {
  const visibleLocationIds = new Set(
    (state.locations || [])
      .filter((location) => canViewLocation(account, location.id))
      .map((location) => location.id)
  );
  const visibleExpenseIds = new Set(
    (state.expenses || [])
      .filter((expense) => visibleLocationIds.has(expense.locationId))
      .map((expense) => expense.id)
  );
  const forecastTickets = (state.forecastTickets || []).map((ticket) => ({
    ...ticket,
    allocations: (ticket.allocations || [])
      .filter((allocation) => visibleLocationIds.has(allocation.locationId))
  })).filter((ticket) => ticket.allocations.length > 0);
  const budgets = {};
  Object.entries(state.budgets || {}).forEach(([key, value]) => {
    if (visibleLocationIds.has(key.split("|")[0])) budgets[key] = value;
  });
  const monthlyBudgets = {};
  Object.entries(state.monthlyBudgets || {}).forEach(([key, value]) => {
    if (visibleLocationIds.has(key.split("|")[0])) monthlyBudgets[key] = value;
  });
  const responsibleGroups = {};
  Object.entries(state.responsibleGroups || {}).forEach(([key, value]) => {
    if (visibleLocationIds.has(key.split("|")[0])) responsibleGroups[key] = value;
  });
  const projectAttributes = {};
  Object.entries(state.projectAttributes || {}).forEach(([key, value]) => {
    if (visibleLocationIds.has(key.split("|")[0])) projectAttributes[key] = value;
  });
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    locations: (state.locations || []).filter((location) => visibleLocationIds.has(location.id)),
    articles: state.articles || [],
    budgets,
    monthlyBudgets,
    responsibleGroups,
    projectAttributes,
    expenses: (state.expenses || []).filter((expense) => visibleLocationIds.has(expense.locationId)),
    forecastTickets,
    comments: (state.comments || []).filter((comment) => visibleExpenseIds.has(comment.expenseId)),
    imports: ["admin", "superadmin"].includes(account?.role) ? (state.imports || []) : [],
    closedPeriods: visibleClosedPeriods(state.closedPeriods, visibleLocationIds),
    periodCloseHistory: state.periodCloseHistory || [],
    expenseImports: ["admin", "superadmin"].includes(account?.role) ? (state.expenseImports || []) : []
  };
}

module.exports = {
  canViewLocation,
  locationPermission,
  normalizeAccess,
  visibleClosedPeriods,
  visibleState
};
