import { timingSafeEqual } from 'node:crypto';
import { Problem } from './health-store.mjs';

async function readJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Problem(415, 'Use application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new Problem(400, 'JSON body required.');
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 262144) { await reader.cancel(); throw new Problem(413, 'Request exceeds 256 KB.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new Problem(400, 'Invalid JSON.'); }
}
export function handler(store, token) {
  return async request => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    try {
      const url = new URL(request.url), path = url.pathname;
      if (request.method !== 'GET') {
        if (!token || token.length < 12) throw new Problem(503, 'Configure ADMIN_TOKEN with at least 12 characters to enable writes.');
        const actual = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from(`Bearer ${token}`);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Problem(401, 'Operator token required.');
        if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) throw new Problem(403, 'Cross-origin writes are blocked.');
      }
      if (request.method === 'GET' && path === '/api/health') { store.countSamples(); return Response.json({ status: 'ok' }, { headers }); }
      if (request.method === 'GET' && ['/api/snapshot', '/api/report'].includes(path)) {
        if (path === '/api/report') headers['Content-Disposition'] = 'attachment; filename="service-report.json"';
        return Response.json(store.snapshot(Number(url.searchParams.get('hours') ?? 24)), { headers });
      }
      if (request.method === 'POST' && path === '/api/samples') return Response.json(store.ingest((await readJSON(request))?.samples), { status: 200, headers });
      if (request.method === 'POST' && path === '/api/incidents') return Response.json(store.createIncident(await readJSON(request)), { status: 201, headers });
      const match = path.match(/^\/api\/incidents\/([a-f0-9-]{36})$/);
      if (match && request.method === 'PATCH') return Response.json(store.updateIncident(match[1], await readJSON(request)), { headers });
      throw new Problem(404, 'Route not found.');
    } catch (error) {
      const status = error.status ?? 500;
      if (status === 500) console.error(error);
      return Response.json({ error: status === 500 ? 'Unexpected server error.' : error.message }, { status, headers });
    }
  };
}
