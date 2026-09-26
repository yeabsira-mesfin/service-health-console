import { readFile } from 'node:fs/promises';
const file = process.argv[2];
if (!file || !process.env.ADMIN_TOKEN) {
  console.error('Usage: npm run import -- samples.json (configure ADMIN_TOKEN first)');
  process.exit(2);
}
try {
  const payload = JSON.parse(await readFile(file, 'utf8'));
  const response = await fetch(new URL('/api/samples', process.env.CONSOLE_URL ?? 'http://127.0.0.1:3102'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 2; }
