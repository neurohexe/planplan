(function (root, factory) {
  "use strict";
  const api = factory(root?.PeriodLocks
    || (typeof require === "function" ? require("./period-locks.js") : null));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BudgetImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (PeriodLocks) {
  "use strict";

  const LEGACY_IMPORT_QUARTER = "2026-Q3";
  const DEFAULT_PROJECT_ARTICLE_ID = "default";
  const MONTH_ABBREVIATIONS = Object.freeze([
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ]);
  const MONTH_INDEX = new Map(MONTH_ABBREVIATIONS.map((month, index) => [month.toLowerCase(), index + 1]));
  const BUDGET_TYPES = new Set(["opex", "capex"]);
  const SHEET_NAMES = ["OPEX", "CAPEX"];
  const EXCHANGE_RATE_SHEET_NAME = "курс";
  const LEGACY_SAMPLE_PROJECTS = Object.freeze([
    { id: "cleaning", name: "T_Уборка помещений" },
    { id: "equipment-rent", name: "T_Аренда оборудования" },
    { id: "office-greening", name: "T_Озеленение офиса" },
    { id: "food", name: "Т_Продукты питания" },
    { id: "household-supplies", name: "Т_Хоз инвентарь и расходные материалы" },
    { id: "furniture", name: "T_Мебель и предметы интерьера" },
    { id: "furniture-main", name: "T_Мебель и предметы интерьера (осн)" },
    { id: "other-office", name: "Т_Прочие офисные расходы" },
    { id: "other-office-main", name: "Т_Прочие офисные расходы (осн)" },
    { id: "navigation", name: "Т_Навигация" },
    { id: "appliances", name: "T_Бытовая техника" },
    { id: "secretariat", name: "Т_Секретариат" },
    { id: "moving", name: "T_Дост.гр.и расх.на переезд" },
    { id: "repairs-main", name: "Т_Ремонтные работы (осн)" }
  ]);
  const LEGACY_SAMPLE_BY_ID = new Map(LEGACY_SAMPLE_PROJECTS.map((project) => [project.id, project]));
  const textDecoder = new TextDecoder("utf-8");

  function cleanText(value, maxLength = 160) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
  }

  function normalizeCurrencyCode(value) {
    const code = cleanText(value, 3).toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : "";
  }

  function normalizeBudgetType(value) {
    const type = String(value || "").toLowerCase();
    return BUDGET_TYPES.has(type) ? type : "";
  }

  function normalizeResponsibleName(value) {
    const name = cleanText(value, 80);
    const key = name.normalize("NFKC").toLocaleLowerCase("ru-RU");
    if (["лилит", "степанян лилит", "лилит степанян"].includes(key)) return "Лилит Степанян";
    return name;
  }

  function comparisonKey(value) {
    return cleanText(value).normalize("NFKC").toLocaleLowerCase("ru-RU");
  }

  function normalizeCode(value) {
    return cleanText(value, 80).toUpperCase();
  }

  function normalizeQuarterKey(value) {
    const match = String(value || "").match(/^(\d{4})-Q([1-4])$/);
    return match ? `${match[1]}-Q${match[2]}` : "";
  }

  function quarterMonths(quarterKey) {
    const normalized = normalizeQuarterKey(quarterKey);
    if (!normalized) return [];
    const [yearPart, quarterPart] = normalized.split("-Q");
    const year = Number(yearPart);
    const firstMonth = (Number(quarterPart) - 1) * 3 + 1;
    return [0, 1, 2].map((offset) => {
      const month = firstMonth + offset;
      return {
        key: `${year}-${String(month).padStart(2, "0")}`,
        label: `${MONTH_ABBREVIATIONS[month - 1]} ${String(year).slice(-2)}`
      };
    });
  }

  function monthKeyFromHeader(value) {
    const match = cleanText(value, 40).match(/^([A-Za-z]{3})\s+(\d{2}|\d{4})$/);
    if (!match) return "";
    const month = MONTH_INDEX.get(match[1].toLowerCase());
    if (!month) return "";
    const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
    if (!Number.isInteger(year) || year < 2000 || year > 2199) return "";
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function quarterKeyFromMonthKey(value) {
    const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return "";
    return `${match[1]}-Q${Math.floor((Number(match[2]) - 1) / 3) + 1}`;
  }

  function quarterKeyFromExchangeHeader(value) {
    const text = cleanText(value, 40).toUpperCase();
    const match = text.match(/^(?:Q([1-4])\s+(\d{4})|(\d{4})\s+Q([1-4]))$/);
    if (!match) return "";
    const quarter = match[1] || match[4];
    const year = match[2] || match[3];
    return `${year}-Q${quarter}`;
  }

  function ensureCapexSuffix(value) {
    const name = cleanText(value, 120) || "Проект";
    return /\(осн\)\s*$/iu.test(name) ? name : `${name} (осн)`;
  }

  function displayProjectName(type, value) {
    const name = cleanText(value, 120) || "Проект";
    return type === "capex" ? ensureCapexSuffix(name) : name;
  }

  function xmlDecode(value) {
    return String(value || "")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#([0-9]+);/g, (_, num) => String.fromCodePoint(Number(num)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function attributeValue(attributes, name) {
    const match = String(attributes || "").match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
    return match ? xmlDecode(match[1]) : "";
  }

  function normalizeZipPath(value) {
    const parts = [];
    String(value || "").replace(/^\//, "").split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
    return parts.join("/");
  }

  async function inputBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (input && typeof input.arrayBuffer === "function") return new Uint8Array(await input.arrayBuffer());
    throw new Error("Не удалось прочитать выбранный Excel-файл");
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "function") {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (typeof require === "function") {
      const { inflateRawSync } = require("node:zlib");
      return new Uint8Array(inflateRawSync(bytes));
    }
    throw new Error("Этот браузер не умеет распаковывать Excel. Откройте приложение в актуальном Chrome, Edge или Safari.");
  }

  class ZipArchive {
    constructor(bytes) {
      this.bytes = bytes;
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.entries = this.readDirectory();
    }

    u16(offset) { return this.view.getUint16(offset, true); }
    u32(offset) { return this.view.getUint32(offset, true); }

    readDirectory() {
      const minimum = Math.max(0, this.bytes.length - 65557);
      let end = this.bytes.length - 22;
      while (end >= minimum && this.u32(end) !== 0x06054b50) end -= 1;
      if (end < minimum) throw new Error("Файл не похож на корректную книгу Excel (.xlsx)");
      const count = this.u16(end + 10);
      if (count > 10000) throw new Error("В Excel-файле слишком много внутренних объектов");
      let offset = this.u32(end + 16);
      const entries = new Map();
      let totalUncompressedSize = 0;
      for (let index = 0; index < count; index += 1) {
        if (this.u32(offset) !== 0x02014b50) throw new Error("Повреждён каталог Excel-файла");
        const method = this.u16(offset + 10);
        const compressedSize = this.u32(offset + 20);
        const uncompressedSize = this.u32(offset + 24);
        const nameLength = this.u16(offset + 28);
        const extraLength = this.u16(offset + 30);
        const commentLength = this.u16(offset + 32);
        const localOffset = this.u32(offset + 42);
        if (uncompressedSize > 128 * 1024 * 1024) throw new Error("Один из листов Excel слишком велик для безопасного импорта");
        totalUncompressedSize += uncompressedSize;
        if (totalUncompressedSize > 384 * 1024 * 1024) throw new Error("Excel-файл слишком велик для безопасного импорта");
        const name = textDecoder.decode(this.bytes.subarray(offset + 46, offset + 46 + nameLength));
        entries.set(normalizeZipPath(name), { method, compressedSize, uncompressedSize, localOffset });
        offset += 46 + nameLength + extraLength + commentLength;
      }
      return entries;
    }

    async read(name) {
      const normalized = normalizeZipPath(name);
      const entry = this.entries.get(normalized);
      if (!entry) throw new Error(`В Excel-файле отсутствует ${normalized}`);
      const offset = entry.localOffset;
      if (this.u32(offset) !== 0x04034b50) throw new Error(`Повреждена запись ${normalized}`);
      const nameLength = this.u16(offset + 26);
      const extraLength = this.u16(offset + 28);
      const start = offset + 30 + nameLength + extraLength;
      const compressed = this.bytes.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) return compressed.slice();
      if (entry.method !== 8) throw new Error(`Неподдерживаемый способ сжатия Excel (${entry.method})`);
      const result = await inflateRaw(compressed);
      if (entry.uncompressedSize && result.length !== entry.uncompressedSize) {
        throw new Error(`Не удалось полностью распаковать ${normalized}`);
      }
      return result;
    }

    async text(name) {
      return textDecoder.decode(await this.read(name));
    }
  }

  function parseSharedStrings(xml) {
    const values = [];
    const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let item;
    while ((item = itemPattern.exec(xml))) {
      let text = "";
      const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let part;
      while ((part = textPattern.exec(item[1]))) text += xmlDecode(part[1]);
      values.push(text);
    }
    return values;
  }

  function cellColumn(reference) {
    return String(reference || "").replace(/[0-9]/g, "").toUpperCase();
  }

  function cellValue(attributes, body, sharedStrings) {
    const type = attributeValue(attributes, "t");
    if (type === "inlineStr") {
      let value = "";
      const parts = body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g);
      for (const part of parts) value += xmlDecode(part[1]);
      return value;
    }
    const match = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
    if (!match) return "";
    const raw = xmlDecode(match[1]);
    if (type === "s") return sharedStrings[Number(raw)] ?? "";
    return raw;
  }

  function rowsFromWorksheet(xml, sharedStrings, wantedColumns, maxRow = Number.POSITIVE_INFINITY) {
    const rows = [];
    const rowPattern = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(xml))) {
      const rowNumber = Number(attributeValue(rowMatch[1], "r"));
      if (!Number.isFinite(rowNumber) || rowNumber > maxRow) continue;
      const row = {};
      const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowMatch[2]))) {
        const reference = attributeValue(cellMatch[1], "r");
        const column = cellColumn(reference);
        if (wantedColumns && !wantedColumns.has(column)) continue;
        row[column] = cellValue(cellMatch[1], cellMatch[2] || "", sharedStrings);
      }
      rows.push({ number: rowNumber, cells: row });
    }
    return rows;
  }

  function findColumn(row, expected) {
    const wanted = comparisonKey(expected);
    return Object.keys(row || {}).find((column) => comparisonKey(row[column]) === wanted) || "";
  }

  function worksheetHeaderLayout(xml, sharedStrings, sheetName) {
    const headers = rowsFromWorksheet(xml, sharedStrings, null, 3);
    const blockRow = headers.find((row) => row.number === 2)?.cells || {};
    const headerRow = headers.find((row) => row.number === 3)?.cells || {};
    const columns = {
      locationCode: findColumn(headerRow, "Код локации"),
      locationName: findColumn(headerRow, "Локации"),
      projectCode: findColumn(headerRow, "Код проекта"),
      projectName: findColumn(headerRow, "Проект"),
      projectArticleName: findColumn(headerRow, "Comments"),
      responsibleGroup: findColumn(headerRow, "Ответственный") || findColumn(headerRow, "Группа"),
      service: findColumn(headerRow, "Сервис"),
      legalEntity: findColumn(headerRow, "Юр Лицо"),
      cfo: findColumn(headerRow, "ЦФО"),
      currency: findColumn(headerRow, "Валюта")
    };
    if (!columns.locationCode || !columns.locationName || !columns.projectCode || !columns.projectName
      || !columns.projectArticleName || !columns.currency) {
      throw new Error(`На листе ${sheetName} не найдены обязательные столбцы бюджета`);
    }
    const monthColumns = new Map();
    Object.keys(headerRow).forEach((column) => {
      if (comparisonKey(blockRow[column]) !== comparisonKey("Оказание услуги")) return;
      const monthKey = monthKeyFromHeader(headerRow[column]);
      if (monthKey && !monthColumns.has(monthKey)) monthColumns.set(monthKey, column);
    });
    return { ...columns, monthColumns };
  }

  function availableQuartersForLayout(layout) {
    const quarterKeys = new Set([...layout.monthColumns.keys()].map(quarterKeyFromMonthKey).filter(Boolean));
    return [...quarterKeys]
      .filter((quarterKey) => quarterMonths(quarterKey).every((month) => layout.monthColumns.has(month.key)))
      .sort();
  }

  function worksheetLayout(xml, sharedStrings, sheetName, quarterKey) {
    const normalizedQuarter = normalizeQuarterKey(quarterKey);
    if (!normalizedQuarter) throw new Error("Выберите корректный период импорта");
    const columns = worksheetHeaderLayout(xml, sharedStrings, sheetName);
    const months = quarterMonths(normalizedQuarter).map((month) => ({
      ...month,
      column: columns.monthColumns.get(month.key) || ""
    }));
    if (months.some((month) => !month.column)) {
      throw new Error(`На листе ${sheetName} нет полного блока «Оказание услуги» за ${normalizedQuarter}`);
    }
    return { ...columns, months };
  }

  function numericCell(value) {
    const text = cleanText(String(value ?? ""), 80);
    if (!text) return { value: 0, valid: true };
    const normalized = text.replace(/\s/g, "").replace(",", ".");
    const number = Number(normalized);
    return { value: Number.isFinite(number) ? number : 0, valid: Number.isFinite(number) };
  }

  function parseExchangeRateSheet(xml, sharedStrings, quarterKey) {
    const normalizedQuarter = normalizeQuarterKey(quarterKey);
    if (!normalizedQuarter) throw new Error("Выберите корректный период импорта");
    if (!xml) return { rates: {}, skippedRows: 0, sheetFound: false };
    const rows = rowsFromWorksheet(xml, sharedStrings, null);
    const header = rows.slice(0, 10).find((row) => findColumn(row.cells, "Код по ISO"));
    if (!header) throw new Error("На листе «курс» не найден столбец «Код по ISO»");
    const codeColumn = findColumn(header.cells, "Код по ISO");
    const rateColumn = Object.keys(header.cells)
      .find((column) => quarterKeyFromExchangeHeader(header.cells[column]) === normalizedQuarter);
    if (!rateColumn) throw new Error(`На листе «курс» нет курсов за ${normalizedQuarter}`);
    const rates = {};
    let skippedRows = 0;
    rows.filter((row) => row.number > header.number).forEach((row) => {
      const currency = normalizeCurrencyCode(row.cells[codeColumn]);
      if (!currency || currency === "RUB") return;
      const parsed = numericCell(row.cells[rateColumn]);
      if (!parsed.valid || parsed.value <= 0) {
        skippedRows += 1;
        return;
      }
      rates[currency] = { rateToRub: parsed.value, direction: "currencyToRub" };
    });
    return { rates, skippedRows, sheetFound: true };
  }

  function inferMissingProjectCodes(rows) {
    const source = Array.isArray(rows) ? rows : [];
    const codesByName = new Map();
    source.forEach((row) => {
      const nameKey = comparisonKey(row?.projectName);
      const code = normalizeCode(row?.projectCode);
      if (!nameKey || !code) return;
      if (!codesByName.has(nameKey)) codesByName.set(nameKey, new Set());
      codesByName.get(nameKey).add(code);
    });
    let recoveredRows = 0;
    const resolvedRows = source.map((row) => {
      const projectCode = normalizeCode(row?.projectCode);
      if (projectCode) return { ...row, projectCode };
      const candidates = codesByName.get(comparisonKey(row?.projectName));
      if (!candidates || candidates.size !== 1) return { ...row, projectCode: "" };
      recoveredRows += 1;
      return { ...row, projectCode: [...candidates][0] };
    });
    return { rows: resolvedRows, recoveredRows };
  }

  function parseBudgetSheet(xml, sharedStrings, sheetName, quarterKey) {
    const budgetType = sheetName.toLowerCase();
    const layout = worksheetLayout(xml, sharedStrings, sheetName, quarterKey);
    const wanted = new Set([
      layout.locationCode, layout.locationName, layout.projectCode,
      layout.projectName, layout.projectArticleName, layout.responsibleGroup,
      layout.service, layout.legalEntity, layout.cfo,
      layout.currency, ...layout.months.map((month) => month.column)
    ].filter(Boolean));
    const rows = [];
    let skippedRows = 0;
    let ignoredAmountCells = 0;
    const sourceRows = rowsFromWorksheet(xml, sharedStrings, wanted)
      .filter((row) => row.number > 3)
      .map((row) => ({
        ...row,
        projectName: cleanText(row.cells[layout.projectName], 120),
        projectCode: normalizeCode(row.cells[layout.projectCode])
      }));
    const resolved = inferMissingProjectCodes(sourceRows);
    resolved.rows.forEach((row) => {
      const locationCode = normalizeCode(row.cells[layout.locationCode]);
      const locationName = cleanText(row.cells[layout.locationName], 120);
      const projectCode = row.projectCode;
      const projectName = row.projectName;
      const projectArticleName = cleanText(row.cells[layout.projectArticleName], 120) || displayProjectName(budgetType, projectName);
      const responsibleGroup = normalizeResponsibleName(row.cells[layout.responsibleGroup]);
      const serviceName = cleanText(row.cells[layout.service], 120);
      const legalEntity = cleanText(row.cells[layout.legalEntity], 160);
      const cfoName = cleanText(row.cells[layout.cfo], 160);
      const currency = normalizeCurrencyCode(row.cells[layout.currency]);
      if (!locationCode || !locationName || !projectCode || !projectName || !currency) {
        skippedRows += 1;
        return;
      }
      let amount = 0;
      const months = {};
      layout.months.forEach((month) => {
        const parsed = numericCell(row.cells[month.column]);
        if (!parsed.valid) ignoredAmountCells += 1;
        months[month.key] = parsed.value;
        amount += parsed.value;
      });
      if (!Number.isFinite(amount) || amount < 0) {
        skippedRows += 1;
        return;
      }
      rows.push({
        budgetType, locationCode, locationName, projectCode, projectName, projectArticleName,
        responsibleGroup, serviceName, legalEntity, cfoName, currency, amount, months, sourceRow: row.number
      });
    });
    return { rows, skippedRows, ignoredAmountCells, recoveredProjectCodes: resolved.recoveredRows, layout };
  }

  function workbookSheetPaths(workbookXml, relationshipsXml) {
    const relationships = new Map();
    const relPattern = /<Relationship\b([^>]*)\/?\s*>/g;
    let rel;
    while ((rel = relPattern.exec(relationshipsXml))) {
      relationships.set(attributeValue(rel[1], "Id"), attributeValue(rel[1], "Target"));
    }
    const paths = new Map();
    const sheetPattern = /<sheet\b([^>]*)\/?\s*>/g;
    let sheet;
    while ((sheet = sheetPattern.exec(workbookXml))) {
      const name = attributeValue(sheet[1], "name");
      const relationshipId = attributeValue(sheet[1], "r:id");
      const target = relationships.get(relationshipId);
      if (target) paths.set(name, normalizeZipPath(`xl/${target}`));
    }
    return paths;
  }

  async function readWorkbook(input, selectedSheetNames = null) {
    const bytes = await inputBytes(input);
    const zip = new ZipArchive(bytes);
    const [workbookXml, relationshipsXml, sharedStringsXml] = await Promise.all([
      zip.text("xl/workbook.xml"),
      zip.text("xl/_rels/workbook.xml.rels"),
      zip.entries.has("xl/sharedStrings.xml") ? zip.text("xl/sharedStrings.xml") : Promise.resolve("")
    ]);
    const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
    const sheetPaths = workbookSheetPaths(workbookXml, relationshipsXml);
    const sheetXml = new Map();
    const selected = Array.isArray(selectedSheetNames) ? new Set(selectedSheetNames) : null;
    for (const [sheetName, path] of sheetPaths) {
      if (selected && !selected.has(sheetName)) continue;
      sheetXml.set(sheetName, await zip.text(path));
    }
    return { sharedStrings, sheetXml };
  }

  async function readBudgetWorkbookParts(input) {
    const workbook = await readWorkbook(input, [...SHEET_NAMES, EXCHANGE_RATE_SHEET_NAME]);
    const sheetXml = new Map();
    for (const sheetName of SHEET_NAMES) {
      const xml = workbook.sheetXml.get(sheetName);
      if (!xml) throw new Error(`В книге нет обязательного листа ${sheetName}`);
      sheetXml.set(sheetName, xml);
    }
    const exchangeRateEntry = [...workbook.sheetXml.entries()]
      .find(([sheetName]) => comparisonKey(sheetName) === comparisonKey(EXCHANGE_RATE_SHEET_NAME));
    return {
      sharedStrings: workbook.sharedStrings,
      sheetXml,
      exchangeRateSheetXml: exchangeRateEntry?.[1] || null
    };
  }

  async function inspectBudgetWorkbook(input, options = {}) {
    const workbook = await readBudgetWorkbookParts(input);
    const quarterSets = SHEET_NAMES.map((sheetName) => new Set(availableQuartersForLayout(
      worksheetHeaderLayout(workbook.sheetXml.get(sheetName), workbook.sharedStrings, sheetName)
    )));
    const availableQuarters = [...quarterSets[0]].filter((quarterKey) =>
      quarterSets.slice(1).every((quarterSet) => quarterSet.has(quarterKey))).sort();
    if (!availableQuarters.length) {
      throw new Error("На листах OPEX и CAPEX не найдено ни одного полного общего квартала в блоке «Оказание услуги»");
    }
    return {
      sourceFile: cleanText(options.sourceFile || "budget.xlsx", 200),
      availableQuarters
    };
  }

  async function parseBudgetWorkbook(input, options = {}) {
    const quarterKey = normalizeQuarterKey(options.quarterKey);
    if (!quarterKey) throw new Error("Выберите период импорта");
    const workbook = await readBudgetWorkbookParts(input);
    const rows = [];
    const sheets = [];
    for (const sheetName of SHEET_NAMES) {
      const parsed = parseBudgetSheet(workbook.sheetXml.get(sheetName), workbook.sharedStrings, sheetName, quarterKey);
      rows.push(...parsed.rows);
      sheets.push({
        name: sheetName,
        sourceRows: parsed.rows.length,
        skippedRows: parsed.skippedRows,
        ignoredAmountCells: parsed.ignoredAmountCells,
        recoveredProjectCodes: parsed.recoveredProjectCodes
      });
    }
    const exchangeRateResult = parseExchangeRateSheet(
      workbook.exchangeRateSheetXml, workbook.sharedStrings, quarterKey
    );
    return {
      quarterKey,
      sourceFile: cleanText(options.sourceFile || "budget.xlsx", 200),
      rows,
      exchangeRates: exchangeRateResult.rates,
      stats: {
        sheets,
        sourceRows: rows.length,
        skippedRows: sheets.reduce((sum, sheet) => sum + sheet.skippedRows, 0),
        ignoredAmountCells: sheets.reduce((sum, sheet) => sum + sheet.ignoredAmountCells, 0),
        recoveredProjectCodes: sheets.reduce((sum, sheet) => sum + sheet.recoveredProjectCodes, 0),
        exchangeRates: Object.keys(exchangeRateResult.rates).length,
        skippedExchangeRates: exchangeRateResult.skippedRows,
        exchangeRateSheetFound: exchangeRateResult.sheetFound
      }
    };
  }

  function normalizeImportedExchangeRates(value) {
    const normalized = {};
    if (!value || typeof value !== "object") return normalized;
    Object.entries(value).forEach(([currency, entry]) => {
      const code = normalizeCurrencyCode(currency);
      const rateToRub = Number(typeof entry === "number" ? entry : entry?.rateToRub);
      if (!code || code === "RUB" || !Number.isFinite(rateToRub) || rateToRub <= 0) return;
      normalized[code] = { rateToRub, direction: "currencyToRub" };
    });
    return normalized;
  }

  function chooseCanonicalNames(rows, keySelector, nameSelector) {
    const namesByKey = new Map();
    rows.forEach((row) => {
      const key = keySelector(row);
      const name = cleanText(nameSelector(row), 120);
      if (!namesByKey.has(key)) namesByKey.set(key, new Map());
      const semantic = comparisonKey(name);
      const variants = namesByKey.get(key);
      if (!variants.has(semantic)) variants.set(semantic, new Map());
      const spellings = variants.get(semantic);
      spellings.set(name, (spellings.get(name) || 0) + 1);
    });
    const chosen = new Map();
    const conflicts = [];
    namesByKey.forEach((variants, key) => {
      const semanticOptions = [...variants.entries()].map(([semantic, spellings]) => {
        const sortedSpellings = [...spellings.entries()].sort((a, b) => b[1] - a[1]);
        return { semantic, name: sortedSpellings[0][0], count: sortedSpellings.reduce((sum, item) => sum + item[1], 0) };
      }).sort((a, b) => b.count - a.count);
      chosen.set(key, semanticOptions[0].name);
      if (semanticOptions.length > 1) {
        conflicts.push({ key, names: semanticOptions.map((item) => item.name), chosen: semanticOptions[0].name });
      }
    });
    return { chosen, conflicts };
  }

  function sanitizeImportRows(rawRows, quarterKey) {
    if (!Array.isArray(rawRows)) throw new Error("В импорте отсутствуют строки бюджета");
    const normalizedQuarter = normalizeQuarterKey(quarterKey);
    if (!normalizedQuarter) throw new Error("Выберите корректный период импорта");
    const importMonths = quarterMonths(normalizedQuarter);
    const rows = rawRows.map((row) => {
      const hasMonths = row?.months && typeof row.months === "object" && !Array.isArray(row.months);
      const monthKeys = hasMonths ? Object.keys(row.months) : [];
      const monthsMatchQuarter = hasMonths && (monthKeys.length === importMonths.length
        && monthKeys.every((monthKey) => importMonths.some((month) => month.key === monthKey)));
      const months = hasMonths && monthsMatchQuarter
        ? Object.fromEntries(importMonths.map((month) => [month.key, Number(row.months[month.key])]))
        : null;
      const amount = months
        ? importMonths.reduce((sum, month) => sum + months[month.key], 0)
        : Number(row?.amount);
      const projectName = cleanText(row?.projectName, 120);
      const budgetType = normalizeBudgetType(row?.budgetType);
      const responsibleGroups = [...new Set(
        (Array.isArray(row?.responsibleGroups) ? row.responsibleGroups : [row?.responsibleGroup])
          .map(normalizeResponsibleName)
          .filter(Boolean)
      )].sort((left, right) => left.localeCompare(right, "ru"));
      return {
        budgetType,
        locationCode: normalizeCode(row?.locationCode),
        locationName: cleanText(row?.locationName, 120),
        projectCode: normalizeCode(row?.projectCode),
        projectName,
        projectArticleName: cleanText(row?.projectArticleName, 120) || displayProjectName(budgetType, projectName),
        responsibleGroups,
        serviceName: cleanText(row?.serviceName, 120),
        legalEntity: cleanText(row?.legalEntity, 160),
        cfoName: cleanText(row?.cfoName, 160),
        currency: normalizeCurrencyCode(row?.currency),
        amount,
        months,
        monthsMatchQuarter
      };
    });
    const invalid = rows.find((row) => !row.budgetType || !row.locationCode || !row.locationName
      || !row.projectCode || !row.projectName || !row.projectArticleName || !row.currency
      || !Number.isFinite(row.amount) || row.amount < 0
      || !row.monthsMatchQuarter
      || (row.months && Object.values(row.months).some((amount) => !Number.isFinite(amount) || amount < 0)));
    if (invalid) throw new Error("В подготовленных данных Excel есть некорректная строка");
    if (!rows.length) throw new Error("В листах OPEX и CAPEX не найдено строк бюджета");

    rows.forEach((row) => { delete row.monthsMatchQuarter; });

    const locations = chooseCanonicalNames(rows, (row) => row.locationCode, (row) => row.locationName);
    const projects = chooseCanonicalNames(
      rows,
      (row) => `${row.budgetType}:${row.projectCode}`,
      (row) => displayProjectName(row.budgetType, row.projectName)
    );
    const projectArticles = chooseCanonicalNames(
      rows,
      (row) => `${row.budgetType}:${row.projectCode}:${comparisonKey(row.projectArticleName)}`,
      (row) => row.projectArticleName
    );
    const projectAttributeKey = (row) => `${row.budgetType}|${row.locationCode}|${row.projectCode}`;
    const services = chooseCanonicalNames(rows, projectAttributeKey, (row) => row.serviceName);
    const legalEntities = chooseCanonicalNames(rows, projectAttributeKey, (row) => row.legalEntity);
    const cfoNames = chooseCanonicalNames(rows, projectAttributeKey, (row) => row.cfoName);
    const grouped = new Map();
    rows.forEach((row) => {
      const projectKey = `${row.budgetType}:${row.projectCode}`;
      const projectArticleKey = `${projectKey}:${comparisonKey(row.projectArticleName)}`;
      const attributeKey = projectAttributeKey(row);
      const key = `${row.budgetType}|${row.locationCode}|${row.projectCode}|${row.currency}|${comparisonKey(row.projectArticleName)}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          budgetType: row.budgetType,
          locationCode: row.locationCode,
          locationName: locations.chosen.get(row.locationCode),
          projectCode: row.projectCode,
          projectName: projects.chosen.get(projectKey),
          projectArticleName: projectArticles.chosen.get(projectArticleKey),
          serviceName: services.chosen.get(attributeKey) || "",
          legalEntity: legalEntities.chosen.get(attributeKey) || "",
          cfoName: cfoNames.chosen.get(attributeKey) || "",
          responsibleGroups: new Set(),
          currency: row.currency,
          amount: 0,
          months: row.months ? Object.fromEntries(importMonths.map((month) => [month.key, 0])) : null,
          hasMonthlyRows: false,
          hasLegacyRows: false
        });
      }
      const target = grouped.get(key);
      target.amount += row.amount;
      row.responsibleGroups.forEach((name) => target.responsibleGroups.add(name));
      if (row.months) {
        target.hasMonthlyRows = true;
        target.months ||= Object.fromEntries(importMonths.map((month) => [month.key, 0]));
        importMonths.forEach((month) => { target.months[month.key] += row.months[month.key]; });
      } else {
        target.hasLegacyRows = true;
      }
    });
    if ([...grouped.values()].some((row) => row.hasMonthlyRows && row.hasLegacyRows)) {
      throw new Error("Нельзя смешивать квартальные и помесячные строки одного проекта");
    }
    const groups = [...grouped.values()].map(({ hasMonthlyRows, hasLegacyRows, ...row }) => {
      row.responsibleGroups = [...row.responsibleGroups].sort((left, right) => left.localeCompare(right, "ru"));
      if (row.months) row.amount = importMonths.reduce((sum, month) => sum + row.months[month.key], 0);
      return row;
    }).sort((a, b) =>
      a.locationName.localeCompare(b.locationName, "ru")
      || a.budgetType.localeCompare(b.budgetType)
      || a.projectName.localeCompare(b.projectName, "ru")
      || a.currency.localeCompare(b.currency));
    return { groups, locationConflicts: locations.conflicts, projectConflicts: projects.conflicts };
  }

  function currentLocationByCode(state, code) {
    return (state.locations || []).filter((location) => normalizeCode(location.code) === code);
  }

  function currentArticleByIdentity(state, budgetType, code) {
    return (state.articles || []).filter((article) =>
      normalizeBudgetType(article.budgetType) === budgetType && normalizeCode(article.code) === code);
  }

  function currentProjectArticleByName(project, name) {
    const key = comparisonKey(name);
    return (project?.subarticles || []).find((item) => comparisonKey(item.name) === key) || null;
  }

  function stableProjectArticleId(name, usedIds) {
    const normalized = comparisonKey(name) || "article";
    let hash = 2166136261;
    for (const char of normalized) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const base = `excel:${(hash >>> 0).toString(36)}`;
    if (!usedIds.has(base)) return base;
    let suffix = 2;
    while (usedIds.has(`${base}:${suffix}`)) suffix += 1;
    return `${base}:${suffix}`;
  }

  function ensureImportedProjectArticle(project, name) {
    project.subarticles ||= [];
    const articleName = cleanText(name, 120) || cleanText(project.name, 120) || "Основная статья";
    const existing = currentProjectArticleByName(project, articleName);
    if (existing) {
      existing.archived = false;
      existing.code = cleanText(project.code, 80);
      return existing;
    }
    if (comparisonKey(articleName) === comparisonKey(project.name)
      && !project.subarticles.some((item) => item.id === DEFAULT_PROJECT_ARTICLE_ID)) {
      return createDefaultProjectArticle(project, { name: articleName });
    }
    const usedIds = new Set(project.subarticles.map((item) => item.id));
    const projectArticle = {
      id: stableProjectArticleId(articleName, usedIds),
      name: articleName,
      code: cleanText(project.code, 80),
      archived: false
    };
    project.subarticles.push(projectArticle);
    return projectArticle;
  }

  function budgetCurrencyObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  }

  function monthlyBudgetCurrencyObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  }

  function projectArticleItemKey(projectId, projectArticleId) {
    return `${projectId}|${projectArticleId}`;
  }

  function nextProjectArticleId(project, preferredId = DEFAULT_PROJECT_ARTICLE_ID) {
    const used = new Set((project.subarticles || []).map((item) => item.id));
    if (!used.has(preferredId)) return preferredId;
    let suffix = 2;
    while (used.has(`${preferredId}-${suffix}`)) suffix += 1;
    return `${preferredId}-${suffix}`;
  }

  function createDefaultProjectArticle(project, options = {}) {
    project.subarticles ||= [];
    const preferredId = cleanText(options.id, 80) || DEFAULT_PROJECT_ARTICLE_ID;
    const existing = project.subarticles.find((item) => item.id === preferredId);
    if (existing && options.forceNew !== true) {
      existing.archived = false;
      return existing;
    }
    const projectArticle = {
      id: nextProjectArticleId(project, preferredId),
      name: cleanText(options.name, 120) || cleanText(project.name, 120) || "Основная статья",
      code: cleanText(project.code, 80),
      archived: false
    };
    project.subarticles.push(projectArticle);
    return projectArticle;
  }

  function hasNestedProjectArticleReferences(state, projectId, projectArticleId) {
    const itemKey = projectArticleItemKey(projectId, projectArticleId);
    const hasBudget = [state.budgets, state.monthlyBudgets].some((collection) =>
      Object.values(collection || {}).some((store) =>
        store && typeof store === "object" && Object.keys(store[itemKey] || {}).length > 0));
    const hasExpense = (state.expenses || []).some((expense) =>
      expense?.articleId === projectId && expense.subarticleId === projectArticleId);
    const hasForecast = (state.forecastTickets || []).some((ticket) =>
      (ticket.allocations || []).some((allocation) =>
        allocation?.articleId === projectId && allocation.subarticleId === projectArticleId));
    return hasBudget || hasExpense || hasForecast;
  }

  function ensureProjectArticleHierarchy(state, options = {}) {
    if (!state || typeof state !== "object") return { created: 0, migratedBudgets: 0, migratedExpenses: 0, migratedForecasts: 0 };
    state.articles ||= [];
    state.budgets ||= {};
    state.monthlyBudgets ||= {};
    state.expenses ||= [];
    state.forecastTickets ||= [];
    let created = 0;
    let migratedBudgets = 0;
    let migratedExpenses = 0;
    let migratedForecasts = 0;

    state.articles.forEach((project) => {
      project.subarticles = Array.isArray(project.subarticles) ? project.subarticles : [];
      project.subarticles.forEach((projectArticle) => {
        projectArticle.code = cleanText(project.code, 80);
      });
      const rootBudgetStores = [];
      const rootMonthlyStores = [];
      Object.values(state.budgets).forEach((store) => {
        if (store && typeof store === "object" && Object.keys(store[project.id] || {}).length) rootBudgetStores.push(store);
      });
      Object.values(state.monthlyBudgets).forEach((store) => {
        if (store && typeof store === "object" && Object.keys(store[project.id] || {}).length) rootMonthlyStores.push(store);
      });
      const migrateRootTransactions = options.migrateRootTransactions !== false;
      const rootExpenses = migrateRootTransactions
        ? state.expenses.filter((expense) => expense?.articleId === project.id && !expense.subarticleId)
        : [];
      const rootForecasts = migrateRootTransactions
        ? state.forecastTickets.flatMap((ticket) => ticket.allocations || [])
          .filter((allocation) => allocation?.articleId === project.id && !allocation.subarticleId)
        : [];
      const needsMigration = rootBudgetStores.length > 0 || rootMonthlyStores.length > 0
        || rootExpenses.length > 0 || rootForecasts.length > 0;
      const activeProjectArticles = project.subarticles.filter((item) => !item.archived);
      let target = project.subarticles.find((item) => item.id === DEFAULT_PROJECT_ARTICLE_ID);

      if (!target && (needsMigration || activeProjectArticles.length === 0)) {
        target = createDefaultProjectArticle(project);
        created += 1;
      } else if (target && target.archived && activeProjectArticles.length === 0) {
        target.archived = false;
      }

      if (needsMigration && target && hasNestedProjectArticleReferences(state, project.id, target.id)) {
        target = createDefaultProjectArticle(project, {
          id: "legacy",
          name: `${cleanText(project.name, 100) || "Проект"} — ранее без статьи`,
          forceNew: true
        });
        created += 1;
      }

      if (needsMigration && !target) {
        target = createDefaultProjectArticle(project);
        created += 1;
      }

      if (target) {
        const itemKey = projectArticleItemKey(project.id, target.id);
        rootBudgetStores.forEach((store) => {
          store[itemKey] = store[project.id];
          migratedBudgets += 1;
        });
        rootMonthlyStores.forEach((store) => {
          store[itemKey] = store[project.id];
          migratedBudgets += 1;
        });
        rootExpenses.forEach((expense) => {
          expense.subarticleId = target.id;
          migratedExpenses += 1;
        });
        rootForecasts.forEach((allocation) => {
          allocation.subarticleId = target.id;
          migratedForecasts += 1;
        });
      }

      Object.values(state.budgets).forEach((store) => {
        if (store && typeof store === "object") delete store[project.id];
      });
      Object.values(state.monthlyBudgets).forEach((store) => {
        if (store && typeof store === "object") delete store[project.id];
      });
    });

    return { created, migratedBudgets, migratedExpenses, migratedForecasts };
  }

  function pruneUnusedImportedProjectDefaults(state) {
    if (!state || typeof state !== "object") return 0;
    let removed = 0;
    (state.articles || []).forEach((project) => {
      if (project?.imported !== true || !Array.isArray(project.subarticles)) return;
      const defaultArticle = project.subarticles.find((item) => item.id === DEFAULT_PROJECT_ARTICLE_ID);
      const detailedArticles = project.subarticles.filter((item) =>
        item.id !== DEFAULT_PROJECT_ARTICLE_ID && item.archived !== true);
      if (!defaultArticle || !detailedArticles.length) return;
      if (hasNestedProjectArticleReferences(state, project.id, defaultArticle.id)) return;
      project.subarticles = project.subarticles.filter((item) => item.id !== DEFAULT_PROJECT_ARTICLE_ID);
      removed += 1;
    });
    return removed;
  }

  function hasBudgetAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) && value !== 0;
    return Object.values(budgetCurrencyObject(value)).some((amount) => Number.isFinite(Number(amount)) && Number(amount) !== 0);
  }

  function hasMonthlyBudgetAmount(value) {
    return Object.values(monthlyBudgetCurrencyObject(value)).some((months) =>
      months && typeof months === "object" && !Array.isArray(months)
      && Object.values(months).some((amount) => Number.isFinite(Number(amount)) && Number(amount) !== 0));
  }

  function legacySampleFor(article) {
    const sample = LEGACY_SAMPLE_BY_ID.get(article?.id);
    if (!sample) return null;
    if (normalizeBudgetType(article.budgetType) || article.imported === true) return null;
    return sample;
  }

  function importedTargetForSample(articles, sample, source) {
    const sourceNames = new Set([comparisonKey(source?.name), comparisonKey(sample.name)].filter(Boolean));
    const candidates = articles.filter((article) =>
      article?.id !== source?.id
      && normalizeBudgetType(article.budgetType)
      && normalizeCode(article.code)
      && sourceNames.has(comparisonKey(article.name)));
    const expectedType = /\(осн\)\s*$/iu.test(cleanText(source?.name) || sample.name) ? "capex" : "opex";
    const preferred = candidates.filter((article) => normalizeBudgetType(article.budgetType) === expectedType);
    if (preferred.length === 1) return preferred[0];
    return candidates.length === 1 ? candidates[0] : null;
  }

  function cleanupLegacySampleProjects(state) {
    if (!state || typeof state !== "object") return { removed: 0, remapped: 0, preserved: 0 };
    state.articles ||= [];
    state.expenses ||= [];
    state.forecastTickets ||= [];
    state.budgets ||= {};
    state.monthlyBudgets ||= {};
    const removedIds = new Set();
    let remapped = 0;
    let preserved = 0;

    state.articles.forEach((article) => {
      const sample = legacySampleFor(article);
      if (!sample) return;
      const target = importedTargetForSample(state.articles, sample, article);
      const linkedExpenses = state.expenses.filter((expense) => expense?.articleId === article.id);
      const linkedForecasts = state.forecastTickets.flatMap((ticket) => ticket.allocations || [])
        .filter((allocation) => allocation?.articleId === article.id);
      const hasDetailedExpense = linkedExpenses.some((expense) => expense.subarticleId);
      const hasDetailedForecast = linkedForecasts.some((allocation) => allocation.subarticleId);
      let hasRootBudget = false;
      let hasDetailedBudget = false;
      Object.values(state.budgets).forEach((store) => {
        if (!store || typeof store !== "object") return;
        if (hasBudgetAmount(store[article.id])) hasRootBudget = true;
        Object.entries(store).forEach(([itemKey, value]) => {
          if (itemKey.startsWith(`${article.id}|`) && hasBudgetAmount(value)) hasDetailedBudget = true;
        });
      });
      Object.values(state.monthlyBudgets).forEach((store) => {
        if (!store || typeof store !== "object") return;
        if (hasMonthlyBudgetAmount(store[article.id])) hasRootBudget = true;
        Object.entries(store).forEach(([itemKey, value]) => {
          if (itemKey.startsWith(`${article.id}|`) && hasMonthlyBudgetAmount(value)) hasDetailedBudget = true;
        });
      });

      const hasReferences = linkedExpenses.length > 0 || linkedForecasts.length > 0 || hasRootBudget || hasDetailedBudget;
      if (!target && hasReferences) {
        preserved += 1;
        return;
      }
      if (target && (hasDetailedExpense || hasDetailedForecast || hasDetailedBudget)) {
        preserved += 1;
        return;
      }

      if (target) {
        linkedExpenses.forEach((expense) => {
          expense.articleId = target.id;
          expense.subarticleId = null;
          remapped += 1;
        });
        linkedForecasts.forEach((allocation) => {
          allocation.articleId = target.id;
          allocation.subarticleId = null;
          remapped += 1;
        });
        Object.values(state.budgets).forEach((store) => {
          if (!store || typeof store !== "object") return;
          const sourceAmounts = budgetCurrencyObject(store[article.id]);
          const targetAmounts = budgetCurrencyObject(store[target.id]);
          if (Object.keys(sourceAmounts).length || Object.keys(targetAmounts).length) {
            const merged = { ...sourceAmounts, ...targetAmounts };
            if (Object.keys(merged).length) store[target.id] = merged;
          }
          delete store[article.id];
        });
        Object.values(state.monthlyBudgets).forEach((store) => {
          if (!store || typeof store !== "object") return;
          const sourceAmounts = monthlyBudgetCurrencyObject(store[article.id]);
          const targetAmounts = monthlyBudgetCurrencyObject(store[target.id]);
          if (Object.keys(sourceAmounts).length || Object.keys(targetAmounts).length) {
            const merged = { ...sourceAmounts, ...targetAmounts };
            if (Object.keys(merged).length) store[target.id] = merged;
          }
          delete store[article.id];
        });
      }
      removedIds.add(article.id);
    });

    if (removedIds.size) {
      state.articles = state.articles.filter((article) => !removedIds.has(article.id));
      Object.values(state.budgets).forEach((store) => {
        if (!store || typeof store !== "object") return;
        Object.keys(store).forEach((itemKey) => {
          const articleId = itemKey.split("|")[0];
          if (removedIds.has(articleId)) delete store[itemKey];
        });
      });
      Object.values(state.monthlyBudgets).forEach((store) => {
        if (!store || typeof store !== "object") return;
        Object.keys(store).forEach((itemKey) => {
          const articleId = itemKey.split("|")[0];
          if (removedIds.has(articleId)) delete store[itemKey];
        });
      });
    }
    return { removed: removedIds.size, remapped, preserved };
  }

  function buildBudgetImportPreview(state, rawRows, meta = {}) {
    const quarterKey = normalizeQuarterKey(meta.quarterKey);
    if (!quarterKey) throw new Error("Выберите период импорта");
    const periodClosed = PeriodLocks
      && (PeriodLocks.isQuarterClosed(state, quarterKey)
        || PeriodLocks.quarterMonths(quarterKey).some((monthKey) => PeriodLocks.isMonthClosed(state, monthKey)));
    const sanitized = sanitizeImportRows(rawRows, quarterKey);
    const activeGroups = sanitized.groups.filter((row) => row.amount !== 0);
    const locationCodes = new Set(sanitized.groups.map((row) => row.locationCode));
    const projectKeys = new Set(sanitized.groups.map((row) => `${row.budgetType}:${row.projectCode}`));
    const projectArticleKeys = new Set(sanitized.groups.map((row) =>
      `${row.budgetType}:${row.projectCode}:${comparisonKey(row.projectArticleName)}`));
    const responsibles = new Set(sanitized.groups.flatMap((row) => row.responsibleGroups));
    const services = new Set(sanitized.groups.map((row) => row.serviceName).filter(Boolean));
    const legalEntities = new Set(sanitized.groups.map((row) => row.legalEntity).filter(Boolean));
    const cfoValues = new Set(sanitized.groups.map((row) => row.cfoName).filter(Boolean));
    const currencies = [...new Set(sanitized.groups.map((row) => row.currency))].sort();
    let newLocations = 0;
    let newProjects = 0;
    const newProjectArticleKeys = new Set();
    let replacedValues = 0;
    const existingConflicts = [];
    locationCodes.forEach((code) => {
      const matches = currentLocationByCode(state, code);
      if (matches.length > 1) throw new Error(`В приложении несколько локаций с кодом ${code}`);
      if (!matches.length) newLocations += 1;
      else {
        const incoming = sanitized.groups.find((row) => row.locationCode === code)?.locationName;
        if (incoming && comparisonKey(matches[0].name) !== comparisonKey(incoming)) {
          existingConflicts.push({ kind: "location", key: code, names: [matches[0].name, incoming], chosen: matches[0].name });
        }
      }
    });
    projectKeys.forEach((key) => {
      const separator = key.indexOf(":");
      const type = key.slice(0, separator);
      const code = key.slice(separator + 1);
      const matches = currentArticleByIdentity(state, type, code);
      if (matches.length > 1) throw new Error(`В приложении несколько проектов ${type.toUpperCase()} с кодом ${code}`);
      if (!matches.length) newProjects += 1;
      else {
        const incoming = sanitized.groups.find((row) => row.budgetType === type && row.projectCode === code)?.projectName;
        if (incoming && comparisonKey(matches[0].name) !== comparisonKey(incoming)) {
          existingConflicts.push({ kind: "project", key, names: [matches[0].name, incoming], chosen: incoming });
        }
      }
    });
    sanitized.groups.forEach((row) => {
      const project = currentArticleByIdentity(state, row.budgetType, row.projectCode)[0];
      if (!project || !currentProjectArticleByName(project, row.projectArticleName)) {
        newProjectArticleKeys.add(`${row.budgetType}:${row.projectCode}:${comparisonKey(row.projectArticleName)}`);
      }
    });
    const checkedReplacements = new Set();
    sanitized.groups.forEach((row) => {
      const location = currentLocationByCode(state, row.locationCode)[0];
      const article = currentArticleByIdentity(state, row.budgetType, row.projectCode)[0];
      const store = location ? state.budgets?.[`${location.id}|${quarterKey}`] : null;
      const replacementKey = `${row.locationCode}:${row.budgetType}:${row.projectCode}:${row.currency}`;
      if (checkedReplacements.has(replacementKey)) return;
      checkedReplacements.add(replacementKey);
      const hasExisting = article && Object.entries(store || {}).some(([itemKey, amounts]) =>
        (itemKey === article.id || itemKey.startsWith(`${article.id}|`))
        && Object.prototype.hasOwnProperty.call(budgetCurrencyObject(amounts), row.currency));
      if (hasExisting) {
        replacedValues += 1;
      }
    });
    const amountsByCurrency = {};
    sanitized.groups.forEach((row) => {
      amountsByCurrency[row.currency] = (amountsByCurrency[row.currency] || 0) + row.amount;
    });
    const conflicts = [
      ...sanitized.locationConflicts.map((item) => ({ kind: "location", ...item })),
      ...sanitized.projectConflicts.map((item) => ({ kind: "project", ...item })),
      ...existingConflicts
    ];
    return {
      quarterKey,
      periodClosed: Boolean(periodClosed),
      sourceFile: cleanText(meta.sourceFile || "budget.xlsx", 200),
      rows: sanitized.groups,
      conflicts,
      stats: {
        sourceRows: Number(meta.sourceRows) || rawRows.length,
        groups: sanitized.groups.length,
        nonZeroGroups: sanitized.groups.filter((row) => row.amount !== 0).length,
        locations: locationCodes.size,
        projects: projectKeys.size,
        projectArticles: projectArticleKeys.size,
        responsibles: responsibles.size,
        services: services.size,
        legalEntities: legalEntities.size,
        cfoValues: cfoValues.size,
        nonZeroLocations: new Set(activeGroups.map((row) => row.locationCode)).size,
        nonZeroProjects: new Set(activeGroups.map((row) => `${row.budgetType}:${row.projectCode}`)).size,
        nonZeroProjectArticles: new Set(activeGroups.map((row) =>
          `${row.budgetType}:${row.projectCode}:${comparisonKey(row.projectArticleName)}`)).size,
        currencies,
        newLocations,
        newProjects,
        newProjectArticles: newProjectArticleKeys.size,
        replacedValues,
        skippedRows: Number(meta.skippedRows) || 0,
        ignoredAmountCells: Number(meta.ignoredAmountCells) || 0,
        recoveredProjectCodes: Number(meta.recoveredProjectCodes) || 0,
        amountsByCurrency
      }
    };
  }

  function stableImportedId(prefix, code, usedIds) {
    const base = `${prefix}:${code}`;
    if (!usedIds.has(base)) return base;
    let hash = 2166136261;
    for (const char of base) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    let candidate = `${base}:${(hash >>> 0).toString(36)}`;
    let suffix = 2;
    while (usedIds.has(candidate)) candidate = `${base}:${suffix++}`;
    return candidate;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function applyBudgetImport(currentState, payload) {
    const quarterKey = normalizeQuarterKey(payload?.quarterKey);
    if (!quarterKey) throw new Error("Выберите корректный период импорта");
    const importMonths = quarterMonths(quarterKey);
    if (PeriodLocks) {
      if (PeriodLocks.isQuarterClosed(currentState, quarterKey)) {
        throw new Error(`Импорт заблокирован: квартал ${quarterKey} закрыт. Сначала переоткройте его.`);
      }
      const closedMonth = PeriodLocks.quarterMonths(quarterKey)
        .find((monthKey) => PeriodLocks.isMonthClosed(currentState, monthKey));
      if (closedMonth) {
        throw new Error(`Импорт заблокирован: месяц ${closedMonth} закрыт. Сначала переоткройте его.`);
      }
    }
    const preview = buildBudgetImportPreview(currentState, payload?.rows, {
      quarterKey,
      sourceFile: payload?.sourceFile,
      sourceRows: payload?.sourceRows,
      skippedRows: payload?.skippedRows,
      ignoredAmountCells: payload?.ignoredAmountCells,
      recoveredProjectCodes: payload?.recoveredProjectCodes
    });
    const next = deepClone(currentState);
    next.locations ||= [];
    next.articles ||= [];
    next.budgets ||= {};
    next.monthlyBudgets ||= {};
    next.responsibleGroups ||= {};
    next.projectAttributes ||= {};
    next.exchangeRatesByQuarter ||= {};
    const importedExchangeRates = normalizeImportedExchangeRates(payload?.exchangeRates);
    if (Object.keys(importedExchangeRates).length) {
      next.exchangeRatesByQuarter[quarterKey] = {
        ...(next.exchangeRatesByQuarter[quarterKey] || {}),
        ...importedExchangeRates
      };
    }
    const usedLocationIds = new Set(next.locations.map((location) => location.id));
    const usedArticleIds = new Set(next.articles.map((article) => article.id));
    const locations = new Map();
    const articles = new Map();
    const projectArticles = new Map();

    preview.rows.forEach((row) => {
      if (!locations.has(row.locationCode)) {
        let location = currentLocationByCode(next, row.locationCode)[0];
        if (!location) {
          const id = stableImportedId("location", row.locationCode, usedLocationIds);
          usedLocationIds.add(id);
          location = { id, name: row.locationName, code: row.locationCode, archived: false };
          next.locations.push(location);
        }
        locations.set(row.locationCode, location);
      }
      const identity = `${row.budgetType}:${row.projectCode}`;
      if (!articles.has(identity)) {
        let article = currentArticleByIdentity(next, row.budgetType, row.projectCode)[0];
        if (!article) {
          const id = stableImportedId(row.budgetType, row.projectCode, usedArticleIds);
          usedArticleIds.add(id);
          article = {
            id,
            name: row.projectName,
            code: row.projectCode,
            budgetType: row.budgetType,
            imported: true,
            archived: false,
            subarticles: []
          };
          next.articles.push(article);
        } else if (article.imported === true) {
          article.name = row.projectName;
          article.archived = false;
        }
        articles.set(identity, article);
      }
      const article = articles.get(identity);
      const projectArticleIdentity = `${identity}:${comparisonKey(row.projectArticleName)}`;
      if (!projectArticles.has(projectArticleIdentity)) {
        projectArticles.set(projectArticleIdentity, ensureImportedProjectArticle(article, row.projectArticleName));
      }
    });

    const clearedProjectCurrencies = new Set();
    preview.rows.forEach((row) => {
      const location = locations.get(row.locationCode) || currentLocationByCode(next, row.locationCode)[0];
      const article = articles.get(`${row.budgetType}:${row.projectCode}`)
        || currentArticleByIdentity(next, row.budgetType, row.projectCode)[0];
      if (!location || !article) return;
      const clearKey = `${location.id}|${article.id}|${row.currency}`;
      if (clearedProjectCurrencies.has(clearKey)) return;
      clearedProjectCurrencies.add(clearKey);
      const storeKey = `${location.id}|${quarterKey}`;
      [next.budgets?.[storeKey], next.monthlyBudgets?.[storeKey]].forEach((store) => {
        if (!store || typeof store !== "object") return;
        Object.keys(store).forEach((itemKey) => {
          if (itemKey !== article.id && !itemKey.startsWith(`${article.id}|`)) return;
          const values = { ...budgetCurrencyObject(store[itemKey]) };
          delete values[row.currency];
          if (Object.keys(values).length) store[itemKey] = values;
          else delete store[itemKey];
        });
      });
      if (next.monthlyBudgets?.[storeKey] && !Object.keys(next.monthlyBudgets[storeKey]).length) {
        delete next.monthlyBudgets[storeKey];
      }
    });

    const clearedProjectResponsibilities = new Set();
    preview.rows.forEach((row) => {
      const location = locations.get(row.locationCode) || currentLocationByCode(next, row.locationCode)[0];
      const article = articles.get(`${row.budgetType}:${row.projectCode}`)
        || currentArticleByIdentity(next, row.budgetType, row.projectCode)[0];
      if (!location || !article) return;
      const storeKey = `${location.id}|${quarterKey}`;
      const clearKey = `${storeKey}|${article.id}`;
      if (clearedProjectResponsibilities.has(clearKey)) return;
      clearedProjectResponsibilities.add(clearKey);
      if (next.responsibleGroups[storeKey]) {
        delete next.responsibleGroups[storeKey][article.id];
        if (!Object.keys(next.responsibleGroups[storeKey]).length) delete next.responsibleGroups[storeKey];
      }
      if (next.projectAttributes[storeKey]) {
        delete next.projectAttributes[storeKey][article.id];
        if (!Object.keys(next.projectAttributes[storeKey]).length) delete next.projectAttributes[storeKey];
      }
    });

    preview.rows.forEach((row) => {
      const location = locations.get(row.locationCode) || currentLocationByCode(next, row.locationCode)[0];
      const article = articles.get(`${row.budgetType}:${row.projectCode}`)
        || currentArticleByIdentity(next, row.budgetType, row.projectCode)[0];
      if (!location || !article) return;
      const storeKey = `${location.id}|${quarterKey}`;
      next.budgets[storeKey] ||= {};
      next.monthlyBudgets[storeKey] ||= {};
      const projectArticle = projectArticles.get(`${row.budgetType}:${row.projectCode}:${comparisonKey(row.projectArticleName)}`)
        || ensureImportedProjectArticle(article, row.projectArticleName);
      const itemKey = projectArticleItemKey(article.id, projectArticle.id);
      const values = budgetCurrencyObject(next.budgets[storeKey][itemKey]);
      const updated = { ...values };
      if (row.amount === 0) delete updated[row.currency];
      else updated[row.currency] = row.amount;
      if (Object.keys(updated).length) next.budgets[storeKey][itemKey] = updated;
      else delete next.budgets[storeKey][itemKey];

      const monthlyValues = monthlyBudgetCurrencyObject(next.monthlyBudgets[storeKey][itemKey]);
      const updatedMonthly = { ...monthlyValues };
      if (row.amount === 0 || !row.months) delete updatedMonthly[row.currency];
      else updatedMonthly[row.currency] = Object.fromEntries(importMonths.map((month) => [month.key, row.months[month.key]]));
      if (Object.keys(updatedMonthly).length) next.monthlyBudgets[storeKey][itemKey] = updatedMonthly;
      else delete next.monthlyBudgets[storeKey][itemKey];
      if (!Object.keys(next.monthlyBudgets[storeKey]).length) delete next.monthlyBudgets[storeKey];

      if (row.responsibleGroups.length) {
        next.responsibleGroups[storeKey] ||= {};
        const currentGroups = Array.isArray(next.responsibleGroups[storeKey][article.id])
          ? next.responsibleGroups[storeKey][article.id]
          : [];
        next.responsibleGroups[storeKey][article.id] = [...new Set([...currentGroups, ...row.responsibleGroups])]
          .map(normalizeResponsibleName)
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right, "ru"));
      }

      const attributes = {
        service: cleanText(row.serviceName, 120),
        legalEntity: cleanText(row.legalEntity, 160),
        cfo: cleanText(row.cfoName, 160),
        location: cleanText(row.locationName, 120)
      };
      if (attributes.service || attributes.legalEntity || attributes.cfo || attributes.location) {
        next.projectAttributes[storeKey] ||= {};
        next.projectAttributes[storeKey][article.id] = attributes;
      } else if (next.projectAttributes[storeKey]) {
        delete next.projectAttributes[storeKey][article.id];
        if (!Object.keys(next.projectAttributes[storeKey]).length) delete next.projectAttributes[storeKey];
      }
    });

    cleanupLegacySampleProjects(next);
    pruneUnusedImportedProjectDefaults(next);
    ensureProjectArticleHierarchy(next, { migrateRootTransactions: false });

    next.imports = Array.isArray(next.imports) ? next.imports.slice(-19) : [];
    next.imports.push({
      id: `excel-${Date.now()}`,
      importedAt: new Date().toISOString(),
      sourceFile: preview.sourceFile,
      quarterKey,
      rows: preview.stats.sourceRows,
      groups: preview.stats.groups,
      locations: preview.stats.locations,
      projects: preview.stats.projects,
      projectArticles: preview.stats.projectArticles,
      responsibles: preview.stats.responsibles,
      services: preview.stats.services,
      legalEntities: preview.stats.legalEntities,
      cfoValues: preview.stats.cfoValues,
      recoveredProjectCodes: preview.stats.recoveredProjectCodes,
      exchangeRates: Object.keys(importedExchangeRates).length,
      currencies: preview.stats.currencies
    });
    removeEmptyDefaultLocation(next);
    return next;
  }

  function removeEmptyDefaultLocation(next) {
    // Удалить техническую заглушку «Основная локация» (id "default", пустой код),
    // если импорт принёс реальные локации и у заглушки нет ни бюджета, ни расходов,
    // ни ответственных, ни атрибутов — иначе она висит в списке без данных.
    if (!Array.isArray(next.locations) || next.locations.length <= 1) return;
    const realLocations = next.locations.filter((location) => location.id !== "default");
    if (realLocations.length === 0) return;
    const placeholder = next.locations.find((location) => location.id === "default" && !location.code);
    if (!placeholder) return;
    const hasDefaultBudget = Object.keys(next.budgets || {}).some((key) => key.startsWith("default|"))
      || Object.keys(next.monthlyBudgets || {}).some((key) => key.startsWith("default|"));
    if (hasDefaultBudget) return;
    const hasDefaultExpenses = (next.expenses || []).some((expense) => expense.locationId === "default");
    if (hasDefaultExpenses) return;
    const hasDefaultForecasts = (next.forecastTickets || []).some((ticket) =>
      (ticket.allocations || []).some((allocation) => allocation.locationId === "default"));
    if (hasDefaultForecasts) return;
    const hasDefaultResponsibles = Object.keys(next.responsibleGroups || {}).some((key) => key.startsWith("default|"));
    if (hasDefaultResponsibles) return;
    const hasDefaultAttributes = Object.keys(next.projectAttributes || {}).some((key) => key.startsWith("default|"));
    if (hasDefaultAttributes) return;
    next.locations = next.locations.filter((location) => location.id !== "default");
  }

  return {
    IMPORT_QUARTER: LEGACY_IMPORT_QUARTER,
    IMPORT_MONTHS: quarterMonths(LEGACY_IMPORT_QUARTER),
    LEGACY_IMPORT_QUARTER,
    DEFAULT_PROJECT_ARTICLE_ID,
    normalizeCurrencyCode,
    normalizeBudgetType,
    normalizeResponsibleName,
    cleanText,
    comparisonKey,
    normalizeCode,
    numericCell,
    quarterKeyFromExchangeHeader,
    parseExchangeRateSheet,
    normalizeImportedExchangeRates,
    rowsFromWorksheet,
    readWorkbook,
    normalizeQuarterKey,
    quarterMonths,
    inferMissingProjectCodes,
    ensureCapexSuffix,
    cleanupLegacySampleProjects,
    pruneUnusedImportedProjectDefaults,
    ensureProjectArticleHierarchy,
    createDefaultProjectArticle,
    inspectBudgetWorkbook,
    parseBudgetWorkbook,
    buildBudgetImportPreview,
    applyBudgetImport
  };
});
