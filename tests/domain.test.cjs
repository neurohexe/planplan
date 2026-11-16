const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const buildModule = import('../tools/build.mjs');

async function domain() {
  const {transformScript} = await buildModule;
  const cache = new Map();
  const values = new Map();
  const storage = {getItem:key => values.get(key) ?? null,
    setItem:(key,value) => values.set(key,String(value)),removeItem:key => values.delete(key)};
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const module = {exports:{}};
    const context = {module,console,TextDecoder,TextEncoder,URL,URLSearchParams,Blob,
      Response,DecompressionStream,ArrayBuffer,Uint8Array,DataView,structuredClone,
      crypto:crypto.webcrypto,PlanFactDL:{storage,changed(){},initialState:null},
      require:relative => load(path.basename(relative))};
    vm.runInNewContext(transformScript(name),context,{filename:name});
    cache.set(name,module.exports);
    return module.exports;
  }
  return {app:load('app.js'),locks:load('period-locks.js')};
}

async function partialPayment() {
  const {app,locks} = await domain();
  let state = app.createInitialState();
  const mutate = (type,payload) => {state = app.applyLocalMutation(state,type,payload);};
  mutate('addArticle',{id:'project',name:'Вымышленный проект',code:'DEMO'});
  const subarticleId = state.articles[0].subarticles[0].id;
  mutate('saveBudget',{locationId:'default',quarterKey:'2026-Q4',
    items:[{articleId:'project',subarticleId,currency:'RUB',amount:200}]});
  mutate('addForecast',{id:'forecast',allocationId:'allocation',locationId:'default',articleId:'project',
    subarticleId,currency:'RUB',amount:100,ticketUrl:'https://example.org/DEMO-1',expectedDate:'2026-11-20',author:'alice'});
  mutate('convertForecastAllocation',{ticketId:'forecast',allocationId:'allocation',expenseId:'payment',
    amount:40,expenseDate:'2026-11-10',author:'alice'});
  return {app,locks,state,mutate,getState:()=>state};
}

test('copied vendor files retain their original SHA256',async()=>{
  const {verifyVendor} = await buildModule;
  assert.equal(verifyVendor().files.length,13);
});

test('partial payment consumes the reserve in overview and closing totals',async()=>{
  const {app,locks,state} = await partialPayment();
  const allocation = state.forecastTickets[0].allocations[0];
  const remainingAmount = app.forecastAllocationRemainingAmount(state,'forecast',allocation);
  assert.equal(remainingAmount,60);
  assert.equal(allocation.lifecycle,'active');
  app.__setTestState(state);
  const metrics = app.overviewMetricsForScope('2026-Q4',state.articles[0],null,['default'],state.expenses,
    [{...allocation,remainingAmount}]);
  const totals = app.overviewTotalsForScope(new Map([['project',metrics]])).RUB;
  assert.equal(totals.plan,200);
  assert.equal(totals.fact,40);
  assert.equal(totals.forecast,60);
  assert.equal(totals.free,100);
  assert.equal(totals.expected,100);
  const summary = locks.periodSummary(state,'2026-Q4','quarter');
  assert.equal(summary.factByCurrency.RUB,40);
  assert.equal(summary.forecastByCurrency.RUB,60);
  const snapshot = locks.periodCloseSnapshot(state,'2026-Q4');
  assert.equal(snapshot.byLocation.default.project.RUB.free,100);
});

test('canceling a partial payment restores reserve; full payment clears reserve',async()=>{
  const {app,locks,mutate,getState} = await partialPayment();
  mutate('cancelExpense',{id:'payment',author:'alice'});
  assert.equal(app.forecastAllocationRemainingAmount(getState(),'forecast',getState().forecastTickets[0].allocations[0]),100);
  assert.equal(locks.periodSummary(getState(),'2026-Q4','quarter').forecastByCurrency.RUB,100);
  mutate('restoreExpense',{id:'payment',author:'alice'});
  mutate('convertForecastAllocation',{ticketId:'forecast',allocationId:'allocation',expenseId:'payment-2',
    amount:60,expenseDate:'2026-11-12',author:'alice'});
  assert.equal(getState().forecastTickets[0].allocations[0].lifecycle,'converted');
  assert.equal(locks.periodSummary(getState(),'2026-Q4','quarter').factByCurrency.RUB,100);
  assert.equal(locks.periodSummary(getState(),'2026-Q4','quarter').forecastByCurrency.RUB || 0,0);
});

test('closed months still prevent mutations and JSON restore remains guarded',async()=>{
  const {app,state} = await partialPayment();
  let next = app.applyLocalMutation(state,'closePeriod',{level:'month',periodKey:'2026-10',author:'alice'});
  assert.throws(()=>app.applyLocalMutation(next,'addExpense',{id:'late',locationId:'default',articleId:'project',
    currency:'RUB',amount:1,ticketUrl:'https://example.org/DEMO-2',expenseDate:'2026-10-10',author:'alice'}),/закрыт/i);
  assert.throws(()=>app.applyLocalMutation(next,'importState',{state}),/закрытые периоды/i);
});

test('snapshot reader accepts agreed CSV and legacy JSON without losing decimals',async()=>{
  const {parseSnapshot,createDemo} = await buildModule;
  const payload = createDemo();
  payload.state.expenses[0].comment = 'Кавычки "и" запятая,\nвторая строка';
  const csv = '\uFEFFplan-fact-datalens/v1\r\n"' + JSON.stringify(payload).replaceAll('"','""') + '"\r\n';
  assert.deepEqual(parseSnapshot(csv).state,payload.state);
  assert.deepEqual(parseSnapshot(JSON.stringify(payload.state)).state,payload.state);
  assert.equal(parseSnapshot(csv).state.expenses[0].amount,42000.25);
  assert.throws(()=>parseSnapshot('amount,name\n2,alice'),/Не удалось прочитать рабочий CSV или JSON/);
});

test('transformed scripts parse and have no native network, storage, dialogs, blob downloads',async()=>{
  const {transformScript} = await buildModule;
  for (const name of ['runtime-config.js','period-locks.js','budget-import.js','expense-import.js',
    'tracker-sync.js','nav-drawer.js','plan-fact-chart.js','app.js']) {
    const source = transformScript(name);
    new vm.Script(source,{filename:name});
    assert.doesNotMatch(source,/\bfetch\s*\(|new\s+(?:EventSource|WebSocket|XMLHttpRequest)\b|\b(?:localStorage|sessionStorage)\b|window\.(?:confirm|prompt|alert)\s*\(|createObjectURL\s*\(/);
  }
  const app = transformScript('app.js');
  assert.doesNotMatch(app,/Math\.round\((?:expense|allocation)\.amount\)/);
  assert.match(app,/async function confirmAction/);
  assert.match(app,/await confirmAction\(/);
});

test('assembled HTML preserves script text and has no forms or external assets',async()=>{
  const {buildHtml} = await buildModule;
  const html = buildHtml();
  assert.equal(/<form\b|<script[^>]+src=|<link[^>]+rel="stylesheet"|type="submit"/i.test(html),false,
    'No native forms, submit buttons, or external assets');
  assert.match(html,/<div data-pf-form/);
  let scripts = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type="application\/json"/.test(match[1])) { JSON.parse(match[2]); continue; }
    new vm.Script(match[2]);
    scripts++;
  }
  assert.equal(scripts,9);
  assert.equal(/Все изменения сохранены/.test(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')),false,
    'Visible markup does not promise automatic persistence');
});
