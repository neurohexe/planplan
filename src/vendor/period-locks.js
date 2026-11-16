"use strict";

/**
 * Модуль закрытия периодов (месяц / квартал).
 *
 * Закрытые периоды — это глобальная блокировка изменения финансовых данных
 * для ВСЕХ локаций сразу. Месяц закрывается операционно; квартал закрывается
 * только после закрытия всех трёх его месяцев и фиксирует контрольный снимок.
 *
 * Логика вынесена в отдельный модуль, чтобы её переиспользовать в app.js,
 * в импортах, в тестах и в будущем — в серверной проверке (тот же код станет
 * обязательной серверной валидацией внутри транзакции).
 *
 * Модуль не зависит от DOM и от состояния приложения: все функции принимают
 * state первым аргументом и работают с ним как с чистыми данными.
 */
((globalFactory) => {
  if (typeof module !== "undefined" && module.exports) module.exports = globalFactory();
  else globalThis.PeriodLocks = globalFactory();
})(() => {
  const SCHEMA_VERSION = 15;

  const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const QUARTER_KEY_RE = /^(\d{4})-Q([1-4])$/;

  function quarterOfMonth(monthNumber) {
    return Math.ceil(Number(monthNumber) / 3);
  }

  function monthKeyFromDate(isoDate) {
    const value = String(isoDate || "");
    const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])/);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  function quarterKeyOfMonth(monthKey) {
    const match = String(monthKey || "").match(MONTH_KEY_RE);
    if (!match) return "";
    return `${match[1]}-Q${quarterOfMonth(match[2])}`;
  }

  function quarterKeyFromDate(isoDate) {
    return quarterKeyOfMonth(monthKeyFromDate(isoDate));
  }

  function quarterMonths(quarterKey) {
    const match = String(quarterKey || "").match(QUARTER_KEY_RE);
    if (!match) return [];
    const year = Number(match[1]);
    const firstMonth = (Number(match[2]) - 1) * 3 + 1;
    return [0, 1, 2].map((offset) => `${year}-${String(firstMonth + offset).padStart(2, "0")}`);
  }

  function ensureClosedPeriods(state) {
    const next = state || {};
    next.closedPeriods ||= {};
    next.closedPeriods.months ||= {};
    next.closedPeriods.quarters ||= {};
    if (!next.closedPeriods.months || typeof next.closedPeriods.months !== "object") next.closedPeriods.months = {};
    if (!next.closedPeriods.quarters || typeof next.closedPeriods.quarters !== "object") next.closedPeriods.quarters = {};
    if (!Array.isArray(next.periodCloseHistory)) next.periodCloseHistory = [];
    return next;
  }

  function isMonthClosed(state, monthKey) {
    if (!MONTH_KEY_RE.test(String(monthKey || ""))) return false;
    const entry = state?.closedPeriods?.months?.[monthKey];
    return Boolean(entry && entry.closedAt);
  }

  function isQuarterClosed(state, quarterKey) {
    if (!QUARTER_KEY_RE.test(String(quarterKey || ""))) return false;
    const entry = state?.closedPeriods?.quarters?.[quarterKey];
    return Boolean(entry && entry.closedAt);
  }

  function quarterStatus(state, quarterKey) {
    if (!QUARTER_KEY_RE.test(String(quarterKey || ""))) return "open";
    if (isQuarterClosed(state, quarterKey)) return "closed";
    const months = quarterMonths(quarterKey);
    const closedCount = months.filter((month) => isMonthClosed(state, month)).length;
    return closedCount === months.length ? "ready_to_close" : "open";
  }

  function expenseMonthKey(expense) {
    if (!expense || !expense.expenseDate) return "";
    return monthKeyFromDate(expense.expenseDate);
  }

  function forecastAllocationMonthKey(allocation) {
    return monthKeyFromDate(allocation?.expectedDate);
  }

  function forecastAllocationQuarterKey(allocation) {
    if (allocation?.quarterKey && QUARTER_KEY_RE.test(allocation.quarterKey)) return allocation.quarterKey;
    return quarterKeyOfMonth(forecastAllocationMonthKey(allocation));
  }

  function forecastAllocations(state) {
    return (state?.forecastTickets || []).flatMap((ticket) =>
      (ticket?.allocations || []).map((allocation) => ({ ticket, allocation })));
  }

  function unresolvedForecastAllocations(state, periodKey, level) {
    return forecastAllocations(state).filter(({ allocation }) => {
      if (!allocation || Number(allocation.amount) <= 0) return false;
      if (!["active", "review"].includes(allocation.lifecycle)) return false;
      if (level === "month") return forecastAllocationMonthKey(allocation) === periodKey;
      return forecastAllocationQuarterKey(allocation) === periodKey;
    });
  }

  function assertNoUnresolvedForecasts(state, periodKey, level) {
    const unresolved = unresolvedForecastAllocations(state, periodKey, level);
    if (!unresolved.length) return;
    const active = unresolved.filter(({ allocation }) => allocation.lifecycle === "active").length;
    const review = unresolved.length - active;
    const details = [
      active ? `${active} активных` : "",
      review ? `${review} на проверке` : ""
    ].filter(Boolean).join(" и ");
    throw new Error(`Нельзя закрыть ${periodLabel(periodKey)}: осталось ${details} прогнозных распределений. Оплатите, освободите или перенесите их.`);
  }

  function assertMonthEditable(state, monthKey) {
    if (isMonthClosed(state, monthKey)) {
      const quarterKey = quarterKeyOfMonth(monthKey);
      throw new Error(`Месяц ${monthKey} закрыт. Сначала переоткройте его${isQuarterClosed(state, quarterKey) ? " (квартал закрыт — сначала переоткройте квартал)" : ""}.`);
    }
  }

  function assertQuarterEditable(state, quarterKey) {
    if (isQuarterClosed(state, quarterKey)) {
      throw new Error(`Квартал ${quarterKey} закрыт. Сначала переоткройте его, чтобы менять данные.`);
    }
  }

  function assertExpenseEditable(state, expense) {
    const monthKey = expenseMonthKey(expense);
    if (!monthKey) return;
    assertMonthEditable(state, monthKey);
  }

  function periodLabel(periodKey) {
    const monthMatch = String(periodKey || "").match(MONTH_KEY_RE);
    if (monthMatch) return `месяц ${periodKey}`;
    const quarterMatch = String(periodKey || "").match(QUARTER_KEY_RE);
    if (quarterMatch) return `квартал ${periodKey}`;
    return String(periodKey || "");
  }

  function pushHistory(state, action, level, periodKey, actor, reason) {
    state.periodCloseHistory = Array.isArray(state.periodCloseHistory) ? state.periodCloseHistory.slice(-199) : [];
    state.periodCloseHistory.push({
      action,
      level,
      periodKey,
      at: new Date().toISOString(),
      actor: actor || "Не указано",
      reason: reason || ""
    });
  }

  function closeMonth(state, monthKey, meta = {}) {
    if (!MONTH_KEY_RE.test(String(monthKey || ""))) throw new Error("Некорректный ключ месяца");
    ensureClosedPeriods(state);
    const quarterKey = quarterKeyOfMonth(monthKey);
    if (isQuarterClosed(state, quarterKey)) {
      throw new Error(`Квартал ${quarterKey} закрыт. Сначала переоткройте квартал, затем работайте с месяцем.`);
    }
    if (isMonthClosed(state, monthKey)) throw new Error(`Месяц ${monthKey} уже закрыт`);
    assertNoUnresolvedForecasts(state, monthKey, "month");
    state.closedPeriods.months[monthKey] = {
      closedAt: new Date().toISOString(),
      closedBy: meta.actor || "Не указано"
    };
    pushHistory(state, "close", "month", monthKey, meta.actor, meta.reason);
    return state;
  }

  function closeQuarter(state, quarterKey, meta = {}) {
    if (!QUARTER_KEY_RE.test(String(quarterKey || ""))) throw new Error("Некорректный ключ квартала");
    ensureClosedPeriods(state);
    if (isQuarterClosed(state, quarterKey)) throw new Error(`Квартал ${quarterKey} уже закрыт`);
    const months = quarterMonths(quarterKey);
    const closedCount = months.filter((month) => isMonthClosed(state, month)).length;
    if (closedCount !== months.length) {
      throw new Error(`Нельзя закрыть квартал: закрыто ${closedCount} из ${months.length} месяцев. Сначала закройте все месяцы.`);
    }
    assertNoUnresolvedForecasts(state, quarterKey, "quarter");
    const snapshot = periodCloseSnapshot(state, quarterKey);
    state.closedPeriods.quarters[quarterKey] = {
      closedAt: new Date().toISOString(),
      closedBy: meta.actor || "Не указано",
      snapshot
    };
    pushHistory(state, "close", "quarter", quarterKey, meta.actor, meta.reason);
    return state;
  }

  function reopenMonth(state, monthKey, meta = {}) {
    if (!MONTH_KEY_RE.test(String(monthKey || ""))) throw new Error("Некорректный ключ месяца");
    ensureClosedPeriods(state);
    const quarterKey = quarterKeyOfMonth(monthKey);
    if (isQuarterClosed(state, quarterKey)) {
      throw new Error(`Квартал ${quarterKey} закрыт. Сначала переоткройте квартал, затем отдельный месяц.`);
    }
    if (!isMonthClosed(state, monthKey)) throw new Error(`Месяц ${monthKey} не закрыт`);
    if (!meta.reason || !String(meta.reason).trim()) {
      throw new Error("Укажите причину переоткрытия месяца");
    }
    delete state.closedPeriods.months[monthKey];
    pushHistory(state, "reopen", "month", monthKey, meta.actor, meta.reason);
    return state;
  }

  function reopenQuarter(state, quarterKey, meta = {}) {
    if (!QUARTER_KEY_RE.test(String(quarterKey || ""))) throw new Error("Некорректный ключ квартала");
    ensureClosedPeriods(state);
    if (!isQuarterClosed(state, quarterKey)) throw new Error(`Квартал ${quarterKey} не закрыт`);
    if (!meta.reason || !String(meta.reason).trim()) {
      throw new Error("Укажите причину переоткрытия квартала");
    }
    delete state.closedPeriods.quarters[quarterKey];
    pushHistory(state, "reopen", "quarter", quarterKey, meta.actor, meta.reason);
    return state;
  }

  /**
   * Контрольный снимок квартала: план, факт и остаток по каждой локации,
   * проекту (статье) и валюте на момент закрытия. Снимок нужен, чтобы при
   * переоткрытии видеть, какие значения были зафиксированы, и в будущем —
   * для сравнения с фактическими данными. Снимок хранится в самой записи
   * закрытия квартала и не пересчитывается при изменении данных.
   */
  function periodCloseSnapshot(state, quarterKey) {
    if (!QUARTER_KEY_RE.test(String(quarterKey || ""))) return null;
    const locations = (state?.locations || []).filter((loc) => !loc.archived);
    const articles = (state?.articles || []).filter((article) => !article.archived);
    const expenses = (state?.expenses || []).filter((expense) =>
      expense.quarterKey === quarterKey && expense.status !== "canceled");
    const forecasts = forecastAllocations(state).map(({ allocation }) => allocation).filter((allocation) =>
      forecastAllocationQuarterKey(allocation) === quarterKey && allocation.lifecycle === "active");
    const budgets = state?.budgets || {};

    const byLocation = {};
    locations.forEach((loc) => {
      const byArticle = {};
      articles.forEach((article) => {
        const activeSubs = (article.subarticles || []).filter((sub) => !sub.archived);
        const itemKeys = activeSubs.length
          ? activeSubs.map((sub) => `${article.id}|${sub.id}`)
          : [article.id];
        const planByCurrency = {};
        const factByCurrency = {};
        const forecastByCurrency = {};
        itemKeys.forEach((itemKey) => {
          const store = budgets[`${loc.id}|${quarterKey}`];
          const amounts = store?.[itemKey];
          if (amounts && typeof amounts === "object") {
            Object.entries(amounts).forEach(([currency, amount]) => {
              if (!currency || !Number.isFinite(Number(amount)) || Number(amount) === 0) return;
              planByCurrency[currency] = (planByCurrency[currency] || 0) + Number(amount);
            });
          }
        });
        expenses.filter((e) => e.locationId === loc.id && e.articleId === article.id).forEach((expense) => {
          const currency = expense.currency;
          if (!currency) return;
          factByCurrency[currency] = (factByCurrency[currency] || 0) + (Number(expense.amount) || 0);
        });
        forecasts.filter((allocation) => allocation.locationId === loc.id && allocation.articleId === article.id)
          .forEach((allocation) => {
            const currency = allocation.currency;
            if (!currency) return;
            forecastByCurrency[currency] = (forecastByCurrency[currency] || 0) + (Number(allocation.amount) || 0);
          });
        const currencies = new Set([
          ...Object.keys(planByCurrency), ...Object.keys(factByCurrency), ...Object.keys(forecastByCurrency)
        ]);
        if (!currencies.size) return;
        byArticle[article.id] = {};
        currencies.forEach((currency) => {
          const plan = planByCurrency[currency] || 0;
          const fact = factByCurrency[currency] || 0;
          const forecast = forecastByCurrency[currency] || 0;
          byArticle[article.id][currency] = {
            plan,
            fact,
            forecast,
            balance: plan - fact,
            free: plan - fact - forecast
          };
        });
      });
      if (Object.keys(byArticle).length) byLocation[loc.id] = byArticle;
    });

    return { quarterKey, at: new Date().toISOString(), byLocation };
  }

  /**
   * Быстрая сводка периода для UI и подтверждения закрытия:
   * количество расходов и суммы плана/факта по валютам (по всем локациям).
   */
  function periodSummary(state, periodKey, level) {
    let quarterKey;
    let monthKey;
    if (level === "month") {
      if (!MONTH_KEY_RE.test(String(periodKey || ""))) return null;
      monthKey = periodKey;
      quarterKey = quarterKeyOfMonth(periodKey);
    } else {
      if (!QUARTER_KEY_RE.test(String(periodKey || ""))) return null;
      quarterKey = periodKey;
    }
    const expenses = (state?.expenses || []).filter((expense) => {
      if (expense.status === "canceled") return false;
      if (expense.quarterKey !== quarterKey) return false;
      if (level === "month" && monthKeyFromDate(expense.expenseDate) !== monthKey) return false;
      return true;
    });
    const forecastEntries = forecastAllocations(state).filter(({ allocation }) => {
      if (allocation.lifecycle !== "active") return false;
      if (forecastAllocationQuarterKey(allocation) !== quarterKey) return false;
      if (level === "month" && forecastAllocationMonthKey(allocation) !== monthKey) return false;
      return true;
    });
    const unresolvedEntries = unresolvedForecastAllocations(state, periodKey, level);
    const planByCurrency = {};
    const factByCurrency = {};
    const forecastByCurrency = {};
    const budgets = state?.budgets || {};
    Object.keys(budgets).forEach((storeKey) => {
      if (!storeKey.endsWith(`|${quarterKey}`)) return;
      const store = budgets[storeKey];
      Object.values(store || {}).forEach((amounts) => {
        if (!amounts || typeof amounts !== "object") return;
        Object.entries(amounts).forEach(([currency, amount]) => {
          if (!currency || !Number.isFinite(Number(amount)) || Number(amount) === 0) return;
          planByCurrency[currency] = (planByCurrency[currency] || 0) + Number(amount);
        });
      });
    });
    expenses.forEach((expense) => {
      const currency = expense.currency;
      if (!currency) return;
      factByCurrency[currency] = (factByCurrency[currency] || 0) + (Number(expense.amount) || 0);
    });
    forecastEntries.forEach(({ allocation }) => {
      const currency = allocation.currency;
      if (!currency) return;
      forecastByCurrency[currency] = (forecastByCurrency[currency] || 0) + (Number(allocation.amount) || 0);
    });
    const currencies = [...new Set([
      ...Object.keys(planByCurrency), ...Object.keys(factByCurrency), ...Object.keys(forecastByCurrency)
    ])].sort();
    return {
      periodKey,
      level,
      quarterKey,
      monthKey: monthKey || null,
      expenseCount: expenses.length,
      forecastCount: forecastEntries.length,
      unresolvedForecastCount: unresolvedEntries.length,
      planByCurrency,
      factByCurrency,
      forecastByCurrency,
      currencies
    };
  }

  return {
    SCHEMA_VERSION,
    MONTH_KEY_RE,
    QUARTER_KEY_RE,
    monthKeyFromDate,
    quarterKeyOfMonth,
    quarterKeyFromDate,
    quarterMonths,
    ensureClosedPeriods,
    isMonthClosed,
    isQuarterClosed,
    quarterStatus,
    expenseMonthKey,
    forecastAllocationMonthKey,
    forecastAllocationQuarterKey,
    unresolvedForecastAllocations,
    assertNoUnresolvedForecasts,
    assertMonthEditable,
    assertQuarterEditable,
    assertExpenseEditable,
    closeMonth,
    closeQuarter,
    reopenMonth,
    reopenQuarter,
    periodCloseSnapshot,
    periodSummary,
    periodLabel
  };
});
