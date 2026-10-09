import type { Period, SalesControls } from './config';

const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function parseCount(value: string): number {
  const raw = value.trim();
  if (!/^\d{1,5}$/.test(raw)) throw new Error('Invalid Tally Sales Register voucher count');
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count > 50_000) throw new Error('Invalid Tally Sales Register voucher count');
  return count;
}

function parseRupees(value: string): number {
  const raw = value.trim().replaceAll('₹', '').replaceAll(',', '').replace(/\s+/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Invalid Tally Sales Register gross amount');
  const [whole, fraction = ''] = raw.split('.');
  const paise = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (paise > BigInt('99999999999999999')) throw new Error('Invalid Tally Sales Register gross amount');
  return Number(paise);
}

export function parseSalesControls(voucherCountText: string, grossText: string, period: Period): SalesControls {
  if (!date(period.start) || !date(period.end) || period.start > period.end) throw new Error('Invalid Tally Sales Register period');
  return {
    source: 'tally_sales_register',
    collection_method: 'operator_readback',
    metric_scope: 'posted_sales_gross_v1',
    voucher_count: parseCount(voucherCountText),
    gross_value_paise: parseRupees(grossText),
    period_start: period.start,
    period_end: period.end,
    captured_at: new Date().toISOString(),
  };
}
