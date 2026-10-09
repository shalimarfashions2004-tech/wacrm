/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles and Supabase row fixtures are intentionally structural. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbidden, unauthorized } from '@/lib/api/v1/respond';

const auth = vi.hoisted(() => ({ requireApiKey: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ requireApiKey: auth.requireApiKey }));
import { POST } from './route';

const payload = () => ({ company_name: 'SHALIMAR FASHIONS', company_fingerprint: 'a'.repeat(64), tally_release: '6.6', source_period_start: '2026-04-01', source_period_end: '2026-04-30', ledgers: [{ id: 'l1', name: 'Cash' }], vouchers: [{ id: 'v1', date: '2026-04-01', grossValuePaise: 100, lines: [{ item: 'Item', quantity: 1 }] }], stock_items: [{ id: 's1', name: 'Item' }], counts: { ledgers: 1, vouchers: 1, stock_items: 1 }, gross_value_paise: 100, payload_sha256: 'b'.repeat(64) });
function request(body: unknown, headers: Record<string, string> = {}) { return new Request('https://example.invalid/api/v1/tally/sync', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }); }
const chain = (result: unknown) => { const b: Record<string, any> = {}; for (const method of ['select', 'eq', 'insert']) b[method] = vi.fn(() => b); b.maybeSingle = vi.fn(async () => result); b.single = vi.fn(async () => result); return b; };
beforeEach(() => { vi.clearAllMocks(); auth.requireApiKey.mockResolvedValue({ accountId: 'account-1', supabase: { from: vi.fn(() => chain({ data: null, error: null })) } }); });
describe('Tally sync intake boundary', () => {
  it('rejects missing or invalid keys and wrong scopes before reading the body', async () => { auth.requireApiKey.mockRejectedValueOnce(unauthorized()); expect((await POST(request(payload()))).status).toBe(401); auth.requireApiKey.mockRejectedValueOnce(forbidden('missing')); expect((await POST(request(payload()))).status).toBe(403); });
  it('rejects oversized bodies', async () => { const response = await POST(request('x'.repeat(2 * 1024 * 1024 + 1))); expect(response.status).toBe(400); });
  it('rejects invalid fingerprint and dates before writing', async () => { const invalid = payload(); invalid.company_fingerprint = 'bad'; expect((await POST(request(invalid))).status).toBe(400); const invalidDate = { ...payload(), source_period_start: '2026-04-31' }; expect((await POST(request(invalidDate))).status).toBe(400); });
  it('returns duplicate run without child writes', async () => { const from = vi.fn(() => chain({ data: { id: 'run-1', status: 'received', received_at: 'now', counts: payload().counts }, error: null })); auth.requireApiKey.mockResolvedValue({ accountId: 'account-1', supabase: { from } }); const response = await POST(request(payload())); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ data: { run: { id: 'run-1', status: 'duplicate' }, delivery_enabled: false } }); expect(from).toHaveBeenCalledOnce(); });
  it('persists through the atomic account-scoped RPC', async () => { const rpc = vi.fn(async () => ({ data: { id: 'run-2', status: 'received', received_at: 'now', counts: payload().counts }, error: null })); const from = vi.fn(() => chain({ data: null, error: null })); auth.requireApiKey.mockResolvedValue({ accountId: 'account-9', supabase: { from, rpc } }); const response = await POST(request(payload())); expect(response.status).toBe(201); expect(rpc).toHaveBeenCalledWith('tally_sync_ingest', expect.objectContaining({ p_account_id: 'account-9' })); });
});
