import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import assert from 'node:assert/strict';

const directory = mkdtempSync(join(tmpdir(), 'health-smoke-'));
const port = process.env.SMOKE_PORT ?? '3199';
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, DB_PATH: join(directory, 'test.db'), ADMIN_TOKEN: 'ephemeral-smoke-token', NEXT_TELEMETRY_DISABLED: '1' };
const seeded = spawnSync(process.execPath, ['scripts/seed.mjs'], { env, encoding: 'utf8' });
assert.equal(seeded.status, 0, seeded.stderr);
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* await startup */ }
    if (ready) break;
    await setTimeout(100);
  }
  assert.ok(ready, logs);
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /Service Health Console/);
  const snapshot = await (await fetch(`${base}/api/snapshot`)).json();
  assert.equal(snapshot.services.reduce((sum, s) => sum + s.samples, 0), 216);
  assert.equal(snapshot.incidents.length, 1);
  const input = join(directory, 'batch.json');
  writeFileSync(input, JSON.stringify({ samples: [{ id: 'smoke-probe', service_id: 'web', observed_at: new Date().toISOString(), success: true, latency_ms: 123 }] }));
  for (const expected of [{ added: 1, replayed: 0 }, { added: 0, replayed: 1 }]) {
    const result = spawnSync(process.execPath, ['scripts/import.mjs', input], { env: { ...env, CONSOLE_URL: base }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), expected);
  }
  const unauthorized = await fetch(`${base}/api/incidents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthorized.status, 401);
  console.log('Production smoke passed: HTML, health, 216 probes, incident seed, importer replay, and write authorization.');
} finally {
  if (child.exitCode === null) {
    const closed = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await closed;
  }
  rmSync(directory, { recursive: true, force: true });
}
