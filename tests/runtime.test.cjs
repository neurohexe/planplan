'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {encodeSnapshot, decodeSnapshot, snapshotPayload} = require('../src/runtime.js');

function example() {
  return {
    application: 'План · Факт',
    format: 'plan-fact-datalens/v1',
    exportedAt: '2026-11-10T09:00:00.000Z',
    state: {
      schemaVersion: 1,
      locations: [{id: 'default', name: 'Офис «А», Ташкент'}],
      articles: [{id: 'office', name: 'Аренда; "офис"'}],
      budgets: {'default|2026-Q4': {office: {RUB: 150000}}},
      expenses: [{id: 'qa', amount: 1234.56, comment: 'Первая строка\nВторая строка\r\n=SUM(1;2)'}],
      forecastTickets: [],
      comments: [],
    },
    view: {year: 2026, quarter: 4, locationId: 'default'},
  };
}

test('snapshot CSV has a versioned first row and preserves Unicode, quotes, newlines and amounts', () => {
  const source = example();
  const csv = encodeSnapshot(source);
  assert.ok(csv.startsWith('\uFEFFplan-fact-datalens/v1\r\n"'));
  assert.ok(csv.endsWith('"\r\n'));
  assert.deepEqual(decodeSnapshot(csv), source);
  assert.equal(source.state.expenses[0].amount, 1234.56);
});

test('CSV round-trip preserves a full empty state and view without inventing records', () => {
  const source = example();
  source.state = {locations: [], articles: [], budgets: {}, expenses: [], forecastTickets: [], comments: []};
  assert.deepEqual(decodeSnapshot(encodeSnapshot(source)), source);
});

test('unsupported or malformed CSV is rejected instead of being treated as a usable snapshot', () => {
  const malformed = [
    '',
    'name,amount\r\nOffice,100\r\n',
    '\uFEFFplan-fact-datalens/v2\r\n"{}"\r\n',
    '\uFEFFplan-fact-datalens/v1\r\n"{broken json}"\r\n',
    '\uFEFFplan-fact-datalens/v1\r\n"unterminated',
  ];
  for (const input of malformed) assert.throws(() => decodeSnapshot(input), `Accepted malformed CSV: ${input}`);
});

test('payload names its application and format and keeps state and selected view', () => {
  const source = example();
  const payload = snapshotPayload(source.state, source.view);
  assert.equal(payload.application, source.application);
  assert.equal(payload.format, source.format);
  assert.ok(Number.isFinite(Date.parse(payload.exportedAt)));
  assert.deepEqual(payload.state, source.state);
  assert.deepEqual(payload.view, source.view);
});
