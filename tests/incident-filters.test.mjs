import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIncidents } from '../lib/incident-filters.mjs';

const rows = Object.freeze([
  Object.freeze({ id: 'a', service_id: 'orders', severity: 'sev1', status: 'investigating', title: 'Checkout latency' }),
  Object.freeze({ id: 'b', service_id: 'identity', severity: 'sev1', status: 'identified', title: 'Login latency' }),
  Object.freeze({ id: 'c', service_id: 'orders', severity: 'sev2', status: 'monitoring', title: 'Checkout error rate' }),
  Object.freeze({ id: 'd', service_id: 'orders', severity: 'sev1', status: 'resolved', title: 'Checkout restored' }),
]);
const ids = filters => filterIncidents(rows, filters).map(row => row.id);

test('default shows open incidents; all and exact stages include resolved when requested', () => {
  assert.deepEqual(ids(), ['a', 'b', 'c']);
  assert.deepEqual(ids({ status: '' }), ['a', 'b', 'c', 'd']);
  for (const row of rows) assert.deepEqual(ids({ status: row.status }), [row.id]);
});
test('service, severity, status and trimmed case-insensitive title filters intersect', () => {
  assert.deepEqual(ids({ service: 'orders' }), ['a', 'c']);
  assert.deepEqual(ids({ severity: 'sev1' }), ['a', 'b']);
  assert.deepEqual(ids({ service: 'orders', severity: 'sev1', query: ' CHECKOUT ' }), ['a']);
  assert.deepEqual(ids({ service: 'orders', severity: 'sev1', status: 'resolved', query: 'restored' }), ['d']);
  assert.deepEqual(ids({ query: '   ' }), ['a', 'b', 'c']);
});
test('unmatched filters give an empty view without modifying the snapshot or its order', () => {
  assert.deepEqual(ids({ service: 'web' }), []);
  assert.deepEqual(ids({ service: 'identity', severity: 'sev2' }), []);
  assert.deepEqual(ids({ query: '[a-z]+' }), []);
  assert.deepEqual(filterIncidents([], {}), []);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c', 'd']);
});
