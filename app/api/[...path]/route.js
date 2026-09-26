import { getStore } from '../../../lib/health-store.mjs';
import { handler } from '../../../lib/api-core.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const dispatch = request => handler(getStore(), process.env.ADMIN_TOKEN)(request);
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
