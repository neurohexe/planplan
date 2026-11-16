(function (root, factory) {
  "use strict";
  const budgetImport = root?.BudgetImport
    || (typeof require === "function" ? require("./budget-import.js") : null);
  const periodLocks = root?.PeriodLocks
    || (typeof require === "function" ? require("./period-locks.js") : null);
  const api = factory(budgetImport, periodLocks);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ExpenseImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (BudgetImport, PeriodLocks) {
  "use strict";

  if (!BudgetImport) throw new Error("Модуль импорта расходов требует budget-import.js");
  if (!PeriodLocks) throw new Error("Модуль импорта расходов требует period-locks.js");

  const SOURCE_TYPE = "expense-report";
  const SOURCE_TICKET_KEY_VERSION = 1;
  const STATUS_MODES = new Set(["forecast"]);
  const DATE_FIELDS = new Set(["expected", "reservation"]);
  const SKIP_MAPPING = "__skip__";
  const HEADER_ALIASES = Object.freeze({
    businessUnit: ["Бизнес-юнит (описание)", "Бизнес-юнит"],
    oe: ["Данные в ЗП: ОЕ", "ОЕ"],
    requestNumber: ["Данные в ЗП: № ЗП", "№ ЗП", "Номер ЗП"],
    status: ["Данные в ЗП: Статус ЗП", "Статус ЗП", "Статус"],
    description: ["Данные в ЗП: Описание ЗП", "Описание ЗП"],
    reservationDate: ["Данные в ЗП: Дата резервирования", "Дата резервирования"],
    expectedDate: ["Данные в ЗП: Ожидаемая дата", "Ожидаемая дата"],
    currency: ["Данные в ЗП: Валюта", "Валюта"],
    cfoCode: ["Аналитики (коды): ЦФО", "ЦФО"],
    cfoName: ["Аналитики (описание): ЦФО, описание", "ЦФО, описание"],
    projectCode: ["Проект", "Код проекта"],
    projectName: ["Проект, описание", "Описание проекта"],
    programCode: ["Аналитики (коды): Программа", "Программа"],
    programName: ["Аналитики (описание): Программа, описание", "Программа, описание"],
    serviceCode: ["Аналитики (коды): Сервис", "Сервис"],
    serviceName: ["Аналитики (описание): Сервис, описание", "Сервис, описание"],
    locationCode: ["Аналитики (коды): Офис / Датацентр (Аналитика)", "Код офиса"],
    locationName: ["Аналитики (описание): Офис / Датацентр (Аналитика), описание", "Офис, описание"],
    procurementCategory: ["Данные в ЗП: Закупочная категория", "Закупочная категория"],
    gaapCode: ["Аналитики (коды): Счет GAAP", "Счет GAAP"],
    gaapName: ["Аналитики (описание): Счет GAAP, Описание", "Счет GAAP, Описание"],
    supplier: ["Данные в ЗП: Поставщик", "Поставщик"],
    initiator: ["Данные о логистике: Инициатор ЗП", "Инициатор ЗП"],
    ticketUrl: ["Данные о логистике: Тикет ДП", "Тикет ДП", "Тикет"],
    amount: ["Сумма без НДС, в валюте ЗП", "Сумма без НДС"],
    amountRub: ["Сумма без НДС (RUB)"]
  });

  const cleanText = BudgetImport.cleanText;
  const comparisonKey = BudgetImport.comparisonKey;
  const normalizeCode = BudgetImport.normalizeCode;
  const normalizeCurrencyCode = BudgetImport.normalizeCurrencyCode;

  function findColumn(row, aliases) {
    const wanted = new Set(aliases.map(comparisonKey));
    return Object.keys(row || {}).find((column) => wanted.has(comparisonKey(row[column]))) || "";
  }

  function headerLayout(xml, sharedStrings, sheetName) {
    const candidates = BudgetImport.rowsFromWorksheet(xml, sharedStrings, null, 30);
    for (const candidate of candidates) {
      const columns = {};
      Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
        columns[field] = findColumn(candidate.cells, aliases);
      });
      if (columns.requestNumber && columns.status && columns.reservationDate && columns.expectedDate
        && columns.currency && columns.projectCode && columns.locationCode && columns.ticketUrl && columns.amount) {
        return { headerRow: candidate.number, columns };
      }
    }
    throw new Error(`На листе ${sheetName} не найдены обязательные колонки отчёта по ЗП`);
  }

  function excelDate(value) {
    const text = cleanText(String(value ?? ""), 40);
    if (!text) return "";
    let match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match) return validIsoDate(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
    match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return validIsoDate(`${match[1]}-${match[2]}-${match[3]}`);
    const serial = Number(text.replace(",", "."));
    if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return "";
    const milliseconds = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }

  function validIsoDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1])
      && date.getUTCMonth() === Number(match[2]) - 1
      && date.getUTCDate() === Number(match[3]) ? value : "";
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function parseRow(cells, columns, sourceRow) {
    const value = (field) => columns[field] ? cells[columns[field]] : "";
    const amount = BudgetImport.numericCell(value("amount"));
    const amountRub = BudgetImport.numericCell(value("amountRub"));
    return {
      sourceRow,
      businessUnit: cleanText(value("businessUnit"), 160),
      oe: cleanText(value("oe"), 120),
      requestNumber: cleanText(String(value("requestNumber") ?? ""), 80),
      status: cleanText(value("status"), 80),
      description: cleanText(value("description"), 500),
      reservationDate: excelDate(value("reservationDate")),
      expectedDate: excelDate(value("expectedDate")),
      currency: normalizeCurrencyCode(value("currency")),
      cfoCode: normalizeCode(value("cfoCode")),
      cfoName: cleanText(value("cfoName"), 160),
      projectCode: normalizeCode(value("projectCode")),
      projectName: cleanText(value("projectName"), 160),
      programCode: normalizeCode(value("programCode")),
      programName: cleanText(value("programName"), 160),
      serviceCode: normalizeCode(value("serviceCode")),
      serviceName: cleanText(value("serviceName"), 160),
      locationCode: normalizeCode(value("locationCode")),
      locationName: cleanText(value("locationName"), 160),
      procurementCategory: cleanText(value("procurementCategory"), 160),
      gaapCode: normalizeCode(value("gaapCode")),
      gaapName: cleanText(value("gaapName"), 160),
      supplier: cleanText(value("supplier"), 180),
      initiator: cleanText(value("initiator"), 120),
      ticketUrl: cleanText(value("ticketUrl"), 500),
      amount: amount.value,
      amountValid: amount.valid,
      amountRub: amountRub.value,
      amountRubValid: amountRub.valid
    };
  }

  async function parseExpenseWorkbook(input, options = {}) {
    const workbook = await BudgetImport.readWorkbook(input);
    let chosen = null;
    const errors = [];
    for (const [sheetName, xml] of workbook.sheetXml) {
      try {
        chosen = { sheetName, xml, layout: headerLayout(xml, workbook.sharedStrings, sheetName) };
        break;
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (!chosen) throw new Error(errors[0] || "В книге нет листа со структурой отчёта по ЗП");
    const wanted = new Set(Object.values(chosen.layout.columns).filter(Boolean));
    const rows = BudgetImport.rowsFromWorksheet(chosen.xml, workbook.sharedStrings, wanted)
      .filter((row) => row.number > chosen.layout.headerRow)
      .map((row) => parseRow(row.cells, chosen.layout.columns, row.number))
      .filter((row) => Object.values(row).some((value) => value !== "" && value !== 0 && value !== true));
    if (!rows.length) throw new Error("В отчёте нет строк расходов");
    return {
      sourceFile: cleanText(options.sourceFile || "expense-report.xlsx", 200),
      sheetName: chosen.sheetName,
      rows,
      stats: {
        sourceRows: rows.length,
        invalidAmountCells: rows.filter((row) => !row.amountValid).length,
        currencies: [...new Set(rows.map((row) => row.currency).filter(Boolean))].sort(),
        statuses: [...new Set(rows.map((row) => row.status).filter(Boolean))].sort()
      }
    };
  }

  function mappingKey(row) {
    return JSON.stringify([
      normalizeCode(row.locationCode), normalizeCode(row.projectCode), normalizeCode(row.programCode),
      comparisonKey(row.procurementCategory), normalizeCode(row.gaapCode), normalizeCurrencyCode(row.currency)
    ]);
  }

  function normalizeStatusMode(value) {
    return STATUS_MODES.has(value) ? value : "forecast";
  }

  function normalizeDateField(value) {
    return DATE_FIELDS.has(value) ? value : "expected";
  }

  function sourceForecastTicketKey(row) {
    const requestNumber = cleanText(String(row?.requestNumber ?? ""), 80);
    return requestNumber ? `${SOURCE_TYPE}:ticket:v${SOURCE_TICKET_KEY_VERSION}:${requestNumber}` : "";
  }

  function forecastStatusLifecycle(status, amount) {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return "review";
    const key = comparisonKey(status);
    if (["В работе", "Предварительно утвержден", "Утвержден"].map(comparisonKey).includes(key)) return "active";
    if (["Отклонен", "Не завершен"].map(comparisonKey).includes(key)) return "released";
    return "review";
  }

  function forecastStatusReason(status, lifecycle) {
    if (lifecycle === "active") return "Деньги зарезервированы";
    if (lifecycle === "released") return `Резерв освобождён: ${status || "статус источника"}`;
    if (comparisonKey(status) === comparisonKey("Закрыт")) return "Закрытый тикет требует подтверждения оплаты";
    return `Требует проверки: ${status || "статус не задан"}`;
  }

  function forecastAllocationBaseKey(row) {
    const ticketKey = sourceForecastTicketKey(row);
    if (!ticketKey) return "";
    const identity = [
      normalizeCurrencyCode(row.currency), normalizeCode(row.cfoCode), normalizeCode(row.projectCode),
      normalizeCode(row.programCode), normalizeCode(row.serviceCode), normalizeCode(row.locationCode),
      comparisonKey(row.procurementCategory), normalizeCode(row.gaapCode),
      comparisonKey(row.supplier), comparisonKey(row.ticketUrl)
    ];
    return `${ticketKey}:allocation:${JSON.stringify(identity)}`;
  }

  function quarterKeyFromDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
    return match ? `${match[1]}-Q${Math.floor((Number(match[2]) - 1) / 3) + 1}` : "";
  }

  function stateLocation(state, code) {
    return (state.locations || []).filter((location) => normalizeCode(location.code) === normalizeCode(code));
  }

  function stateProject(state, row) {
    const matches = (state.articles || []).filter((article) => !article.archived
      && normalizeCode(article.code) === normalizeCode(row.projectCode));
    if (matches.length <= 1) return matches;
    const exactNames = matches.filter((article) => comparisonKey(article.name) === comparisonKey(row.projectName));
    return exactNames.length === 1 ? exactNames : matches;
  }

  function amountCurrencies(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
  }

  function budgetedSubarticles(state, locationId, article, currency, quarterKey) {
    const store = state.budgets?.[`${locationId}|${quarterKey}`] || {};
    return (article.subarticles || []).filter((subarticle) => {
      const amounts = store[`${article.id}|${subarticle.id}`];
      return Number(amounts?.[currency]) !== 0 && Number.isFinite(Number(amounts?.[currency]));
    });
  }

  function budgetedSubarticlesAnyPeriod(state, locationId, article, currency) {
    const ids = new Set();
    Object.entries(state.budgets || {}).forEach(([storeKey, store]) => {
      if (!storeKey.startsWith(`${locationId}|`) || !store || typeof store !== "object") return;
      (article.subarticles || []).forEach((subarticle) => {
        const amount = store[`${article.id}|${subarticle.id}`]?.[currency];
        if (Number.isFinite(Number(amount)) && Number(amount) !== 0) ids.add(subarticle.id);
      });
    });
    return (article.subarticles || []).filter((subarticle) => ids.has(subarticle.id));
  }

  function matchingSubarticleBySource(article, row) {
    const sourceNames = new Set([
      row.programName, row.procurementCategory, row.gaapName
    ].map(comparisonKey).filter(Boolean));
    const matches = (article.subarticles || []).filter((subarticle) => !subarticle.archived
      && sourceNames.has(comparisonKey(subarticle.name)));
    return matches.length === 1 ? matches[0] : null;
  }

  function candidateSubarticles(state, location, article, row, expenseDate) {
    const current = budgetedSubarticles(state, location.id, article, row.currency, quarterKeyFromDate(expenseDate));
    if (current.length) return current;
    const anyPeriod = budgetedSubarticlesAnyPeriod(state, location.id, article, row.currency);
    if (anyPeriod.length) return anyPeriod;
    return (article.subarticles || []).filter((subarticle) => !subarticle.archived);
  }

  function automaticSubarticle(state, location, article, row, expenseDate) {
    const exactSourceMatch = matchingSubarticleBySource(article, row);
    if (exactSourceMatch) return exactSourceMatch;
    const current = budgetedSubarticles(state, location.id, article, row.currency, quarterKeyFromDate(expenseDate));
    if (current.length === 1) return current[0];
    const anyPeriod = budgetedSubarticlesAnyPeriod(state, location.id, article, row.currency);
    if (anyPeriod.length === 1) return anyPeriod[0];
    const active = (article.subarticles || []).filter((subarticle) => !subarticle.archived);
    return active.length === 1 ? active[0] : null;
  }

  function plannedCurrencies(state, locationId, articleId, subarticleId, expenseDate) {
    const store = state.budgets?.[`${locationId}|${quarterKeyFromDate(expenseDate)}`] || {};
    if (subarticleId) return amountCurrencies(store[`${articleId}|${subarticleId}`]);
    const currencies = new Set(amountCurrencies(store[articleId]));
    Object.entries(store).forEach(([itemKey, values]) => {
      if (!itemKey.startsWith(`${articleId}|`)) return;
      amountCurrencies(values).forEach((currency) => currencies.add(currency));
    });
    return [...currencies].sort();
  }

  function expenseComment(row) {
    return cleanText([
      `ЗП №${row.requestNumber}`,
      row.supplier ? `Поставщик: ${row.supplier}` : "",
      row.description
    ].filter(Boolean).join(" · "), 500);
  }

  function desiredForecastAllocation(row, location, article, subarticle, expectedDate, sourceFile, allocationKey) {
    const lifecycle = forecastStatusLifecycle(row.status, row.amount);
    return {
      sourceAllocationKey: allocationKey,
      locationId: location.id,
      articleId: article.id,
      subarticleId: subarticle?.id || null,
      currency: row.currency,
      amount: Math.max(0, Number(row.amount) || 0),
      expectedDate,
      quarterKey: quarterKeyFromDate(expectedDate),
      lifecycle,
      lifecycleSource: "source",
      stale: false,
      comment: expenseComment(row),
      sourceFile: cleanText(sourceFile, 200),
      sourceStatus: row.status,
      sourceReservationDate: row.reservationDate,
      sourceExpectedDate: row.expectedDate,
      sourceRow: row.sourceRow,
      convertedExpenseId: null,
      convertedAmount: null,
      releaseReason: lifecycle === "released" ? forecastStatusReason(row.status, lifecycle) : ""
    };
  }

  function forecastAllocationChanged(existing, desired) {
    return existing.locationId !== desired.locationId
      || existing.articleId !== desired.articleId
      || existing.subarticleId !== desired.subarticleId
      || existing.currency !== desired.currency
      || Number(existing.amount) !== Number(desired.amount)
      || existing.expectedDate !== desired.expectedDate
      || existing.lifecycle !== desired.lifecycle
      || existing.lifecycleSource !== desired.lifecycleSource
      || existing.stale === true
      || existing.comment !== desired.comment
      || existing.sourceStatus !== desired.sourceStatus
      || existing.sourceReservationDate !== desired.sourceReservationDate
      || existing.sourceExpectedDate !== desired.sourceExpectedDate;
  }

  function ticketLifecycle(allocations) {
    const states = new Set((allocations || []).map((allocation) => allocation.lifecycle));
    if (states.has("active")) return "active";
    if (states.has("review")) return "review";
    if (states.size === 1 && states.has("converted")) return "converted";
    if (states.has("converted") && states.has("released")) return "converted";
    return "released";
  }

  function buildExpenseImportPreview(state, rawRows, options = {}) {
    if (!state || typeof state !== "object") throw new Error("Нет текущего состояния приложения");
    if (!Array.isArray(rawRows) || !rawRows.length) throw new Error("В отчёте нет строк прогнозов");
    const sourceFile = cleanText(options.sourceFile || "expense-report.xlsx", 200);
    const statusMode = normalizeStatusMode(options.statusMode);
    const dateField = normalizeDateField(options.dateField);
    const today = validIsoDate(options.today) || new Date().toISOString().slice(0, 10);
    const mappings = options.mappings && typeof options.mappings === "object" ? options.mappings : {};
    const existingTickets = new Map((state.forecastTickets || [])
      .filter((ticket) => ticket.sourceType === SOURCE_TYPE && ticket.sourceTicketKey)
      .map((ticket) => [ticket.sourceTicketKey, ticket]));
    const allocationOccurrences = new Map();
    const mappingGroups = new Map();
    const previewRows = [];

    [...rawRows].sort((left, right) => Number(left.sourceRow) - Number(right.sourceRow)).forEach((row) => {
      const base = { sourceRow: row.sourceRow, source: row, action: "invalid", reason: "" };
      if (!row.amountValid || !Number.isFinite(Number(row.amount))) {
        previewRows.push({ ...base, reason: "Некорректная сумма" });
        return;
      }
      const expectedDate = dateField === "reservation" ? row.reservationDate : row.expectedDate;
      if (!validIsoDate(expectedDate)) {
        previewRows.push({ ...base, reason: "Некорректная дата прогноза" });
        return;
      }
      const ticketKey = sourceForecastTicketKey(row);
      const allocationBaseKey = forecastAllocationBaseKey(row);
      if (!ticketKey || !allocationBaseKey) {
        previewRows.push({ ...base, reason: "Не указан номер прогнозного тикета" });
        return;
      }
      if (!normalizeCurrencyCode(row.currency)) {
        previewRows.push({ ...base, reason: "Некорректная валюта" });
        return;
      }
      const ticketUrl = safeHttpUrl(row.ticketUrl);
      const missingTicketUrl = !ticketUrl;
      if (missingTicketUrl && Number(row.amount) > 0) {
        previewRows.push({ ...base, reason: "Некорректная или отсутствующая ссылка на тикет" });
        return;
      }
      const locations = stateLocation(state, row.locationCode);
      const projects = stateProject(state, row);
      if (locations.length !== 1 || projects.length !== 1) {
        const missing = locations.length !== 1
          ? `не найдена локация ${row.locationCode}`
          : `не найден проект ${row.projectCode}`;
        previewRows.push(Number(row.amount) === 0
          ? { ...base, action: "excluded-zero", reason: `Нулевая строка пропущена: ${missing}` }
          : { ...base, action: "missing-reference", reason: missing[0].toLocaleUpperCase("ru") + missing.slice(1) });
        return;
      }
      const location = locations[0];
      const article = projects[0];
      const occurrence = (allocationOccurrences.get(allocationBaseKey) || 0) + 1;
      allocationOccurrences.set(allocationBaseKey, occurrence);
      const allocationKey = `${allocationBaseKey}:n${occurrence}`;
      const currentTicket = existingTickets.get(ticketKey);
      const current = (currentTicket?.allocations || []).find((allocation) =>
        allocation.sourceAllocationKey === allocationKey);
      const groupKey = mappingKey(row);
      const activeSubs = (article.subarticles || []).filter((subarticle) => !subarticle.archived);
      const explicitMapping = cleanText(mappings[groupKey], 120);
      const automatic = automaticSubarticle(state, location, article, row, expectedDate);
      const existingSubarticle = current
        && current.locationId === location.id
        && current.articleId === article.id
        ? activeSubs.find((item) => item.id === current.subarticleId) || null
        : null;
      const reuseProjectLevel = Boolean(current
        && current.locationId === location.id
        && current.articleId === article.id
        && !current.subarticleId);
      const ambiguous = !existingSubarticle && !reuseProjectLevel && !automatic;
      const mappedSubarticle = explicitMapping && explicitMapping !== SKIP_MAPPING
        ? activeSubs.find((item) => item.id === explicitMapping) || null
        : null;
      const subarticle = mappedSubarticle || existingSubarticle || (reuseProjectLevel ? null : automatic);

      if (ambiguous) {
        const candidates = candidateSubarticles(state, location, article, row, expectedDate);
        if (!mappingGroups.has(groupKey)) {
          mappingGroups.set(groupKey, {
            key: groupKey,
            projectCode: row.projectCode,
            projectName: article.name,
            sourceLabel: row.procurementCategory || row.gaapName || row.programName || "Без аналитики",
            selectedId: explicitMapping,
            rows: 0,
            candidates: new Map()
          });
        }
        const group = mappingGroups.get(groupKey);
        group.rows += 1;
        candidates.forEach((candidate) => group.candidates.set(candidate.id, candidate));
      }
      if (explicitMapping === SKIP_MAPPING) {
        previewRows.push({ ...base, action: "excluded-mapping", reason: "Группа явно пропущена" });
        return;
      }
      let effectiveSubarticle = subarticle;
      let currencyWarning = "";
      const selectedCurrencies = plannedCurrencies(
        state, location.id, article.id, subarticle?.id || null, expectedDate
      );
      if (Number(row.amount) > 0 && selectedCurrencies.length && !selectedCurrencies.includes(row.currency)) {
        const projectCurrencies = plannedCurrencies(state, location.id, article.id, null, expectedDate);
        if (!mappedSubarticle && !existingSubarticle) effectiveSubarticle = null;
        currencyWarning = projectCurrencies.includes(row.currency)
          ? `В выбранной статье нет ${row.currency} — учтено на уровне проекта`
          : `В плане проекта нет ${row.currency} (есть: ${projectCurrencies.join(", ") || selectedCurrencies.join(", ")}) — сохранено в валюте отчёта на уровне проекта`;
      }
      const desired = desiredForecastAllocation(
        row, location, article, effectiveSubarticle, expectedDate, sourceFile, allocationKey
      );
      if (current && ["manual", "conversion"].includes(current.lifecycleSource)) {
        desired.lifecycle = current.lifecycle;
        desired.lifecycleSource = current.lifecycleSource;
        desired.convertedExpenseId = current.convertedExpenseId || null;
        desired.convertedAmount = current.convertedAmount ?? null;
        desired.releaseReason = current.releaseReason || "";
      }
      const unchanged = Boolean(current) && !forecastAllocationChanged(current, desired);
      const statusReason = forecastStatusReason(row.status, desired.lifecycle);
      const overdue = desired.lifecycle === "active" && expectedDate < today;
      const futureClosed = comparisonKey(row.status) === comparisonKey("Закрыт") && expectedDate > today;
      const reason = [
        statusReason,
        !effectiveSubarticle ? "Статья не определена — учтено на уровне проекта" : "",
        currencyWarning,
        missingTicketUrl ? "Ссылка на тикет отсутствует" : "",
        overdue ? "Ожидаемая дата прошла" : "",
        futureClosed ? "Статус и будущая дата конфликтуют" : ""
      ]
        .filter(Boolean).join(" · ");
      const periodClosed = PeriodLocks.isMonthClosed(state, PeriodLocks.monthKeyFromDate(expectedDate));
      let action = !current ? "new" : unchanged ? "unchanged" : "update";
      if (periodClosed && action !== "unchanged") action = "closed-period";
      previewRows.push({
        ...base,
        action,
        reason: periodClosed && action === "closed-period"
          ? `Месяц ${PeriodLocks.monthKeyFromDate(expectedDate)} закрыт. Сначала переоткройте его.`
          : reason,
        forecast: desired,
        ticket: {
          sourceTicketKey: ticketKey,
          sourceRequestNumber: row.requestNumber,
          ticketUrl,
          description: cleanText(row.description, 500),
          supplier: cleanText(row.supplier, 180),
          sourceFile,
          sourceStatus: row.status
        },
        existingTicketId: currentTicket?.id || null,
        existingAllocationId: current?.id || null,
        currencyWarning: Boolean(currencyWarning),
        overdue,
        futureClosed
      });
    });

    const rowsByExistingTicket = new Map();
    previewRows.filter((row) => row.ticket && ["new", "update", "unchanged"].includes(row.action)).forEach((row) => {
      if (!rowsByExistingTicket.has(row.ticket.sourceTicketKey)) rowsByExistingTicket.set(row.ticket.sourceTicketKey, []);
      rowsByExistingTicket.get(row.ticket.sourceTicketKey).push(row);
    });
    rowsByExistingTicket.forEach((rows, ticketKey) => {
      const currentTicket = existingTickets.get(ticketKey);
      if (!currentTicket) return;
      const incomingKeys = new Set(rows.map((row) => row.forecast.sourceAllocationKey));
      const missingCount = (currentTicket.allocations || []).filter((allocation) =>
        allocation.sourceAllocationKey && !incomingKeys.has(allocation.sourceAllocationKey) && allocation.stale !== true).length;
      if (!missingCount) return;
      const marker = rows.find((row) => row.action === "unchanged") || rows[0];
      if (marker.action === "unchanged") marker.action = "update";
      marker.reason = [marker.reason, `${missingCount} прежних распределений отсутствуют в свежем отчёте и будут помечены для проверки`]
        .filter(Boolean).join(" · ");
    });

    const count = (action) => previewRows.filter((row) => row.action === action).length;
    const blockingRows = count("missing-reference") + count("invalid");
    const closedPeriodRows = count("closed-period");
    const applicableRows = previewRows.filter((row) => ["new", "update", "unchanged"].includes(row.action));
    const normalizedMappingGroups = [...mappingGroups.values()].map((group) => ({
      ...group,
      candidates: [...group.candidates.values()].sort((left, right) => left.name.localeCompare(right.name, "ru"))
    })).sort((left, right) => left.projectName.localeCompare(right.projectName, "ru") || left.sourceLabel.localeCompare(right.sourceLabel, "ru"));
    return {
      sourceFile,
      statusMode,
      dateField,
      today,
      rows: previewRows,
      mappingGroups: normalizedMappingGroups,
      canApply: closedPeriodRows === 0 && (count("new") + count("update") > 0),
      stats: {
        sourceRows: rawRows.length,
        selectedRows: applicableRows.length,
        ticketRows: new Set(applicableRows.map((row) => row.ticket.sourceTicketKey)).size,
        newRows: count("new"),
        updatedRows: count("update"),
        unchangedRows: count("unchanged"),
        activeRows: applicableRows.filter((row) => row.forecast.lifecycle === "active").length,
        releasedRows: applicableRows.filter((row) => row.forecast.lifecycle === "released").length,
        reviewRows: applicableRows.filter((row) => row.forecast.lifecycle === "review").length,
        convertedRows: applicableRows.filter((row) => row.forecast.lifecycle === "converted").length,
        overdueRows: applicableRows.filter((row) => row.overdue).length,
        futureClosedRows: applicableRows.filter((row) => row.futureClosed).length,
        canceledExistingRows: 0,
        skippedStatusRows: 0,
        zeroRows: applicableRows.filter((row) => Number(row.forecast.amount) === 0).length,
        futureRows: 0,
        mappingSkippedRows: count("excluded-mapping") + count("excluded-zero"),
        invalidRows: count("invalid"),
        missingReferenceRows: count("missing-reference"),
        mappingRows: count("mapping"),
        projectLevelRows: applicableRows.filter((row) => !row.forecast.subarticleId).length,
        currencyConflictRows: 0,
        currencyWarningRows: applicableRows.filter((row) => row.currencyWarning).length,
        blockingRows,
        closedPeriodRows,
        mappingGroups: normalizedMappingGroups.length,
        currencies: [...new Set(applicableRows.map((row) => row.forecast.currency))].sort()
      }
    };
  }

  function stableHash(value, seed) {
    let hash = seed >>> 0;
    for (const character of String(value || "")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableForecastId(prefix, key, usedIds) {
    const base = `${prefix}:${stableHash(key, 2166136261)}${stableHash(key, 2246822519)}`;
    if (!usedIds.has(base)) return base;
    let suffix = 2;
    while (usedIds.has(`${base}:${suffix}`)) suffix += 1;
    return `${base}:${suffix}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function applyExpenseImport(currentState, payload = {}) {
    const preview = buildExpenseImportPreview(currentState, payload.rows, {
      sourceFile: payload.sourceFile,
      statusMode: payload.statusMode,
      dateField: payload.dateField,
      mappings: payload.mappings,
      today: payload.today
    });
    if (preview.stats.closedPeriodRows) {
      throw new Error(`Импорт затрагивает закрытые периоды: ${preview.stats.closedPeriodRows} строк(а). Сначала переоткройте соответствующие месяцы.`);
    }
    const next = deepClone(currentState);
    next.forecastTickets ||= [];
    const existing = new Map(next.forecastTickets
      .filter((ticket) => ticket.sourceType === SOURCE_TYPE && ticket.sourceTicketKey)
      .map((ticket) => [ticket.sourceTicketKey, ticket]));
    const usedTicketIds = new Set(next.forecastTickets.map((ticket) => ticket.id));
    const usedAllocationIds = new Set(next.forecastTickets.flatMap((ticket) =>
      (ticket.allocations || []).map((allocation) => allocation.id)));
    const importedAt = typeof payload.importedAt === "string" && !Number.isNaN(new Date(payload.importedAt).getTime())
      ? payload.importedAt : new Date().toISOString();
    const author = cleanText(payload.author, 80) || "Импорт Excel";
    const authorId = cleanText(payload.authorId, 120) || null;

    const rowsByTicket = new Map();
    preview.rows.filter((row) => ["new", "update", "unchanged"].includes(row.action)).forEach((row) => {
      const key = row.ticket.sourceTicketKey;
      if (!rowsByTicket.has(key)) rowsByTicket.set(key, []);
      rowsByTicket.get(key).push(row);
    });

    rowsByTicket.forEach((rows, ticketKey) => {
      const first = rows[0];
      let ticket = existing.get(ticketKey);
      const hasChanges = rows.some((row) => row.action === "new" || row.action === "update");
      if (!ticket) {
        const id = stableForecastId("forecast-ticket", ticketKey, usedTicketIds);
        usedTicketIds.add(id);
        ticket = {
          id,
          sourceType: SOURCE_TYPE,
          sourceTicketKey: ticketKey,
          sourceRequestNumber: first.ticket.sourceRequestNumber,
          ticketUrl: first.ticket.ticketUrl,
          description: first.ticket.description,
          supplier: first.ticket.supplier,
          sourceFile: first.ticket.sourceFile,
          sourceStatus: first.ticket.sourceStatus,
          lifecycle: "review",
          createdAt: importedAt,
          createdBy: author,
          createdById: authorId,
          updatedAt: null,
          updatedBy: null,
          updatedById: null,
          lastImportedAt: importedAt,
          history: [],
          allocations: []
        };
        next.forecastTickets.push(ticket);
        existing.set(ticketKey, ticket);
      }
      if (!hasChanges) return;
      const previous = {
        lifecycle: ticket.lifecycle,
        sourceStatus: ticket.sourceStatus,
        allocations: (ticket.allocations || []).map((allocation) => ({
          id: allocation.id,
          sourceAllocationKey: allocation.sourceAllocationKey,
          amount: allocation.amount,
          expectedDate: allocation.expectedDate,
          lifecycle: allocation.lifecycle,
          stale: allocation.stale === true
        }))
      };
      const currentAllocations = new Map((ticket.allocations || [])
        .filter((allocation) => allocation.sourceAllocationKey)
        .map((allocation) => [allocation.sourceAllocationKey, allocation]));
      const seen = new Set();
      rows.forEach((row) => {
        const desired = row.forecast;
        seen.add(desired.sourceAllocationKey);
        const current = currentAllocations.get(desired.sourceAllocationKey);
        if (!current) {
          const id = stableForecastId("forecast-allocation", desired.sourceAllocationKey, usedAllocationIds);
          usedAllocationIds.add(id);
          ticket.allocations.push({ id, ...desired });
          return;
        }
        Object.assign(current, desired, { id: current.id });
      });
      (ticket.allocations || []).forEach((allocation) => {
        if (!allocation.sourceAllocationKey || seen.has(allocation.sourceAllocationKey)) return;
        allocation.stale = true;
      });
      Object.assign(ticket, first.ticket, {
        sourceType: SOURCE_TYPE,
        updatedAt: importedAt,
        updatedBy: author,
        updatedById: authorId,
        lastImportedAt: importedAt
      });
      ticket.lifecycle = ticketLifecycle(ticket.allocations);
      ticket.history = Array.isArray(ticket.history) ? ticket.history.slice(-49) : [];
      ticket.history.push({
        changedAt: importedAt,
        changedBy: author,
        changedById: authorId,
        action: previous.allocations.length ? "forecast-import-update" : "forecast-import-create",
        sourceFile: preview.sourceFile,
        previous
      });
    });

    preview.rows.filter((row) => ["new", "update", "unchanged"].includes(row.action)).forEach((row) => {
      const source = row.source || {};
      const forecast = row.forecast || {};
      if (!forecast.locationId || !forecast.articleId || !forecast.quarterKey) return;
      const attributesKey = `${forecast.locationId}|${forecast.quarterKey}`;
      next.projectAttributes ||= {};
      next.projectAttributes[attributesKey] ||= {};
      const existingAttributes = next.projectAttributes[attributesKey][forecast.articleId] || {};
      next.projectAttributes[attributesKey][forecast.articleId] = {
        ...existingAttributes,
        service: source.serviceName || existingAttributes.service || "",
        serviceCode: source.serviceCode || existingAttributes.serviceCode || "",
        cfo: source.cfoName || existingAttributes.cfo || "",
        cfoCode: source.cfoCode || existingAttributes.cfoCode || ""
      };
    });

    next.expenseImports = Array.isArray(next.expenseImports) ? next.expenseImports.slice(-19) : [];
    next.expenseImports.push({
      id: `expense-excel-${Date.now()}`,
      importedAt,
      sourceFile: preview.sourceFile,
      rows: preview.stats.sourceRows,
      added: preview.stats.newRows,
      updated: preview.stats.updatedRows,
      unchanged: preview.stats.unchangedRows,
      skipped: preview.stats.sourceRows - preview.stats.newRows - preview.stats.updatedRows - preview.stats.unchangedRows,
      statusMode: "forecast",
      dateField: preview.dateField,
      tickets: preview.stats.ticketRows,
      active: preview.stats.activeRows,
      released: preview.stats.releasedRows,
      review: preview.stats.reviewRows,
      currencies: preview.stats.currencies
    });
    return next;
  }

  return {
    SOURCE_TYPE,
    SKIP_MAPPING,
    parseExpenseWorkbook,
    sourceForecastTicketKey,
    forecastStatusLifecycle,
    ticketLifecycle,
    mappingKey,
    buildExpenseImportPreview,
    applyExpenseImport
  };
});
