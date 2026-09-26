import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Problem extends Error { constructor(status, message) { super(message); this.status = status; } }
export const stages = { investigating: 'identified', identified: 'monitoring', monitoring: 'resolved' };
const text = (value, name, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new Problem(400, `${name} must contain ${min}–${max} characters.`);
  return value.trim();
};
export function openStore(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner TEXT NOT NULL,target REAL NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY,service_id TEXT NOT NULL REFERENCES services(id),observed_at TEXT NOT NULL,success INTEGER NOT NULL,latency_ms INTEGER NOT NULL) STRICT;
    CREATE INDEX IF NOT EXISTS samples_window ON samples(service_id,observed_at);
    CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,service_id TEXT NOT NULL REFERENCES services(id),title TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,incident_id TEXT NOT NULL REFERENCES incidents(id),status TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
    PRAGMA user_version=1;`);
  const insert = db.prepare('INSERT OR IGNORE INTO services VALUES(?,?,?,?)');
  insert.run('identity', 'Identity gateway', 'Platform', 99.5);
  insert.run('orders', 'Orders API', 'Commerce', 99);
  insert.run('web', 'Web experience', 'Frontend', 99.5);
  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function service(id) {
    if (typeof id !== 'string' || !db.prepare('SELECT id FROM services WHERE id=?').get(id)) throw new Problem(400, 'Unknown service ID.');
  }
  function getIncident(id) {
    const row = db.prepare('SELECT * FROM incidents WHERE id=?').get(id);
    if (!row) throw new Problem(404, 'Incident not found.');
    return { ...row, events: db.prepare('SELECT status,note,created_at FROM events WHERE incident_id=? ORDER BY id').all(id) };
  }
  return {
    close: () => db.close(), getIncident,
    countSamples: () => db.prepare('SELECT COUNT(*) AS count FROM samples').get().count,
    ingest(input, now = Date.now()) {
      if (!Array.isArray(input) || !input.length || input.length > 500) throw new Problem(400, 'Send 1–500 samples per batch.');
      const normalized = input.map(row => {
        if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id)) throw new Problem(400, 'Samples require stable alphanumeric IDs.');
        service(row.service_id);
        if (typeof row.observed_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(row.observed_at)) throw new Problem(400, 'Timestamps require an explicit timezone.');
        const observed = Date.parse(row.observed_at);
        if (!Number.isFinite(observed) || observed > now + 60000 || observed < now - 30 * 86400000) throw new Problem(400, 'Sample timestamp is invalid, over 30 days old, or in the future.');
        if (typeof row.success !== 'boolean' || !Number.isInteger(row.latency_ms) || row.latency_ms < 0 || row.latency_ms > 600000) throw new Problem(400, 'Use boolean success and latency_ms from 0 to 600000.');
        return { id: row.id, service_id: row.service_id, observed_at: new Date(observed).toISOString(), success: Number(row.success), latency_ms: row.latency_ms };
      });
      return tx(() => {
        let added = 0, replayed = 0;
        for (const row of normalized) {
          const existing = db.prepare('SELECT * FROM samples WHERE id=?').get(row.id);
          if (existing) {
            if (Object.keys(row).some(key => row[key] !== existing[key])) throw new Problem(409, 'Sample ID already exists with different content.');
            replayed++; continue;
          }
          db.prepare('INSERT INTO samples VALUES(?,?,?,?,?)').run(row.id, row.service_id, row.observed_at, row.success, row.latency_ms); added++;
        }
        return { added, replayed };
      });
    },
    createIncident(input) {
      if (!input || typeof input !== 'object') throw new Problem(400, 'Expected an incident object.');
      service(input.service_id);
      const title = text(input.title, 'Title', 3, 140), note = text(input.note, 'Initial update', 3, 1000);
      if (!['sev1', 'sev2', 'sev3'].includes(input.severity)) throw new Problem(400, 'Severity must be sev1, sev2 or sev3.');
      return tx(() => {
        const id = randomUUID(), now = new Date().toISOString();
        db.prepare('INSERT INTO incidents VALUES(?,?,?,?,?,1,?,?)').run(id, input.service_id, title, input.severity, 'investigating', now, now);
        db.prepare('INSERT INTO events(incident_id,status,note,created_at) VALUES(?,?,?,?)').run(id, 'investigating', note, now);
        return getIncident(id);
      });
    },
    updateIncident(id, input) {
      if (!input || !Number.isInteger(input.version)) throw new Problem(400, 'Include the current integer version.');
      const note = text(input.note, 'Update note', input.status === 'resolved' ? 10 : 3, 1000);
      return tx(() => {
        const incident = getIncident(id);
        if (incident.version !== input.version) throw new Problem(409, 'Incident changed. Refresh before updating.');
        if (!Object.hasOwn(stages, incident.status) || stages[incident.status] !== input.status) throw new Problem(422, 'Advance one stage at a time: investigating, identified, monitoring, resolved.');
        const now = new Date().toISOString();
        db.prepare('UPDATE incidents SET status=?,version=version+1,updated_at=? WHERE id=?').run(input.status, now, id);
        db.prepare('INSERT INTO events(incident_id,status,note,created_at) VALUES(?,?,?,?)').run(id, input.status, note, now);
        return getIncident(id);
      });
    },
    snapshot(hours = 24, now = Date.now()) {
      if (![1, 6, 24, 168].includes(hours)) throw new Problem(400, 'Window must be 1, 6, 24 or 168 hours.');
      const end = new Date(now).toISOString(), start = new Date(now - hours * 3600000).toISOString();
      const services = db.prepare('SELECT * FROM services ORDER BY name').all().map(row => {
        const samples = db.prepare('SELECT * FROM samples WHERE service_id=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at,id').all(row.id, start, end);
        const successful = samples.filter(s => s.success === 1), count = samples.length, failures = count - successful.length;
        const availability = count ? 100 * successful.length / count : null;
        const latency = successful.map(s => s.latency_ms).sort((a, b) => a - b);
        const allowed = count * (1 - row.target / 100);
        const latest = samples.at(-1)?.observed_at ?? null;
        const open = db.prepare("SELECT COUNT(*) AS count FROM incidents WHERE service_id=? AND status!='resolved'").get(row.id).count;
        return { ...row, samples: count, failures, availability, p95_ms: latency.length ? latency[Math.ceil(latency.length * 0.95) - 1] : null,
          budget_remaining: count ? Math.max(0, 100 * (allowed - failures) / allowed) : null,
          burn_ratio: count ? failures / allowed : null, latest, open_incidents: open,
          state: !count ? 'no-data' : now - Date.parse(latest) > 15 * 60000 ? 'stale' : open ? 'incident' : availability < row.target ? 'at-risk' : 'healthy',
          history: samples.slice(-36).map(s => ({ observed_at: s.observed_at, success: Boolean(s.success), latency_ms: s.latency_ms })) };
      });
      const incidents = db.prepare("SELECT id FROM incidents ORDER BY status='resolved',updated_at DESC LIMIT 100").all().map(i => getIncident(i.id));
      return { as_of: end, window_hours: hours, workflow: stages, services, incidents };
    },
  };
}

export function getStore() {
  globalThis.__serviceHealthStore ??= openStore(process.env.DB_PATH ?? 'data/health.db');
  return globalThis.__serviceHealthStore;
}
