import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../lib/health-store.mjs';
import { handler } from '../lib/api-core.mjs';
const now = Date.parse('2026-09-26T12:00:00Z');
const sample = (id, extra = {}) => ({ id, service_id: 'orders', observed_at: new Date(now - 1000).toISOString(), success: true, latency_ms: 100, ...extra });
const incident = { service_id: 'orders', title: 'Probe failures', severity: 'sev2', note: 'Investigating failed probes.' };
test('calculates sample availability, nearest-rank p95 and error budget', () => {
  const store = openStore();
  try {
    store.ingest(Array.from({ length: 20 }, (_, i) => sample(`p${i}`, { latency_ms: i + 1 })), now);
    const result = store.snapshot(24, now).services.find(s => s.id === 'orders');
    assert.equal(result.availability, 100); assert.equal(result.p95_ms, 19); assert.equal(result.budget_remaining, 100);
    store.ingest([sample('failure', { success: false })], now);
    const degraded = store.snapshot(24, now).services.find(s => s.id === 'orders');
    assert.equal(degraded.failures, 1); assert.equal(degraded.budget_remaining, 0); assert.ok(degraded.burn_ratio > 1);
  } finally { store.close(); }
});
test('empty and stale telemetry do not masquerade as healthy', () => {
  const store = openStore();
  try {
    assert.equal(store.snapshot(24, now).services[0].availability, null);
    assert.equal(store.snapshot(24, now).services[0].state, 'no-data');
    store.ingest([sample('old', { observed_at: new Date(now - 20 * 60000).toISOString() })], now);
    assert.equal(store.snapshot(24, now).services.find(s => s.id === 'orders').state, 'stale');
  } finally { store.close(); }
});
test('window boundaries exclude out-of-window probes', () => {
  const store = openStore();
  try {
    store.ingest([sample('recent'), sample('older', { observed_at: new Date(now - 2 * 3600000).toISOString(), success: false })], now);
    assert.equal(store.snapshot(1, now).services.find(s => s.id === 'orders').samples, 1);
    assert.equal(store.snapshot(6, now).services.find(s => s.id === 'orders').samples, 2);
  } finally { store.close(); }
});
test('ingestion replays IDs and rolls back a conflicting batch', () => {
  const store = openStore();
  try {
    store.ingest([sample('one')], now);
    assert.deepEqual(store.ingest([sample('one')], now), { added: 0, replayed: 1 });
    assert.throws(() => store.ingest([sample('two'), sample('one', { success: false })], now), { status: 409 });
    assert.equal(store.countSamples(), 1);
  } finally { store.close(); }
});
test('rejects invalid samples before storing any of the batch', () => {
  const store = openStore();
  try {
    for (const extra of [{ success: 'true' }, { latency_ms: -1 }, { service_id: 'missing' }, { observed_at: '2026-09-26T12:00:00' }, { observed_at: new Date(now + 120000).toISOString() }])
      assert.throws(() => store.ingest([sample('one'), sample('bad', extra)], now), { status: 400 });
    assert.equal(store.countSamples(), 0);
  } finally { store.close(); }
});
test('incidents require ordered, versioned, documented transitions', () => {
  const store = openStore();
  try {
    const row = store.createIncident(incident);
    assert.throws(() => store.updateIncident(row.id, { status: 'resolved', version: 1, note: 'Cannot skip validation.' }), { status: 422 });
    store.updateIncident(row.id, { status: 'identified', version: 1, note: 'Connection pool is exhausted.' });
    assert.throws(() => store.updateIncident(row.id, { status: 'monitoring', version: 1, note: 'Stale update.' }), { status: 409 });
    store.updateIncident(row.id, { status: 'monitoring', version: 2, note: 'Pool limits adjusted.' });
    const done = store.updateIncident(row.id, { status: 'resolved', version: 3, note: 'Recovery verified through successful probes.' });
    assert.equal(done.events.length, 4); assert.equal(done.status, 'resolved');
  } finally { store.close(); }
});
test('API protects mutations and rejects invalid JSON and origins', async () => {
  const store = openStore(), run = handler(store, 'local-test-token');
  try {
    const request = (headers, body = JSON.stringify(incident)) => new Request('http://localhost/api/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
    assert.equal((await run(request({}))).status, 401);
    assert.equal((await run(request({ Authorization: 'Bearer local-test-token', Origin: 'https://other.example' }))).status, 403);
    assert.equal((await run(request({ Authorization: 'Bearer local-test-token' }, '{'))).status, 400);
    assert.equal((await run(request({ Authorization: 'Bearer local-test-token' }))).status, 201);
    assert.equal((await handler(store, undefined)(request({}))).status, 503);
    assert.equal((await run(new Request('http://localhost/api/snapshot?hours=3'))).status, 400);
  } finally { store.close(); }
});
test('probe and incident data survive reopening the database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'health-')), file = join(directory, 'data.db');
  const first = openStore(file); first.ingest([sample('durable')], now); const row = first.createIncident(incident); first.close();
  const second = openStore(file);
  try { assert.equal(second.countSamples(), 1); assert.equal(second.getIncident(row.id).events.length, 1); }
  finally { second.close(); rmSync(directory, { recursive: true }); }
});
