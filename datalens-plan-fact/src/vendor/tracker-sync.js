(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TrackerSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SOURCE_TYPE = "tracker-taxiassist";
  const QUEUE = "TAXIASSIST";
  const CHECK_INTERVAL_MS = 30 * 60 * 1000;
  const RETRY_INTERVAL_MS = 5 * 60 * 1000;
  const BRIDGE_URL = "http://127.0.0.1:18766";
  const BRIDGE_SCHEMA_VERSION = 5;
  const TRACKED_FIELDS = ["amount", "currency", "projectCode", "locationCode"];
  const PAYMENT_ROBOT = "robot-planer-oebs";

  function cleanText(value, maxLength = 500) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
  }

  function normalizeCode(value) {
    return cleanText(value, 80).toUpperCase();
  }

  function normalizeCurrency(value) {
    const code = normalizeCode(value);
    return /^[A-Z]{3}$/.test(code) ? code : "";
  }

  function normalizeAlias(value) {
    return cleanText(value, 300)
      .normalize("NFKC")
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/giu, "");
  }

  function validIsoDateTime(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  }

  function parseAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
    const raw = String(value || "").match(/-?[\d\s.,]+/)?.[0] || "";
    const compact = raw.replace(/\s/g, "");
    const lastDot = compact.lastIndexOf(".");
    const lastComma = compact.lastIndexOf(",");
    const decimalIndex = Math.max(lastDot, lastComma);
    const decimalDigits = decimalIndex >= 0 ? compact.length - decimalIndex - 1 : 0;
    const hasBothSeparators = lastDot >= 0 && lastComma >= 0;
    const separator = decimalIndex >= 0 ? compact[decimalIndex] : "";
    const separatorCount = separator ? compact.split(separator).length - 1 : 0;
    const hasDecimal = decimalDigits > 0 && decimalDigits <= 2
      && (hasBothSeparators || separatorCount === 1 || decimalDigits !== 3);
    const normalized = hasDecimal
      ? `${compact.slice(0, decimalIndex).replace(/[.,]/g, "")}.${compact.slice(decimalIndex + 1)}`
      : compact.replace(/[.,]/g, "");
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  function plainField(value) {
    if (value && typeof value === "object") {
      value = value.display || value.name || value.key || value.id || "";
    }
    return cleanText(String(value || ""), 300);
  }

  function isTrackerForecastIssue(issue) {
    return ["прогноз", "forecast"].includes(normalizeAlias(plainField(issue?.orderGroup)));
  }

  function dateFromRussianFormat(value) {
    const match = String(value || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return "";
    const result = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${result}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === result ? result : "";
  }

  function dateFromServicePeriodValue(value) {
    const raw = cleanText(String(value || ""), 80);
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      const date = new Date(`${isoMatch[1]}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoMatch[1]
        ? isoMatch[1] : "";
    }
    const localizedMatch = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
    return localizedMatch
      ? dateFromRussianFormat(`${localizedMatch[1]}.${localizedMatch[2]}.${localizedMatch[3]}`)
      : "";
  }

  function datesFromServicePeriodValue(value) {
    return [...String(value || "").matchAll(/(\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4})/gu)]
      .map((match) => dateFromServicePeriodValue(match[1]))
      .filter(Boolean)
      .slice(0, 2);
  }

  function parseTrackerPaymentComment(issueKey, comment, taxRatePercent = 0) {
    if (!comment || typeof comment !== "object") return null;
    if (normalizeAlias(comment.authorId) !== normalizeAlias(PAYMENT_ROBOT)) return null;
    const match = String(comment.text || "").match(
      /Document\s+(.+?)\s+from\s+(\d{2}\.\d{2}\.\d{4})\s+for\s+([0-9][0-9\s.,]*?)\s+([A-Z]{3})\s+will be paid\s+(\d{2}\.\d{2}\.\d{4})/iu
    );
    const grossAmount = parseAmount(match?.[3]);
    const taxRate = Number(taxRatePercent);
    const amount = Number.isFinite(taxRate) && taxRate > 0
      ? Math.round((grossAmount / (1 + taxRate / 100)) * 100) / 100
      : grossAmount;
    const currency = normalizeCurrency(match?.[4]);
    const paymentDate = dateFromRussianFormat(match?.[5]);
    const commentKey = cleanText(String(comment.longId || comment.id || ""), 160);
    const normalizedIssueKey = normalizeCode(issueKey);
    if (!match || !normalizedIssueKey || !commentKey || !amount || !currency || !paymentDate) return null;
    return {
      eventKey: `${normalizedIssueKey}:${commentKey}`,
      commentId: cleanText(String(comment.id || ""), 80),
      commentLongId: cleanText(String(comment.longId || ""), 160),
      documentNumber: cleanText(match[1], 120),
      documentDate: dateFromRussianFormat(match[2]),
      amount,
      grossAmount,
      taxRatePercent: Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0,
      currency,
      paymentDate,
      createdAt: validIsoDateTime(comment.createdAt) ? new Date(comment.createdAt).toISOString() : ""
    };
  }

  function parseCurrencyFromAmount(value) {
    const match = String(value || "").toUpperCase().match(/\b([A-Z]{3})\b/);
    return normalizeCurrency(match?.[1]);
  }

  function descriptionField(description, label) {
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*:?\\s*([^\\n\\r]+)`, "iu");
    return cleanText(String(description || "").match(pattern)?.[1], 300);
  }

  function legacyDescriptionField(description, label) {
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return cleanText(String(description || "").match(new RegExp(`(?:^|\\n)${escaped}\\s*:\\s*\\n([^\\n\\r]+)`, "iu"))?.[1], 300);
  }

  function multilineDescriptionField(description, labelPatterns) {
    const lines = String(description || "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const label = lines[index].replace(/[\\*_`]/g, "").trim();
      if (!(labelPatterns || []).some((pattern) => pattern.test(label))) continue;
      for (let valueIndex = index + 1; valueIndex < Math.min(lines.length, index + 5); valueIndex += 1) {
        const value = cleanText(lines[valueIndex].replace(/[\\*_`]/g, ""), 300);
        if (value && !/^(?:\{%|\/iframe\/)/u.test(value)) return value;
      }
    }
    return "";
  }

  function parseCodedValue(value, kind) {
    const codePattern = kind === "Проект"
      ? /^([A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*)\b\s*(?:(?:-|\u2014|\u00b7)\s*)?(.*)$/iu
      : /^((?:[A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*|[A-Z]{3,}C))\b\s*(?:(?:-|\u2014|\u00b7)\s*)?(.*)$/iu;
    const match = value.match(codePattern);
    return {
      code: normalizeCode(match?.[1]),
      name: cleanText(match?.[2] || value, 180) || normalizeCode(match?.[1])
    };
  }

  function codedGeographyField(description) {
    const value = descriptionField(description, "География")
      || multilineDescriptionField(description, [/^География\s*(?:\/\s*Geography)?\s*:?$/iu]);
    return parseCodedValue(value, "Локация");
  }

  function codedDescriptionField(description, label, options = {}) {
    if (label === "Проект") {
      const value = descriptionField(description, label)
        || multilineDescriptionField(description, [/^Проект\s*(?:\/\s*Project)?\s*:?$/iu]);
      return parseCodedValue(value, label);
    }
    const explicitValue = descriptionField(description, label)
      || descriptionField(description, "Локация")
      || multilineDescriptionField(description, [
        /^Офис\s*\/\s*датацентр\s*:?$/iu,
        /^Локация\s*:?$/iu
      ]);
    if (explicitValue) return parseCodedValue(explicitValue, label);
    return options.allowGeography === false
      ? { code: "", name: "" }
      : codedGeographyField(description);
  }

  function codedAnalyticField(description, label) {
    const value = descriptionField(description, label)
      || multilineDescriptionField(description, [new RegExp(`^${label}\\s*:?$`, "iu")]);
    return parseCodedValue(value, label);
  }

  function servicePeriodFromDescription(description) {
    const value = descriptionField(description, "Период оказания услуги")
      || descriptionField(description, "Период оказания услуг")
      || multilineDescriptionField(description, [
        /^Период оказания услуг?\s*(?:\/\s*Service period)?\s*:?$/iu,
        /^Service period\s*:?$/iu
      ]);
    const dates = datesFromServicePeriodValue(value);
    return {
      start: dates[0] || "",
      end: dates[1] || dates[0] || ""
    };
  }

  function trackerServicePeriod(issue) {
    const described = servicePeriodFromDescription(issue?.description);
    const fieldStart = dateFromServicePeriodValue(plainField(issue?.startDateOfServices));
    const fieldEnd = dateFromServicePeriodValue(plainField(issue?.endDateOfServices));
    const start = fieldStart || described.start || fieldEnd;
    const end = fieldEnd || described.end || fieldStart;
    const source = fieldStart || fieldEnd
      ? "tracker-fields"
      : (described.start || described.end ? "description" : "createdAt");
    return { start, end, source };
  }

  function splitAmountByServiceMonths(amount, start, end) {
    const total = Number(amount);
    const startDate = dateFromServicePeriodValue(start);
    const endDate = dateFromServicePeriodValue(end);
    if (!Number.isFinite(total) || total <= 0 || !startDate || !endDate || startDate > endDate) return [];
    const startTime = Date.parse(`${startDate}T00:00:00Z`);
    const endTime = Date.parse(`${endDate}T00:00:00Z`);
    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.floor((endTime - startTime) / dayMs) + 1;
    const allocations = [];
    let cursor = new Date(startTime);
    let distributed = 0;
    while (cursor.getTime() <= endTime) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth();
      const monthStart = Date.UTC(year, month, 1);
      const monthEnd = Date.UTC(year, month + 1, 0);
      const segmentStart = Math.max(startTime, monthStart);
      const segmentEnd = Math.min(endTime, monthEnd);
      const days = Math.floor((segmentEnd - segmentStart) / dayMs) + 1;
      const isLast = segmentEnd === endTime;
      const allocationAmount = isLast
        ? Math.round((total - distributed) * 100) / 100
        : Math.round((total * days / totalDays) * 100) / 100;
      distributed = Math.round((distributed + allocationAmount) * 100) / 100;
      const expenseDate = new Date(segmentEnd).toISOString().slice(0, 10);
      allocations.push({
        monthKey: expenseDate.slice(0, 7),
        expenseDate,
        days,
        amount: allocationAmount
      });
      cursor = new Date(Date.UTC(year, month + 1, 1));
    }
    return allocations;
  }

  function normalizeTrackerIssue(issue) {
    if (!issue || typeof issue !== "object") return null;
    const issueKey = normalizeCode(issue.key);
    if (!/^TAXIASSIST-\d+$/.test(issueKey)) return null;
    const createdAt = validIsoDateTime(issue.createdAt) ? new Date(issue.createdAt).toISOString() : "";
    const updatedAt = validIsoDateTime(issue.updatedAt) ? new Date(issue.updatedAt).toISOString() : createdAt;
    const project = codedDescriptionField(issue.description, "Проект");
    const location = codedDescriptionField(issue.description, "Офис/датацентр");
    const geography = codedGeographyField(issue.description);
    const service = codedAnalyticField(issue.description, "Сервис");
    const cfo = codedAnalyticField(issue.description, "ЦФО");
    const legacyAmount = legacyDescriptionField(issue.description, "Сумма без НДС");
    const amount = parseAmount(issue.orderAmountWithoutVat) || parseAmount(legacyAmount);
    const legacyCurrency = legacyDescriptionField(issue.description, "Валюта");
    const currency = normalizeCurrency(issue.orderCurrency) || parseCurrencyFromAmount(issue.orderAmountWithoutVat)
      || parseCurrencyFromAmount(legacyCurrency);
    const forecast = isTrackerForecastIssue(issue);
    const taxRateValue = descriptionField(issue.description, "Налоговая ставка")
      || legacyDescriptionField(issue.description, "Ставка НДС");
    const taxRateMatch = taxRateValue.match(/(?:^|_)(\d+(?:[.,]\d+)?)(?:_|%|$)/u);
    const taxRatePercent = taxRateMatch ? Number(taxRateMatch[1].replace(",", ".")) : 0;
    const paymentEvents = (Array.isArray(issue.paymentComments) ? issue.paymentComments : [])
      .map((comment) => parseTrackerPaymentComment(issueKey, comment, taxRatePercent))
      .filter(Boolean);
    const servicePeriod = trackerServicePeriod(issue);
    const expenseDate = forecast
      ? (servicePeriod.end || createdAt.slice(0, 10))
      : createdAt.slice(0, 10);
    const serviceAllocations = forecast && servicePeriod.start && servicePeriod.end
      ? splitAmountByServiceMonths(amount, servicePeriod.start, servicePeriod.end)
      : [{ monthKey: expenseDate.slice(0, 7), expenseDate, days: 0, amount }];
    const servicePeriodStartQuarter = quarterKeyFromExpenseDate(servicePeriod.start);
    const servicePeriodEndQuarter = quarterKeyFromExpenseDate(servicePeriod.end);
    return {
      issueKey,
      issueUrl: `https://st.yandex-team.ru/${issueKey}`,
      orderId: cleanText(String(issue.orderIdPa || ""), 80),
      poNumber: cleanText(String(issue.poNumbers || ""), 80),
      amount,
      currency,
      projectCode: project.code,
      projectName: project.name || cleanText(issue.orderProject, 180)
        || legacyDescriptionField(issue.description, "Проект"),
      locationCode: location.code,
      locationName: location.name || legacyDescriptionField(issue.description, "Локация"),
      geographyName: geography.name,
      summary: cleanText(issue.summary, 300),
      createdAt,
      expenseDate,
      updatedAt,
      sourceStatus: cleanText(issue.orderStatusPa || issue.status?.display, 80),
      kind: forecast ? "forecast" : "expense",
      orderGroup: plainField(issue.orderGroup),
      service: service.name || plainField(issue.orderService)
        || legacyDescriptionField(issue.description, "Сервис"),
      ...((service.code || normalizeCode(legacyDescriptionField(issue.description, "Сервис").match(/^[A-Z]+\d+/u)?.[0]))
        ? { serviceCode: service.code || normalizeCode(legacyDescriptionField(issue.description, "Сервис").match(/^[A-Z]+\d+/u)?.[0]) } : {}),
      costCenter: cfo.name || plainField(issue.orderCostCenter)
        || legacyDescriptionField(issue.description, "ЦФО_Код (Владелец бюджета)"),
      ...((cfo.code || normalizeCode(legacyDescriptionField(issue.description, "ЦФО_Код (Владелец бюджета)").match(/^[A-Z]+\d+/u)?.[0]))
        ? { cfoCode: cfo.code || normalizeCode(legacyDescriptionField(issue.description, "ЦФО_Код (Владелец бюджета)").match(/^[A-Z]+\d+/u)?.[0]) } : {}),
      legalEntity: plainField(issue.oe),
      expectedDate: expenseDate,
      servicePeriodStart: servicePeriod.start,
      servicePeriodEnd: servicePeriod.end,
      servicePeriodSource: servicePeriod.source,
      servicePeriodSpansQuarters: Boolean(servicePeriodStartQuarter && servicePeriodEndQuarter
        && servicePeriodStartQuarter !== servicePeriodEndQuarter),
      serviceAllocations,
      paymentEvents
    };
  }

  function addAliasCode(index, alias, code) {
    const normalizedAlias = normalizeAlias(alias);
    const normalizedCode = normalizeCode(code);
    if (!normalizedAlias || !normalizedCode) return;
    if (!index.has(normalizedAlias)) index.set(normalizedAlias, new Set());
    index.get(normalizedAlias).add(normalizedCode);
  }

  function uniqueAliasCode(index, alias) {
    const codes = index.get(normalizeAlias(alias));
    return codes?.size === 1 ? [...codes][0] : "";
  }

  function addCanonicalName(index, code, name) {
    const normalizedCode = normalizeCode(code);
    const cleanedName = cleanText(name, 180);
    if (!normalizedCode || !cleanedName || index.has(normalizedCode)) return;
    index.set(normalizedCode, cleanedName);
  }

  function normalizeTrackerIssues(rawIssues) {
    const entries = (Array.isArray(rawIssues) ? rawIssues : [])
      .map((raw) => ({ raw, issue: normalizeTrackerIssue(raw) }))
      .filter((entry) => entry.issue);
    const projectAliases = new Map();
    const locationAliases = new Map();
    const geographyAliases = new Map();
    const projectNames = new Map();
    const locationNames = new Map();

    entries.forEach(({ raw, issue }) => {
      const explicitLocation = codedDescriptionField(raw.description, "Офис/датацентр", { allowGeography: false });
      const geography = codedGeographyField(raw.description);
      addAliasCode(projectAliases, raw.orderProject, issue.projectCode);
      addAliasCode(locationAliases, raw.orderGeography, explicitLocation.code);
      addAliasCode(geographyAliases, raw.orderGeography, geography.code);
      addCanonicalName(projectNames, issue.projectCode, issue.projectName);
      addCanonicalName(locationNames, explicitLocation.code, explicitLocation.name);
      addCanonicalName(locationNames, geography.code, geography.name);
    });

    let inferredIssues = 0;
    let inferredFields = 0;
    const inferredIssueKeys = [];
    const issues = entries.map(({ raw, issue }) => {
      const explicitLocationCode = codedDescriptionField(
        raw.description,
        "Офис/датацентр",
        { allowGeography: false }
      ).code;
      const inferredProjectCode = issue.projectCode ? "" : uniqueAliasCode(projectAliases, raw.orderProject);
      const preferredOfficeCode = explicitLocationCode ? "" : uniqueAliasCode(locationAliases, raw.orderGeography);
      const inferredLocationCode = preferredOfficeCode
        || (issue.locationCode ? "" : uniqueAliasCode(geographyAliases, raw.orderGeography));
      const locationCode = inferredLocationCode || issue.locationCode;
      const inferredForIssue = Number(Boolean(inferredProjectCode))
        + Number(Boolean(locationCode) && locationCode !== issue.locationCode);
      if (inferredForIssue) {
        inferredIssues += 1;
        inferredFields += inferredForIssue;
        inferredIssueKeys.push(issue.issueKey);
      }
      const projectCode = issue.projectCode || inferredProjectCode;
      return {
        ...issue,
        projectCode,
        projectName: (inferredProjectCode ? projectNames.get(projectCode) : "")
          || issue.projectName || projectNames.get(projectCode) || cleanText(raw.orderProject, 180),
        locationCode,
        locationName: (locationCode !== issue.locationCode ? locationNames.get(locationCode) : "")
          || issue.locationName || locationNames.get(locationCode) || cleanText(raw.orderGeography, 180)
      };
    });

    return { issues, inferredIssues, inferredFields, inferredIssueKeys };
  }

  function quarterKeyFromExpenseDate(value) {
    const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])-/);
    if (!match) return "";
    return `${match[1]}-Q${Math.floor((Number(match[2]) - 1) / 3) + 1}`;
  }

  function sourceSnapshot(issue) {
    return {
      amount: Number(issue?.amount) || 0,
      currency: normalizeCurrency(issue?.currency),
      projectCode: normalizeCode(issue?.sourceProjectCode || issue?.projectCode),
      locationCode: normalizeCode(issue?.sourceLocationCode || issue?.locationCode),
      ...(issue?.summon === true ? {
        summon: true, cfoCode: normalizeCode(issue.cfoCode), serviceCode: normalizeCode(issue.serviceCode)
      } : {})
    };
  }

  // В отличие от sourceSnapshot(), не показывает "сырой" код тикета из Tracker,
  // а показывает то, во что тикет фактически разнесён сейчас (после ручного
  // сопоставления). Нужна для сравнения с уже сохранённым расходом: иначе
  // разнесённый тикет с изменившимся кодом Tracker никогда не перестанет
  // считаться "изменившимся", ведь sourceProjectCode обновляется на каждый
  // текущий сырой код при каждой синхронизации.
  function resolvedSnapshot(issue) {
    return {
      amount: Number(issue?.amount) || 0,
      currency: normalizeCurrency(issue?.currency),
      projectCode: normalizeCode(issue?.projectCode),
      locationCode: normalizeCode(issue?.locationCode)
    };
  }

  function snapshotFingerprint(snapshot) {
    const clean = sourceSnapshot(snapshot);
    return TRACKED_FIELDS.map((field) => `${field}:${clean[field]}`).join("|");
  }

  function snapshotChanges(previous, current) {
    const before = sourceSnapshot(previous);
    const after = resolvedSnapshot(current);
    return TRACKED_FIELDS.filter((field) => before[field] !== after[field]).map((field) => ({
      field,
      previous: before[field],
      current: after[field]
    }));
  }

  function issueValidationErrors(issue) {
    const errors = [];
    if (!issue?.issueKey) errors.push("issueKey");
    if (!Number.isFinite(Number(issue?.amount)) || Number(issue.amount) <= 0) errors.push("amount");
    if (!normalizeCurrency(issue?.currency)) errors.push("currency");
    if (!normalizeCode(issue?.projectCode)) errors.push("projectCode");
    if (!normalizeCode(issue?.locationCode)) errors.push("locationCode");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(issue?.expenseDate || ""))) errors.push("expenseDate");
    return errors;
  }

  function matchStateReferences(state, issue) {
    const projectCode = normalizeCode(issue?.projectCode);
    const locationCode = normalizeCode(issue?.locationCode);
    const projectNameKey = normalizeAlias(issue?.projectName).replace(/^т[\s_-]*/u, "");
    const locationNameKey = normalizeAlias(issue?.locationName);
    const nameMatches = (state?.articles || []).filter((item) => !item.archived
      && normalizeAlias(item.name).replace(/^т[\s_-]*/u, "") === projectNameKey);
    const locationNameMatches = locationNameKey
      ? (state?.locations || []).filter((item) => !item.archived
        && normalizeAlias(item.name) === locationNameKey)
      : [];
    const article = (state?.articles || []).find((item) => !item.archived && normalizeCode(item.code) === projectCode)
      || (nameMatches.length === 1 ? nameMatches[0] : null);
    const location = (state?.locations || []).find((item) => !item.archived && normalizeCode(item.code) === locationCode)
      || (locationNameMatches.length === 1 ? locationNameMatches[0] : null);
    return { article, location };
  }

  function sameBudgetDimension(expectedCode, expectedName, actualCode, actualName) {
    const expectedNormalizedCode = normalizeCode(expectedCode);
    const actualNormalizedCode = normalizeCode(actualCode);
    if (expectedNormalizedCode && actualNormalizedCode) return expectedNormalizedCode === actualNormalizedCode;
    return normalizeAlias(expectedName) === normalizeAlias(actualName);
  }

  function issueBelongsToLoadedBudget(state, issue, expenseDate = issue?.expenseDate) {
    const references = matchStateReferences(state, issue);
    if (!references.article || !references.location) return false;
    const quarterKey = quarterKeyFromExpenseDate(expenseDate);
    if (!quarterKey) return false;
    const storeKey = `${references.location.id}|${quarterKey}`;
    const itemBelongsToProject = (itemKey) => String(itemKey || "").split("|")[0] === references.article.id;
    const hasBudgetRow = [state?.budgets?.[storeKey], state?.monthlyBudgets?.[storeKey]]
      .some((store) => store && Object.keys(store).some(itemBelongsToProject));
    const expected = state?.projectAttributes?.[storeKey]?.[references.article.id];
    if (!hasBudgetRow || !expected) return false;
    return sameBudgetDimension(expected.cfoCode, expected.cfo, issue.cfoCode, issue.costCenter)
      && sameBudgetDimension(expected.serviceCode, expected.service, issue.serviceCode, issue.service);
  }

  function ownedCostCenterScope(state) {
    const codes = new Set();
    const names = new Set();
    Object.values(state?.projectAttributes || {}).forEach((entries) => {
      Object.values(entries || {}).forEach((entry) => {
        const code = normalizeCode(entry?.cfoCode);
        const name = normalizeAlias(entry?.cfo);
        if (code) codes.add(code);
        if (name) names.add(name);
      });
    });
    return { codes, names, configured: codes.size > 0 || names.size > 0 };
  }

  function issueBelongsToOwnedCostCenters(state, issue) {
    const scope = ownedCostCenterScope(state);
    // Старые или пустые бюджеты без аналитики ЦФО сохраняют прежнее поведение:
    // сначала нужно импортировать ЦФО, и только затем фильтр становится строгим.
    if (!scope.configured) return true;
    const issueCode = normalizeCode(issue?.cfoCode);
    if (issueCode && scope.codes.size > 0) return scope.codes.has(issueCode);
    const issueName = normalizeAlias(issue?.costCenter);
    // Отсутствующий ЦФО нельзя молча считать чужим: такой тикет остаётся в
    // ошибках как проблема качества данных.
    return !issueName || scope.names.has(issueName);
  }

  function warningId(type, issueKey) {
    return `${type}:${normalizeCode(issueKey)}`;
  }

  function buildReferencePlan(state, issues, options = {}) {
    void state;
    void issues;
    void options;
    return { projects: [], locations: [] };
  }

  function buildSyncPlan(state, issues, options = {}) {
    const forecastIssueKeys = new Set((Array.isArray(issues) ? issues : [])
      .filter((issue) => issue?.kind === "forecast")
      .map((issue) => normalizeCode(issue.issueKey)));
    const normalizedIssues = (Array.isArray(issues) ? issues : [])
      .filter((issue) => issue && issue.kind !== "forecast");
    const creationQuarterKey = /^\d{4}-Q[1-4]$/.test(String(options.creationQuarterKey || ""))
      ? String(options.creationQuarterKey) : "";
    const existingExpenses = new Map((state?.expenses || [])
      .filter((expense) => expense.sourceType === SOURCE_TYPE && expense.sourceKey
        && !expense.sourceEventKey && !expense.forecastTicketId
        && !forecastIssueKeys.has(normalizeCode(expense.sourceKey)))
      .map((expense) => [normalizeCode(expense.sourceKey), expense]));
    const seenKeys = new Set(normalizedIssues.map((issue) => normalizeCode(issue.issueKey)));
    const creates = [];
    const warnings = [];
    let unchanged = 0;
    let inPeriod = 0;
    let outOfPeriod = 0;

    normalizedIssues.forEach((issue) => {
      const issueKey = normalizeCode(issue.issueKey);
      const issueQuarterKey = quarterKeyFromExpenseDate(issue.expenseDate);
      const belongsToCreationPeriod = !creationQuarterKey
        || !issueQuarterKey
        || issueQuarterKey === creationQuarterKey;
      if (belongsToCreationPeriod) inPeriod += 1;
      else outOfPeriod += 1;

      // Подтверждённые оплаты создаются отдельно по дате из комментария
      // robot-planer-oebs. Не добавляем второй расход по дате создания тикета.
      if ((issue.paymentEvents || []).length) return;

      const expense = existingExpenses.get(issueKey);
      if (expense) {
        const changes = snapshotChanges(expense.sourceSnapshot, issue);
        if (changes.length) {
          warnings.push({
            id: warningId("source_changed", issueKey),
            type: "source_changed",
            issueKey,
            expenseId: expense.id,
            issueUrl: issue.issueUrl,
            changes,
            currentSnapshot: sourceSnapshot(issue),
            fingerprint: snapshotFingerprint(issue)
          });
        } else {
          unchanged += 1;
        }
        return;
      }

      if (!belongsToCreationPeriod) return;

      const validationErrors = issueValidationErrors(issue);
      const references = matchStateReferences(state, issue);
      if (!references.article) validationErrors.push("projectNotFound");
      if (!references.location) validationErrors.push("locationNotFound");
      if (validationErrors.length) {
        warnings.push({
          id: warningId("source_unmapped", issueKey),
          type: "source_unmapped",
          issueKey,
          expenseId: null,
          issueUrl: issue.issueUrl,
          validationErrors: [...new Set(validationErrors)],
          currentSnapshot: sourceSnapshot(issue),
          fingerprint: `${snapshotFingerprint(issue)}|errors:${[...new Set(validationErrors)].sort().join(",")}`
        });
        return;
      }

      creates.push({ issue, articleId: references.article.id, locationId: references.location.id });
    });

    if (options.selectionComplete === true) {
      existingExpenses.forEach((expense, issueKey) => {
        if (seenKeys.has(issueKey)) return;
        warnings.push({
          id: warningId("source_missing", issueKey),
          type: "source_missing",
          issueKey,
          expenseId: expense.id,
          issueUrl: expense.ticketUrl || `https://st.yandex-team.ru/${issueKey}`,
          fingerprint: "missing"
        });
      });
    }

    return { creates, warnings, unchanged, inPeriod, outOfPeriod, seenKeys: [...seenKeys] };
  }

  // Отдельный строгий путь по призыву. Не использует нечёткое сопоставление,
  // вывод аналитик из соседних тикетов или оплаты из комментариев.
  // Серверная версия: backend_django/planfact/domain/tracker_sync.py.
  function summonAmount(value) {
    if (typeof value === "boolean" || value == null) return 0;
    const raw = String(value).replace(/\s/gu, "").replace(/[A-Z]{3}$/u, "");
    if (!/^\d+(?:[.,]\d{1,2})?$/u.test(raw)) return 0;
    const amount = Number(raw.replace(",", "."));
    return Number.isFinite(amount) && amount > 0 && amount <= 1e12 ? amount : 0;
  }

  function summonFields(description) {
    const labels = {
      projectCode: /^(?:Проект(?:\s*\/\s*Project)?|Project)$/iu,
      locationCode: /^(?:Офис\s*\/\s*датацентр|Офис|Локация|Office)$/iu,
      cfoCode: /^(?:ЦФО(?:_Код\s*\(Владелец бюджета\))?|CFO)$/iu,
      serviceCode: /^(?:Сервис|Service)$/iu
    };
    const fields = Object.fromEntries(Object.keys(labels).map((key) => [key, []]));
    const lines = String(description || "").split(/\r?\n/u)
      .map((line) => line.replace(/[\\*`]/gu, "").trim());
    let purchaseItems = 0;
    lines.forEach((line, index) => {
      if (/^#{0,6}\s*(?:Предмет закупки|Purchase item)(?:\s|:|№|$)/iu.test(line)) purchaseItems += 1;
      const colon = line.indexOf(":");
      const label = (colon < 0 ? line : line.slice(0, colon)).trim();
      Object.entries(labels).forEach(([key, pattern]) => {
        if (!pattern.test(label)) return;
        let value = colon < 0 ? "" : line.slice(colon + 1).trim();
        for (let next = index + 1; !value && next < Math.min(lines.length, index + 5); next += 1) {
          if (lines[next]) { value = lines[next]; break; }
        }
        fields[key].push(value.match(/^([A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*)\b/iu)?.[1]?.toUpperCase() || "");
      });
    });
    return {
      ...Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values.length === 1 ? values[0] : ""])),
      multipleItems: purchaseItems > 1 || Object.values(fields).some((values) => values.length > 1)
    };
  }

  function normalizeSummonedIssue(raw) {
    const issue = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const issueKey = normalizeCode(issue.key);
    const date = typeof issue.createdAt === "string" ? issue.createdAt.slice(0, 10) : "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/u.test(date)
      && Number(date.slice(0, 4)) >= 1
      && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
      && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    const timestamp = typeof issue.createdAt === "string"
      && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2}))?$/u.test(issue.createdAt)
      ? Date.parse(issue.createdAt) : NaN;
    const scalar = (value) => typeof value === "string" || typeof value === "number" ? cleanText(String(value), 80) : "";
    return {
      summon: true,
      issueKey: /^TAXIASSIST-\d+$/u.test(issueKey) ? issueKey : "",
      issueUrl: /^TAXIASSIST-\d+$/u.test(issueKey) ? `https://st.yandex-team.ru/${issueKey}` : "",
      amount: summonAmount(issue.orderAmountWithoutVat),
      currency: normalizeCurrency(scalar(issue.orderCurrency)),
      expenseDate: validDate && Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "",
      orderId: scalar(issue.orderIdPa),
      poNumber: scalar(issue.poNumbers),
      summary: cleanText(issue.summary, 300),
      sourceStatus: cleanText(scalar(issue.orderStatusPa) || issue.status?.display, 80),
      forecast: isTrackerForecastIssue(issue),
      ...summonFields(issue.description),
      multipleOrders: Array.isArray(issue.poNumbers) ? issue.poNumbers.length > 1
        : scalar(issue.poNumbers).split(/[,;\n]/u).filter((part) => part.trim()).length > 1,
      amountCurrency: typeof issue.orderAmountWithoutVat === "string"
        ? (issue.orderAmountWithoutVat.trim().match(/([A-Z]{3})$/u)?.[1] || "") : ""
    };
  }

  function summonTicketKey(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "st.yandex-team.ru"
        && !url.username && !url.password && !url.port
        ? (url.pathname.match(/^\/(TAXIASSIST-\d+)\/?$/iu)?.[1]?.toUpperCase() || "") : "";
    } catch { return ""; }
  }

  function planSummonedIssue(state, raw) {
    const issue = normalizeSummonedIssue(raw);
    const result = { issue, status: "blocked", errors: [], articleId: null, locationId: null, subarticleId: null };
    const reject = (...errors) => { result.errors = errors; return result; };
    if (!issue.issueKey) return reject("issueKey");
    const linked = (entry) => normalizeCode(entry.sourceKey || entry.sourceTicketKey) === issue.issueKey
      || summonTicketKey(entry.ticketUrl) === issue.issueKey
      || (issue.orderId && String(entry.sourceOrderId || "") === issue.orderId)
      || (issue.poNumber && String(entry.sourceRequestNumber || "") === issue.poNumber);
    const expenses = (state.expenses || []).filter(linked);
    if (expenses.length) {
      if (expenses.some((entry) => entry.status === "canceled")) return reject("alreadyCanceled");
      if (expenses.some((entry) => entry.sourceType !== SOURCE_TYPE)) return reject("manualDuplicate");
      if (expenses.some((entry) => entry.sourceEventKey || entry.forecastTicketId)) return reject("paymentRecorded");
      if (expenses.length !== 1 || !expenses[0].sourceSnapshot) return reject("existingExpense");
      const snapshot = sourceSnapshot({ ...issue, summon: expenses[0].sourceSnapshot.summon === true });
      if (JSON.stringify(sourceSnapshot(expenses[0].sourceSnapshot)) !== JSON.stringify(snapshot)
          || expenses[0].expenseDate !== issue.expenseDate) return reject("sourceChanged");
      result.status = "unchanged";
      return result;
    }
    if ((state.forecastTickets || []).some(linked)) return reject("forecastExists");
    if (issue.forecast) return reject("forecastIssue");
    if (issue.multipleItems || issue.multipleOrders) return reject("multipleItems");
    const missing = ["amount", "currency", "projectCode", "locationCode", "cfoCode", "serviceCode", "expenseDate"]
      .filter((field) => !issue[field]);
    if (missing.length) return reject(...missing);
    if (issue.amountCurrency && issue.amountCurrency !== issue.currency) return reject("amountCurrency");
    const articles = (state.articles || []).filter((entry) => !entry.archived && normalizeCode(entry.code) === issue.projectCode);
    const locations = (state.locations || []).filter((entry) => !entry.archived && normalizeCode(entry.code) === issue.locationCode);
    if (articles.length !== 1) return reject("projectNotFound");
    if (locations.length !== 1) return reject("locationNotFound");
    result.articleId = articles[0].id;
    result.locationId = locations[0].id;
    const quarter = quarterKeyFromExpenseDate(issue.expenseDate);
    const storeKey = `${result.locationId}|${quarter}`;
    const attributes = state.projectAttributes?.[storeKey]?.[result.articleId];
    const dimensionCode = (explicit, name) => normalizeCode(explicit)
      || String(name || "").match(/^([A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*)\b/iu)?.[1]?.toUpperCase() || "";
    if (!attributes) return reject("budgetNotFound");
    if (dimensionCode(attributes.cfoCode, attributes.cfo) !== issue.cfoCode) return reject("cfoMismatch");
    if (dimensionCode(attributes.serviceCode, attributes.service) !== issue.serviceCode) return reject("serviceMismatch");
    const budget = { ...(state.monthlyBudgets?.[storeKey] || {}), ...(state.budgets?.[storeKey] || {}) };
    const itemKeys = Object.keys(budget).filter((key) => key.split("|")[0] === result.articleId);
    if (!itemKeys.length) return reject("budgetNotFound");
    const currencyKeys = itemKeys.filter((key) => Object.hasOwn(budget[key] || {}, issue.currency));
    if (!currencyKeys.length) return reject("budgetCurrency");
    if (currencyKeys.length !== 1) return reject("budgetAmbiguous");
    result.subarticleId = currencyKeys[0].split("|")[1] || null;
    if (result.subarticleId && !(articles[0].subarticles || [])
      .some((entry) => entry.id === result.subarticleId && !entry.archived)) return reject("budgetAmbiguous");
    if (state.closedPeriods?.months?.[issue.expenseDate.slice(0, 7)]?.closedAt
        || state.closedPeriods?.quarters?.[quarter]?.closedAt) return reject("periodClosed");
    result.status = "create";
    return result;
  }

  return {
    SOURCE_TYPE,
    QUEUE,
    CHECK_INTERVAL_MS,
    RETRY_INTERVAL_MS,
    BRIDGE_URL,
    BRIDGE_SCHEMA_VERSION,
    TRACKED_FIELDS,
    normalizeTrackerIssue,
    normalizeTrackerIssues,
    isTrackerForecastIssue,
    parseAmount,
    splitAmountByServiceMonths,
    parseTrackerPaymentComment,
    quarterKeyFromExpenseDate,
    sourceSnapshot,
    snapshotFingerprint,
    snapshotChanges,
    issueValidationErrors,
    matchStateReferences,
    issueBelongsToLoadedBudget,
    ownedCostCenterScope,
    issueBelongsToOwnedCostCenters,
    buildReferencePlan,
    buildSyncPlan,
    warningId,
    normalizeSummonedIssue,
    planSummonedIssue
  };
});
