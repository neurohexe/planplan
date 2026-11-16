import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'src', 'vendor');
const cssFiles = ['styles.css', 'graphite.css', 'plan-fact-chart.css', 'nav-drawer.css'];
const jsFiles = ['runtime-config.js', 'period-locks.js', 'budget-import.js', 'expense-import.js',
  'tracker-sync.js', 'nav-drawer.js', 'plan-fact-chart.js', 'app.js'];
const read = (file) => fs.readFileSync(file, 'utf8');

function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Patch must match exactly once: ${before.slice(0, 100)}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceFunction(source, name, replacement) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/^  (?:async )?function \w+\(/m);
  if (next < 0) throw new Error(`Function boundary not found: ${name}`);
  return source.slice(0, start) + replacement.trimEnd() + '\n\n' + source.slice(start + 1 + next);
}

export function verifyVendor() {
  const manifest = JSON.parse(read(path.join(vendor, 'manifest.json')));
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(vendor, entry.path));
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== entry.sha256 || bytes.length !== entry.bytes) {
      throw new Error(`Vendor file differs from recorded source: ${entry.path}`);
    }
  }
  return manifest;
}

export function transformScript(name, original = read(path.join(vendor, name))) {
  let source = original;
  if (name === 'app.js') {
    source = replaceOnce(source,
      'const LOCAL_ONLY_BUILD = globalThis.PLAN_FACT_RUNTIME?.mode !== "server";',
      'const LOCAL_ONLY_BUILD = true; // DataLens: only the embedded local document.');
    source = replaceFunction(source, 'init', `  async function init() {
    cacheDom();
    applyLanguage(language);
    bindEvents();
    populateYearOptions();
    setPeriodControls();
    state = await loadState();
    populateYearOptions();
    setPeriodControls();
    populateTrackerPeriodControls();
    populateTrackerScopeControl();
    renderAll();
    updateStorageMode();
    globalThis.PlanFactDL.attach({
      getState: () => state,
      getView: () => ({year: selectedYear, quarter: selectedQuarter, locationId: selectedLocation}),
      importState: async (incoming, view = {}) => {
        await mutate("importState", {state: normalizeState(incoming)});
        if (Number.isInteger(Number(view.year)) && Number(view.year) >= 1900 && Number(view.year) <= 9999
            && Number.isInteger(Number(view.quarter)) && Number(view.quarter) >= 1 && Number(view.quarter) <= 4) {
          selectedYear = Number(view.year);
          selectedQuarter = Number(view.quarter);
        }
        if (view.locationId === ALL_LOCATIONS
            || state.locations.some((item) => item.id === view.locationId && !item.archived)) {
          selectedLocation = view.locationId;
        }
        globalThis.PlanFactDL.storage.setItem(UI_KEY, JSON.stringify({
          year: selectedYear, quarter: selectedQuarter, locationId: selectedLocation
        }));
        populateYearOptions();
        setPeriodControls();
        renderAll();
        return state;
      }
    });
  }`);
    source = replaceFunction(source, 'loadState', `  async function loadState() {
    sharedMode = false;
    return globalThis.PlanFactDL.initialState
      ? normalizeState(globalThis.PlanFactDL.initialState) : createInitialState();
  }`);
    source = replaceFunction(source, 'saveState', `  function saveState(nextState) {
    globalThis.PlanFactDL.changed(nextState);
    return true;
  }`);
    source = replaceFunction(source, 'startTrackerSyncScheduler', `  function startTrackerSyncScheduler() {
    // DataLens HTML documents have no network synchronization.
  }`);
    source = replaceFunction(source, 'syncTrackerExpenses', `  async function syncTrackerExpenses() {
    return globalThis.PlanFactDL.networkDisabled();
  }`);
    source = replaceFunction(source, 'saveTrackerToken', `  async function saveTrackerToken(event) {
    event?.preventDefault();
    return globalThis.PlanFactDL.networkDisabled();
  }`);
    source = replaceFunction(source, 'startCorporateAccessMonitor', `  function startCorporateAccessMonitor() {
    // Corporate authentication belongs to the DataLens page, not its document.
  }`);
    source = replaceFunction(source, 'downloadFile', `  function downloadFile(filename, content, type) {
    return globalThis.PlanFactDL.exportFile(filename, content, type);
  }`);
    source = replaceFunction(source, 'confirmAction', `  async function confirmAction(message) {
    return globalThis.PlanFactDL.askConfirmation(translateString(message));
  }`);
    source = replaceFunction(source, 'promptAction', `  async function promptAction(message, defaultValue = "") {
    return globalThis.PlanFactDL.askValue(translateString(message), translateString(defaultValue));
  }`);
    for (const name of ['cancelBudgetEdit', 'openProjectDialog', 'selectLocation', 'navigate', 'handlePeriodChange']) {
      source = replaceOnce(source, `  function ${name}(`, `  async function ${name}(`);
    }
    // All native confirm/prompt callers now suspend until the document dialog resolves.
    source = source.replace(/(?<!function )\b(confirmAction|promptAction)\(/g, 'await $1(');
    source = replaceFunction(source, 'updateStorageMode', `  function updateStorageMode() {
    dom.storageBadge.classList.remove("is-shared");
    dom.storageBadge.querySelector("strong").textContent = "DataLens · рабочая копия";
    dom.storageBadge.querySelector("small").textContent = "Изменения в этой вкладке";
    dom.updateTrackerTokenBtn.hidden = true;
  }`);
    source = replaceFunction(source, 'renderDataPage', `  function renderDataPage() {
    dom.profileName.value = profile.name;
    dom.sharedModeDescription.textContent = "Сохраните рабочий файл, чтобы продолжить позже.";
    dom.sharedModeCommand.textContent = "DataLens HTML";
    renderPeriodCloseCard();
  }`);
    source = replaceFunction(source, 'trackerPersonalTokenAllowed', `  function trackerPersonalTokenAllowed() {
    return false;
  }`);
    source = replaceOnce(source,
      'metrics[item.currency].forecast += Number(item.amount) || 0;',
      'metrics[item.currency].forecast += Number(item.remainingAmount) || 0;');
    source = source.replaceAll('Math.round(expense.amount)', 'Number(expense.amount)')
      .replaceAll('Math.round(allocation.amount)', 'Number(allocation.amount)');
    // Preserve cents in both displayed totals and editable budget cells.
    source = source.replaceAll('maximumFractionDigits: 0', 'maximumFractionDigits: 2');
    source = source.replaceAll('Все изменения сохранены', 'Изменения в этой вкладке')
      .replaceAll('All changes saved', 'Changes in this tab')
      .replaceAll('Резервная копия подготовлена', 'Рабочий файл передан на скачивание');
    source = source.replaceAll('button[type="submit"]', 'button[data-pf-submit]');
    source = source.replace('location.assign("/api/corporate/login")',
      'globalThis.PlanFactDL.networkDisabled("corporate-login")');
    // Extra pure exports are used by the standalone regression tests, not browser globals.
    source = replaceOnce(source, '      createInitialState,\n',
      '      overviewMetricsForScope,\n      overviewTotalsForScope,\n      forecastAllocationRemainingAmount,\n      __setTestState: (value) => { state = value; },\n      createInitialState,\n');
  }
  if (name === 'period-locks.js') {
    source = replaceOnce(source,
      '(ticket?.allocations || []).map((allocation) => ({ ticket, allocation })))',
      `(ticket?.allocations || []).map((allocation) => {
        const spent = (state.expenses || []).filter((expense) => expense.status !== "canceled"
          && expense.forecastTicketId === ticket.id && expense.forecastAllocationId === allocation.id)
          .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
        return {ticket, allocation: {...allocation,
          remainingAmount: Math.max(0, (Number(allocation.amount) || 0) - spent)}};
      }))`);
    source = source.replaceAll('(Number(allocation.amount) || 0)', '(Number(allocation.remainingAmount) || 0)');
    // The helper itself must subtract payments from the original allocation, exactly once.
    source = replaceOnce(source,
      'remainingAmount: Math.max(0, (Number(allocation.remainingAmount) || 0) - spent)',
      'remainingAmount: Math.max(0, (Number(allocation.amount) || 0) - spent)');
  }
  source = source.replace(/(?:globalThis\.|window\.)?\b(?:localStorage|sessionStorage)\b/g,
    'globalThis.PlanFactDL.storage');
  source = source.replace(/\bfetch\s*\(/g, 'globalThis.PlanFactDL.networkDisabled(')
    .replace(/new EventSource\s*\(/g, 'globalThis.PlanFactDL.networkDisabled(');
  if (/\bfetch\s*\(|new\s+(?:EventSource|WebSocket|XMLHttpRequest)\b|\b(?:localStorage|sessionStorage)\b|window\.(?:confirm|prompt|alert)\s*\(|createObjectURL\s*\(/.test(source)) {
    throw new Error(`Forbidden runtime dependency remains in ${name}`);
  }
  return source;
}

const safeJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
  .replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const scriptText = (source) => source.replace(/<\/script/gi, '<\\/script');

export function parseSnapshot(text) {
  const require = createRequire(import.meta.url);
  const payload = require(path.join(root, 'src', 'runtime.js')).decodeSnapshot(text);
  return {state:payload.state, view:Object.keys(payload.view || {}).length ? payload.view
    : {year:2026,quarter:4,locationId:'__all__'}};
}

export function buildHtml({state = null, view = {year: 2026, quarter: 4, locationId: '__all__'}, demo = false} = {}) {
  verifyVendor();
  const runtime = read(path.join(root, 'src', 'runtime.js'));
  const skin = fs.existsSync(path.join(root, 'src', 'datalens.css'))
    ? read(path.join(root, 'src', 'datalens.css')) : '';
  let html = read(path.join(vendor, 'index.html'));
  html = html.replaceAll('Все изменения сохранены', 'Изменения в этой вкладке');
  html = html.replace(/\s*<link\b[^>]*rel="stylesheet"[^>]*>/g, '')
    .replace(/\s*<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, '');
  const css = cssFiles.map((name) => read(path.join(vendor, name))).join('\n')
    .replace(/(?<![.\w-])form(?![\w-])/g, '[data-pf-form]');
  html = html.replace(/<form\b/g, '<div data-pf-form')
    .replace(/<\/form>/g, '</div>')
    .replace(/type="submit"/g, 'type="button" data-pf-submit="1"');
  html = html.replace('</head>', () => `<style>\n${css}\n${skin}\n</style>\n</head>`);
  const data = `<script id="planfact-state" type="application/json">${safeJson(demo && state ? {...state,_demo:true} : state)}</script>\n`
    + `<script id="planfact-view" type="application/json">${safeJson(view)}</script>\n`
    + `<script id="planfact-meta" type="application/json">${safeJson({demo,format:'plan-fact-datalens/v1'})}</script>`;
  const scripts = [runtime, ...jsFiles.map((name) => transformScript(name))]
    .map((source, index) => `<script data-planfact-source="${index ? jsFiles[index - 1] : 'runtime.js'}">\n${scriptText(source)}\n</script>`).join('\n');
  html = html.replace('</body>', () => `${data}\n${scripts}\n</body>`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>План · Факт — DataLens${demo ? ' · пример' : ''}</title>`);
  if (Buffer.byteLength(html, 'utf8') > 10 * 1024 * 1024) {
    throw new Error('HTML превышает лимит DataLens 10 МиБ. Уменьшите объём снимка.');
  }
  return html;
}

export function createDemo() {
  const require = createRequire(import.meta.url);
  const app = require(path.join(vendor, 'app.js'));
  let state = app.createInitialState();
  const change = (type, payload) => {state = app.applyLocalMutation(state, type, payload);};
  change('updateLocation', {id:'default',name:'Учебный офис Север',code:'DEMO-NORTH'});
  change('addLocation', {id:'demo-south',name:'Учебный офис Юг',code:'DEMO-SOUTH'});
  for (const project of [
    {id:'demo-office',name:'Учебный проект · содержание офиса',code:'DEMO-OFFICE'},
    {id:'demo-equipment',name:'Учебный проект · оборудование',code:'DEMO-EQUIP'},
    {id:'demo-service',name:'Учебный проект · сервисы',code:'DEMO-SERVICE'}
  ]) change('addArticle', project);
  const sub = (id) => state.articles.find((item) => item.id === id).subarticles[0].id;
  const quarterKey = '2026-Q4';
  for (const [locationId, rows] of [
    ['default', [['demo-office',120000],['demo-equipment',90000],['demo-service',60000]]],
    ['demo-south', [['demo-office',80000],['demo-equipment',50000],['demo-service',30000]]]
  ]) change('saveBudget', {locationId,quarterKey,items:rows.map(([articleId,amount]) => ({articleId,
    subarticleId:sub(articleId),currency:'RUB',amount}))});
  change('addExpense', {id:'demo-paid',locationId:'default',articleId:'demo-office',subarticleId:sub('demo-office'),
    currency:'RUB',amount:42000.25,ticketUrl:'https://example.org/DEMO-101',comment:'Вымышленный расход для проверки',
    expenseDate:'2026-10-15',author:'alice'});
  change('addForecast', {id:'demo-forecast',allocationId:'demo-allocation',locationId:'default',articleId:'demo-equipment',
    subarticleId:sub('demo-equipment'),currency:'RUB',amount:50000,ticketUrl:'https://example.org/DEMO-102',
    comment:'Вымышленная закупка с частичной оплатой',expectedDate:'2026-11-15',author:'alice'});
  change('convertForecastAllocation', {ticketId:'demo-forecast',allocationId:'demo-allocation',expenseId:'demo-partial',
    amount:20000,expenseDate:'2026-11-01',author:'alice'});
  change('addForecast', {id:'demo-forecast-2',allocationId:'demo-allocation-2',locationId:'demo-south',articleId:'demo-service',
    subarticleId:sub('demo-service'),currency:'RUB',amount:12000,ticketUrl:'https://example.org/DEMO-103',
    comment:'Вымышленный прогноз',expectedDate:'2026-12-10',author:'bob'});
  return {format:'plan-fact-datalens/v1',application:'План · Факт',demo:true,
    note:'Все названия, тикеты, участники и суммы вымышлены.',state,
    view:{year:2026,quarter:4,locationId:'__all__'}};
}

export function build(argv = process.argv.slice(2)) {
  const argument = (name) => {const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1];};
  fs.mkdirSync(path.join(root, 'dist'), {recursive:true});
  const snapshot = argument('--snapshot');
  if (snapshot) {
    const parsed = parseSnapshot(read(path.resolve(snapshot)));
    const output = path.resolve(argument('--output') || path.join(root, 'dist', 'План-факт.html'));
    fs.writeFileSync(output, buildHtml(parsed));
    console.log(`Собран ${output} (${fs.statSync(output).size} байт)`);
    return;
  }
  fs.mkdirSync(path.join(root, 'examples'), {recursive:true});
  const demoPath = path.join(root, 'examples', 'demo-state.json');
  if (!fs.existsSync(demoPath)) fs.writeFileSync(demoPath, JSON.stringify(createDemo(), null, 2) + '\n');
  const demo = parseSnapshot(read(demoPath));
  for (const [filename, options] of [['План-факт.html', {}], ['План-факт-пример.html', {...demo,demo:true}]]) {
    const output = path.join(root, 'dist', filename);
    fs.writeFileSync(output, buildHtml(options));
    console.log(`Собран ${filename} (${fs.statSync(output).size} байт)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
