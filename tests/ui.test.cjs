'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole, ResourceLoader} = require(process.env.PLANFACT_JSDOM || '/tmp/datalens-planfact-qa/node_modules/jsdom');

const ROOT = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 35));

async function until(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(message);
}

async function openPage(filename, t) {
  const errors = [];
  const cssLimitations = [];
  const forbidden = [];
  const messages = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (error.type === 'css parsing') cssLimitations.push(error.message);
    else errors.push(error.stack || String(error));
  });
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const deny = name => function deniedCapability() {
    forbidden.push(name);
    throw new Error(`Forbidden in DataLens HTML page: ${name}`);
  };
  class NoNetwork extends ResourceLoader {
    fetch(url) {
      forbidden.push(`resource:${url}`);
      return Promise.reject(new Error('External resources are disabled'));
    }
  }
  const html = fs.readFileSync(path.join(ROOT, 'dist', filename), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://datalens-test.invalid/page',
    runScripts: 'dangerously',
    resources: new NoNetwork(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) {
        Object.defineProperty(window, name, {configurable: true, get: deny(name)});
      }
      for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'confirm', 'prompt', 'alert']) {
        window[name] = deny(name);
      }
      window.navigator.sendBeacon = deny('sendBeacon');
      window.URL.createObjectURL = deny('createObjectURL');
      window.matchMedia = query => ({matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}});
      window.ResizeObserver = class {observe() {} unobserve() {} disconnect() {}};
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.SVGElement.prototype.getBBox = () => ({x: 0, y: 0, width: 100, height: 20});
      window.SVGElement.prototype.getComputedTextLength = () => 100;
      window.HTMLDialogElement.prototype.showModal = function () {this.setAttribute('open', '');};
      window.HTMLDialogElement.prototype.close = function (value) {
        if (value !== undefined) this.returnValue = String(value);
        this.removeAttribute('open');
        this.dispatchEvent(new window.Event('close'));
      };
      if (!window.Blob.prototype.text) window.Blob.prototype.text = function () {
        return new Promise((resolve, reject) => {
          const reader = new window.FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(this);
        });
      };
      if (!window.Blob.prototype.arrayBuffer) window.Blob.prototype.arrayBuffer = function () {
        return new Promise((resolve, reject) => {
          const reader = new window.FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
      if (!window.Blob.prototype.stream) window.Blob.prototype.stream = function () {
        const blob = this;
        return new ReadableStream({async start(controller) {
          try {controller.enqueue(new Uint8Array(await blob.arrayBuffer())); controller.close();}
          catch (error) {controller.error(error);}
        }});
      };
      window.Response = Response;
      window.TextDecoder = TextDecoder;
      window.TextEncoder = TextEncoder;
      window.DecompressionStream = DecompressionStream;
      const NativeDate = window.Date;
      window.Date = class extends NativeDate {
        constructor(...args) {super(...(args.length ? args : ['2026-11-10T09:00:00.000Z']));}
        static now() {return NativeDate.parse('2026-11-10T09:00:00.000Z');}
      };
      Object.defineProperty(window, 'parent', {value: {postMessage(message, origin) {messages.push({message: clone(message), origin});}}});
      window.addEventListener('error', event => errors.push(event.error?.stack || event.message));
      window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    },
  });
  t.after(() => {
    dom.window.close();
    assert.deepEqual(forbidden, [], 'Application attempted a sandbox-forbidden capability');
    assert.deepEqual(errors, [], 'Application emitted JavaScript errors');
    if (cssLimitations.length) t.diagnostic('JSDOM does not parse the complete modern CSS; this test verifies DOM behaviour, not browser layout.');
  });
  const w = dom.window;
  await until(() => w.PlanFactDL?.getState?.()?.locations && w.document.getElementById('pf-dl-save'), 'Application did not finish rendering');
  await tick();
  const byId = id => {
    const element = w.document.getElementById(id);
    assert.ok(element, `Missing #${id}`);
    return element;
  };
  const click = async selector => {
    const element = w.document.querySelector(selector);
    assert.ok(element, `Missing ${selector}`);
    assert.equal(element.disabled, false, `Disabled ${selector}`);
    element.click();
    await tick();
  };
  const set = async (id, value, event = 'change') => {
    const element = byId(id);
    element.value = value;
    element.dispatchEvent(new w.Event(event, {bubbles: true}));
    await tick();
  };
  const state = () => clone(w.PlanFactDL.getState());
  const answer = async yes => {
    await until(() => w.document.getElementById('pf-dl-question')?.open, 'Expected a custom confirmation dialog');
    await click(`#pf-dl-question-${yes ? 'yes' : 'no'}`);
  };
  const restore = async (csv, yes = true) => {
    const result = w.PlanFactDL.restoreSnapshot(csv);
    await answer(yes);
    await result;
    await tick();
  };
  return {w, byId, click, set, state, answer, restore, messages, errors, forbidden};
}

function fixture(base) {
  return {
    ...base,
    revision: 0,
    locations: [
      {id: 'qa-office', name: 'QA Office', code: 'QA', archived: false},
      {id: 'qa-other', name: 'QA Other Office', code: 'QA-OTHER', archived: false},
    ],
    articles: [
      {id: 'qa-rent', name: 'QA Rent', code: 'QA-RENT', budgetType: 'opex', imported: false, archived: false, subarticles: []},
      {id: 'qa-equipment', name: 'QA Equipment', code: 'QA-EQ', budgetType: 'capex', imported: false, archived: false, subarticles: []},
    ],
    budgets: {'qa-office|2026-Q4': {'qa-rent': {RUB: 100000}, 'qa-equipment': {RUB: 50000}}},
    monthlyBudgets: {}, responsibleGroups: {}, projectAttributes: {},
    expenses: [], forecastTickets: [], comments: [], imports: [], expenseImports: [],
    closedPeriods: {months: {}, quarters: {}}, periodCloseHistory: [],
  };
}

async function installFixture(page) {
  const payload = page.w.PlanFactDL.snapshotPayload(fixture(page.state()), {year: 2026, quarter: 4, locationId: 'qa-office'});
  await page.restore(page.w.PlanFactDL.encodeSnapshot(payload));
  await page.click('[data-location-id="qa-office"]');
  await page.set('year-select', '2026');
  await page.set('quarter-select', '4');
}

async function addEntry(page, kind, {amount, ticket, article = 'qa-rent', comment = '', enter = false}) {
  await page.click(`#add-${kind}-btn`);
  assert.equal(page.byId(`${kind}-dialog`).open, true);
  await page.set(`${kind}-article`, article);
  await page.set(`${kind}-date`, '2026-11-10');
  await page.set(`${kind}-currency`, 'RUB');
  await page.set(`${kind}-amount`, String(amount), 'input');
  await page.set(`${kind}-ticket`, `https://tracker.example.test/${ticket}`, 'input');
  await page.set(`${kind}-comment`, comment, 'input');
  if (enter) {
    page.byId(`${kind}-amount`).dispatchEvent(new page.w.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
    await tick();
  } else await page.click(`#${kind}-form [data-pf-submit]`);
  await until(() => !page.byId(`${kind}-dialog`).open, `${kind} did not save: ${page.byId(`${kind}-form-error`).textContent}`);
}

for (const filename of ['План-факт.html', 'План-факт-пример.html']) {
  test(`${filename}: all pages render with sandbox APIs disabled and fixture distinction is preserved`, async t => {
    const page = await openPage(filename, t);
    assert.equal(page.w.document.querySelectorAll('form').length, 0, 'Native forms need allow-forms, which DataLens does not grant');
    const initial = page.state();
    if (filename.includes('пример')) {
      assert.ok(initial.articles.length > 0, 'Example must contain demonstrative project data');
      assert.match(page.byId('summary-fact').textContent.replace(/\s/g, ''), /62000,25/, 'Visible totals must preserve cents');
      assert.match(page.byId('pf-dl-toolbar').textContent, /вымышленные данные/, 'Demo must be clearly labeled');
    }
    else assert.equal(initial.expenses.length, 0, 'Clean starter must not contain real or demo expenses');
    for (const name of ['overview', 'expenses', 'forecast', 'budget', 'data']) {
      await page.click(`.main-nav [data-page="${name}"]`);
      assert.ok(page.byId(`page-${name}`).classList.contains('is-active'));
      assert.equal(page.w.document.querySelectorAll('.page.is-active').length, 1);
    }
    await page.click('#pf-dl-save');
    const sent = page.messages.at(-1);
    assert.equal(sent.message.code, 'EXPORT');
    assert.equal(sent.message.data.mime, 'text/csv');
    assert.ok(sent.message.data.name.endsWith('.csv'));
    assert.deepEqual(clone(page.w.PlanFactDL.decodeSnapshot(sent.message.data.data).state), initial);
  });

  test(`${filename}: expenses and forecasts update totals, filter correctly, and cancel stays unchanged`, async t => {
    const page = await openPage(filename, t);
    await installFixture(page);
    await page.click('#add-expense-btn');
    const beforeInvalid = page.state();
    await page.click('#expense-form [data-pf-submit]');
    assert.deepEqual(page.state(), beforeInvalid, 'Missing required fields must not create an expense');
    assert.equal(page.byId('expense-dialog').open, true);
    await page.click('#cancel-expense-modal');

    await addEntry(page, 'expense', {amount: 1250, ticket: 'QA-1001', comment: 'Needle Alpha'});
    await addEntry(page, 'expense', {amount: 2750, ticket: 'QA-1002', article: 'qa-equipment', comment: 'Needle Beta', enter: true});
    assert.equal(page.state().expenses.length, 2);
    assert.equal(page.state().expenses.reduce((sum, item) => sum + item.amount, 0), 4000);
    assert.equal(page.byId('expenses-table-body').querySelectorAll('[data-expense-id]').length, 2);
    await page.set('expense-search', 'Needle Alpha', 'input');
    assert.match(page.byId('expenses-table-body').textContent, /Needle Alpha/);
    assert.doesNotMatch(page.byId('expenses-table-body').textContent, /Needle Beta/);
    await page.set('expense-search', '', 'input');
    await page.set('expense-article-filter', 'qa-equipment');
    assert.match(page.byId('expenses-table-body').textContent, /Needle Beta/);
    assert.doesNotMatch(page.byId('expenses-table-body').textContent, /Needle Alpha/);
    await page.set('expense-article-filter', 'all');

    const beforeCancel = page.state();
    await page.click('#expenses-table-body [data-action="cancel"]');
    assert.deepEqual(page.state(), beforeCancel, 'Confirmation must not mutate state before user decision');
    await page.answer(false);
    assert.deepEqual(page.state(), beforeCancel, 'Canceling confirmation must preserve state');
    await page.click('#expenses-table-body [data-action="cancel"]');
    await page.answer(true);
    assert.equal(page.state().expenses.filter(item => item.status === 'canceled').length, 1);

    await page.click('.main-nav [data-page="forecast"]');
    await addEntry(page, 'forecast', {amount: 7000, ticket: 'QA-2001', comment: 'Reserve Alpha'});
    assert.equal(page.state().forecastTickets.length, 1);
    assert.equal(page.state().forecastTickets[0].allocations[0].amount, 7000);
    assert.match(page.byId('forecast-table-body').textContent, /QA-2001/);
    await page.set('forecast-search', 'nothing-matches-qa', 'input');
    assert.doesNotMatch(page.byId('forecast-table-body').textContent, /QA-2001/);
    await page.set('forecast-search', '', 'input');
    assert.match(page.byId('forecast-table-body').textContent, /QA-2001/);

    const beforeRelease = page.state();
    await page.click('#forecast-table-body [data-forecast-action="release"]');
    await page.answer(false);
    assert.deepEqual(page.state(), beforeRelease, 'Canceling prompt must preserve forecast reservation');

    await page.click('.main-nav [data-page="overview"]');
    assert.match(page.byId('summary-plan').textContent.replace(/\s/g, ''), /150000/);
    assert.match(page.byId('summary-forecast').textContent.replace(/\s/g, ''), /7000/);
    const remainingActual = page.state().expenses.filter(item => item.status !== 'canceled').reduce((sum, item) => sum + item.amount, 0);
    assert.ok(page.byId('summary-fact').textContent.replace(/\s/g, '').includes(String(remainingActual)));
    assert.ok(page.byId('summary-balance').textContent.replace(/\s/g, '').includes(String(150000 - remainingActual - 7000)));

    await page.click('.main-nav [data-page="forecast"]');
    await page.click('#forecast-table-body [data-forecast-action="convert"]');
    await page.set('expense-date', '2026-11-10');
    await page.set('expense-amount', '2000', 'input');
    await page.click('#expense-form [data-pf-submit]');
    await until(() => !page.byId('expense-dialog').open, `Forecast payment failed: ${page.byId('expense-form-error').textContent}`);
    assert.ok(page.state().expenses.some(item => item.amount === 2000 && item.forecastTicketId), 'Payment must remain linked to its forecast');
    await page.click('.main-nav [data-page="overview"]');
    assert.match(page.byId('summary-forecast').textContent.replace(/\s/g, ''), /5000/);
    assert.ok(page.byId('summary-fact').textContent.replace(/\s/g, '').includes(String(remainingActual + 2000)));
    assert.ok(page.byId('summary-balance').textContent.replace(/\s/g, '').includes(String(150000 - remainingActual - 7000)), 'Partial payment must reduce the reserve instead of being counted twice');
  });

  test(`${filename}: snapshot export and file restore keep financial state; rejected restore keeps edits`, async t => {
    const page = await openPage(filename, t);
    await installFixture(page);
    await addEntry(page, 'expense', {amount: 1234, ticket: 'QA-3001', comment: 'CSV "quotes", commas; перенос\nстроки'});
    const expected = page.state();
    await page.click('#pf-dl-save');
    const exported = page.messages.at(-1).message;
    assert.equal(exported.code, 'EXPORT');
    assert.equal(exported.data.mime, 'text/csv');
    assert.deepEqual(clone(page.w.PlanFactDL.decodeSnapshot(exported.data.data).state), expected);

    await addEntry(page, 'expense', {amount: 4321, ticket: 'QA-3002', comment: 'Unsaved newer edit'});
    const newer = page.state();
    await page.restore(exported.data.data, false);
    assert.deepEqual(page.state(), newer);
    await page.set('quarter-select', '1');
    await page.click('[data-location-id="__all__"]');

    const input = page.byId('pf-dl-file');
    const file = new page.w.File([exported.data.data], 'snapshot.csv', {type: 'text/csv'});
    Object.defineProperty(input, 'files', {configurable: true, value: [file]});
    input.dispatchEvent(new page.w.Event('change', {bubbles: true}));
    await page.answer(true);
    await until(() => page.state().expenses.length === expected.expenses.length, 'File restore did not replace the newer state');
    const restored = page.state();
    assert.deepEqual({...restored, expenses: expected.expenses, revision: expected.revision}, expected);
    assert.equal(restored.expenses.length, expected.expenses.length);
    for (let i = 0; i < restored.expenses.length; i++) {
      const original = expected.expenses[i];
      for (const [key, value] of Object.entries(original)) assert.deepEqual(restored.expenses[i][key], value, `Restored expense field ${key}`);
      for (const [key, value] of Object.entries(restored.expenses[i])) {
        if (!(key in original)) assert.ok(value === null || (key === 'sourceTaxRatePercent' && value === 0), `Unexpected new financial value ${key}`);
      }
    }
    assert.ok(page.state().revision > newer.revision, 'Restore must keep the mutation revision monotonic');
    assert.equal(page.byId('quarter-select').value, '4', 'Restore must recover the selected reporting period');
    assert.equal(page.byId('year-select').value, '2026');
    assert.ok(page.w.document.querySelector('[data-location-id="qa-office"].is-active'), 'Restore must recover the selected office');
    assert.match(page.byId('expenses-table-body').textContent, /QA-3001/);
    assert.doesNotMatch(page.byId('expenses-table-body').textContent, /QA-3002/);
    await page.click('.main-nav [data-page="data"]');
    await page.click('#export-json-btn');
    assert.equal(page.messages.at(-1).message.data.mime, 'text/csv', 'Legacy backup button must use a supported MIME');
  });
}

test('XLSX budget and request imports preserve monthly plans and create forecasts via the visible workflow', async t => {
  const page = await openPage('План-факт.html', t);
  async function chooseFile(id, name) {
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', name));
    const file = new page.w.File([bytes], name, {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const input = page.byId(id);
    Object.defineProperty(input, 'files', {configurable: true, value: [file]});
    input.dispatchEvent(new page.w.Event('change', {bubbles: true}));
    await tick();
  }
  await page.click('.main-nav [data-page="budget"]');
  await page.click('#open-excel-import-btn');
  await chooseFile('import-excel-input', 'budget.xlsx');
  await until(() => !page.byId('excel-import-period').disabled || page.byId('excel-import-status').classList.contains('is-error'), 'XLSX workbook did not finish loading');
  assert.equal(page.byId('excel-import-status').classList.contains('is-error'), false, page.byId('excel-import-status').textContent);
  await page.set('excel-import-period', '2026-Q1');
  await until(() => !page.byId('apply-excel-import-btn').disabled || page.byId('excel-import-status').classList.contains('is-error'), 'Budget preview did not finish');
  assert.equal(page.byId('excel-import-status').classList.contains('is-error'), false, page.byId('excel-import-status').textContent);
  assert.equal(page.byId('excel-import-preview-body').querySelectorAll('tr').length, 2);
  await page.click('#apply-excel-import-btn');
  await until(() => !page.byId('excel-import-dialog').open, 'Budget was not applied');
  const imported = page.state();
  const sums = Object.values(imported.budgets).flatMap(Object.values).reduce((result, currencies) => {
    for (const [currency, amount] of Object.entries(currencies)) result[currency] = (result[currency] || 0) + amount;
    return result;
  }, {});
  assert.deepEqual(sums, {USD: 100, UZS: 900000});
  assert.equal(imported.articles.length, 2);
  assert.equal(page.byId('quarter-select').value, '1');
  assert.equal(page.byId('year-select').value, '2026');

  await page.click('.main-nav [data-page="expenses"]');
  await page.click('#open-expense-import-btn');
  await chooseFile('expense-import-input', 'requests.xlsx');
  await until(() => !page.byId('apply-expense-import-btn').disabled || page.byId('expense-import-status').classList.contains('is-error'), 'Request preview did not finish');
  assert.equal(page.byId('expense-import-status').classList.contains('is-error'), false, page.byId('expense-import-status').textContent);
  await page.click('#apply-expense-import-btn');
  await until(() => page.state().forecastTickets.length === 2, 'Request import did not create two forecast tickets');
  assert.equal(page.state().expenses.length, 0, 'Imported requests must not become paid expenses without confirmation');
  const allocations = page.state().forecastTickets.flatMap(ticket => ticket.allocations);
  assert.deepEqual(allocations.map(item => item.amount).sort((a, b) => a - b), [20, 50]);
  assert.deepEqual(allocations.map(item => item.lifecycle).sort(), ['active', 'review']);
  assert.ok(allocations.every(item => item.currency === 'USD' && item.quarterKey === '2026-Q1'));
  assert.ok(page.byId('page-forecast').classList.contains('is-active'));
  assert.match(page.byId('forecast-table-body').textContent, /TEST-R1/);
  assert.match(page.byId('forecast-table-body').textContent, /TEST-R2/);
});
