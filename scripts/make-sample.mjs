// Generates synthetic fixtures, never probes actual services.
import { randomUUID } from 'node:crypto';
console.log(JSON.stringify({ samples: ['identity', 'orders', 'web'].map(service_id => ({
  id: randomUUID(), service_id, observed_at: new Date().toISOString(), success: true, latency_ms: 120,
})) }, null, 2));
