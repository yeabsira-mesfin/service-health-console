import { openStore } from '../lib/health-store.mjs';
const store = openStore(process.env.DB_PATH ?? 'data/health.db');
if (store.countSamples() === 0) {
  const now = Date.now();
  const samples = ['identity', 'orders', 'web'].flatMap((service, serviceIndex) => Array.from({ length: 72 }, (_, i) => ({
    id: `demo-${service}-${i}`, service_id: service,
    observed_at: new Date(now - (71 - i) * 5 * 60000).toISOString(),
    success: !(service === 'orders' && i >= 66 && i <= 68), latency_ms: 80 + serviceIndex * 35 + (i * 17) % 90,
  })));
  store.ingest(samples, now);
  store.createIncident({ service_id: 'orders', severity: 'sev2', title: 'Synthetic: intermittent checkout probe failures', note: 'Demo incident. Three synthetic probes failed; investigate connection pool saturation.' });
  console.log('Seeded 216 synthetic probes and one demo incident. Existing databases are never overwritten.');
} else console.log('Database already contains probes; seed skipped.');
store.close();
