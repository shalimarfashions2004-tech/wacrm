import { badRequest, ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';

const MAX_BODY = 2 * 1024 * 1024;
const MAX_ROWS = 50_000;
const HEX64 = /^[a-f0-9]{64}$/;
type Row = Record<string, unknown>;

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function textValue(value: unknown, max = 200): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;
}
function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : undefined;
}
function money(value: unknown): number | undefined { return integer(value, -99_999_999_999_999_999, 99_999_999_999_999_999); }
function quantity(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15 ? value : undefined; }

function validate(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'JSON body must be an object';
  const p = payload as Row;
  for (const key of ['company_name', 'tally_release']) if (!textValue(p[key], key === 'company_name' ? 200 : 100)) return `Invalid ${key}`;
  for (const key of ['company_fingerprint', 'payload_sha256']) if (typeof p[key] !== 'string' || !HEX64.test(p[key])) return `Invalid ${key}`;
  if (!validDate(p.source_period_start) || !validDate(p.source_period_end) || p.source_period_start > p.source_period_end) return 'Invalid source period';
  const arrays = ['ledgers', 'vouchers', 'stock_items'] as const;
  for (const key of arrays) if (!Array.isArray(p[key]) || p[key].length > MAX_ROWS) return `Invalid ${key}`;
  const counts = p.counts as Row;
  if (!counts || typeof counts !== 'object' || arrays.some((k) => counts[k] !== (p[k] as unknown[]).length)) return 'Counts do not match rows';
  if (money(p.gross_value_paise) === undefined) return 'Invalid gross value';
  for (const row of p.ledgers as Row[]) if (!textValue(row.id) || !textValue(row.name) || (row.phone !== undefined && textValue(row.phone) === undefined) || (row.address !== undefined && textValue(row.address, 1000) === undefined)) return 'Invalid ledger row';
  for (const row of p.vouchers as Row[]) {
    if (!textValue(row.id) || !validDate(row.date) || money(row.grossValuePaise) === undefined || (row.number !== undefined && textValue(row.number) === undefined) || (row.party !== undefined && textValue(row.party) === undefined)) return 'Invalid voucher row';
    if (!Array.isArray(row.lines) || row.lines.length > 1000) return 'Invalid voucher lines';
    for (const line of row.lines as Row[]) if ((line.item !== undefined && textValue(line.item) === undefined) || (line.quantity !== undefined && quantity(line.quantity) === undefined) || (line.ratePaise !== undefined && money(line.ratePaise) === undefined) || (line.valuePaise !== undefined && money(line.valuePaise) === undefined)) return 'Invalid voucher line';
  }
  for (const row of p.stock_items as Row[]) if (!textValue(row.id) || !textValue(row.name) || (row.group !== undefined && textValue(row.group) === undefined) || (row.unit !== undefined && textValue(row.unit) === undefined) || (row.quantity !== undefined && quantity(row.quantity) === undefined) || (row.ratePaise !== undefined && money(row.ratePaise) === undefined) || (row.valuePaise !== undefined && money(row.valuePaise) === undefined)) return 'Invalid stock row';
  return null;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'tally:sync');
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY) throw badRequest('Request body exceeds 2 MB');
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY) throw badRequest('Request body exceeds 2 MB');
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { throw badRequest('Request body must be valid JSON'); }
    const error = validate(payload);
    if (error) throw badRequest(error);
    const p = payload as Row;
    const existing = await ctx.supabase.from('tally_sync_runs').select('id,status,received_at,counts').eq('account_id', ctx.accountId).eq('payload_sha256', p.payload_sha256).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return ok({ run: { ...existing.data, status: 'duplicate' }, delivery_enabled: false });
    const runInsert = await ctx.supabase.from('tally_sync_runs').insert({ account_id: ctx.accountId, payload_sha256: p.payload_sha256, company_name: p.company_name, company_fingerprint: p.company_fingerprint, tally_release: p.tally_release, source_period_start: p.source_period_start, source_period_end: p.source_period_end, counts: p.counts, gross_value_paise: p.gross_value_paise }).select('id,status,received_at,counts').single();
    if (runInsert.error || !runInsert.data) throw runInsert.error ?? new Error('Run insert failed');
    const runId = runInsert.data.id;
    const ledgers = (p.ledgers as Row[]).map((r) => ({ run_id: runId, account_id: ctx.accountId, source_id: r.id, name: r.name, phone: r.phone, address: r.address }));
    const vouchers = (p.vouchers as Row[]).map((r) => ({ run_id: runId, account_id: ctx.accountId, source_id: r.id, voucher_number: r.number, voucher_date: r.date, party: r.party, gross_value_paise: r.grossValuePaise }));
    if (ledgers.length) { const result = await ctx.supabase.from('tally_sync_ledgers').insert(ledgers); if (result.error) throw result.error; }
    const voucherIds: Record<string, string> = {};
    for (const row of vouchers) {
      const result = await ctx.supabase.from('tally_sync_vouchers').insert(row).select('id').single();
      if (result.error || !result.data) throw result.error ?? new Error('Voucher insert failed');
      voucherIds[String(row.source_id)] = result.data.id;
    }
    const lines = (p.vouchers as Row[]).flatMap((voucher) => (voucher.lines as Row[]).map((line, index) => ({ voucher_id: voucherIds[String(voucher.id)], run_id: runId, account_id: ctx.accountId, line_no: index + 1, item: line.item, quantity: line.quantity, rate_paise: line.ratePaise, value_paise: line.valuePaise })));
    if (lines.length) { const result = await ctx.supabase.from('tally_sync_voucher_lines').insert(lines); if (result.error) throw result.error; }
    const stocks = (p.stock_items as Row[]).map((r) => ({ run_id: runId, account_id: ctx.accountId, source_id: r.id, name: r.name, item_group: r.group, unit: r.unit, quantity: r.quantity, rate_paise: r.ratePaise, value_paise: r.valuePaise }));
    if (stocks.length) { const result = await ctx.supabase.from('tally_sync_stock_items').insert(stocks); if (result.error) throw result.error; }
    return ok({ run: runInsert.data, delivery_enabled: false }, 201);
  } catch (error) { return toApiErrorResponse(error); }
}
