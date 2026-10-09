/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles and Supabase row fixtures are intentionally structural. */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ReportFilters = {
  supabase: SupabaseClient
  accountId: string
  start?: string
  end?: string
  product?: string
  category?: string
  customer?: string
  page?: number
  pageSize?: number
  inactiveDays?: number
}
export type ReportMeta = { source_period: { start: string; end: string } | null; currency: 'INR'; coverage: Record<string, unknown>; last_sync_at: string | null; reconciliation_status: 'reconciled' | 'blocked' | 'empty' }
export type SalesOverview = ReportMeta & { revenue_paise: number; invoice_count: number; units: number; average_order_value_paise: number; active_customers: number; previous_period?: { revenue_paise: number; invoice_count: number } | null; comparison_status: 'unavailable' | 'available' }
export type CustomerSegment = { customer: string; gross_value_paise: number; invoice_count: number; last_purchase: string | null; segment: 'high_value' | 'frequent' | 'recent' | 'inactive' }
export type CustomerSegmentReport = ReportMeta & { rows: CustomerSegment[]; total: number; inactive_days: number; page: number; page_size: number }
export type ProductPerformance = { product: string; units: number; gross_value_paise: number; invoice_count: number; last_sale: string | null; no_sale: boolean }
export type ProductPerformanceReport = ReportMeta & { rows: ProductPerformance[]; total: number; page: number; page_size: number }
export type StockOpportunity = { product: string; quantity: number; value_paise: number; negative_stock: boolean; no_sale: boolean }
export type StockOpportunityReport = ReportMeta & { rows: StockOpportunity[]; total: number; page: number; page_size: number }

type Row = Record<string, any>
const PAGE_MAX = 100
const PAGE_INDEX_MAX = 1000
const DAY = 86400000
function isoDate(v: unknown): string | undefined { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : undefined }
function bounded(filters: ReportFilters) {
  const end = isoDate(filters.end) ?? new Date().toISOString().slice(0, 10)
  const requestedStart = isoDate(filters.start)
  const endMs = Date.parse(`${end}T00:00:00Z`)
  const start = requestedStart && Date.parse(`${requestedStart}T00:00:00Z`) <= endMs ? requestedStart : new Date(endMs - 365 * DAY).toISOString().slice(0, 10)
  if (endMs - Date.parse(`${start}T00:00:00Z`) > 366 * DAY) throw new Error('Date range cannot exceed 366 days')
  const page = Number.isInteger(filters.page) && (filters.page as number) >= 0 && (filters.page as number) <= PAGE_INDEX_MAX ? filters.page as number : 0
  const pageSize = Number.isInteger(filters.pageSize) && (filters.pageSize as number) > 0 && (filters.pageSize as number) <= PAGE_MAX ? filters.pageSize as number : 50
  const inactiveDays = Number.isInteger(filters.inactiveDays) && (filters.inactiveDays as number) >= 1 && (filters.inactiveDays as number) <= 730 ? filters.inactiveDays as number : 90
  return { start, end, page, pageSize, inactiveDays }
}
async function load(filters: ReportFilters) {
  const { supabase, accountId } = filters
  const latest = await supabase.from('tally_sync_runs').select('id,source_period_start,source_period_end,received_at,reconciliation_status,reconciliation_reason_codes').eq('account_id', accountId).order('received_at', { ascending: false }).limit(1).maybeSingle()
  if (latest.error) throw latest.error
  const validResult = await supabase.from('tally_report_snapshots').select('id,run_id,period_start,period_end,coverage,currency,created_at').eq('account_id', accountId).order('period_end', { ascending: false }).limit(2)
  if (validResult.error) throw validResult.error
  const validRows = validResult.data ?? []
  const valid = { data: validRows[0] ?? null }
  const priorSnapshot = validRows[1] ?? null
  const runId = valid.data?.run_id as string | undefined
  const run = runId ? await supabase.from('tally_sync_runs').select('id,source_period_start,source_period_end,received_at,reconciliation_status').eq('account_id', accountId).eq('id', runId).maybeSingle() : { data: null, error: null }
  if (run.error) throw run.error
  const status = latest.data && latest.data.reconciliation_status !== 'reconciled' ? 'blocked' : valid.data ? 'reconciled' : 'empty'
  const source = valid.data ? { start: valid.data.period_start, end: valid.data.period_end } : null
  const meta: ReportMeta = { source_period: source, currency: 'INR', coverage: (valid.data?.coverage as Record<string, unknown>) ?? {}, last_sync_at: latest.data?.received_at ?? run.data?.received_at ?? null, reconciliation_status: status }
  if (!runId) return { meta, vouchers: [] as Row[], priorVouchers: [] as Row[], lines: [] as Row[], stock: [] as Row[] }
  const [vouchers, lines, stock, priorVouchers] = await Promise.all([
    supabase.from('tally_sync_vouchers').select('id,source_id,voucher_date,party,gross_value_paise').eq('account_id', accountId).eq('run_id', runId),
    supabase.from('tally_sync_voucher_lines').select('voucher_id,item,quantity,value_paise').eq('account_id', accountId).eq('run_id', runId),
    supabase.from('tally_sync_stock_items').select('name,quantity,value_paise,item_group').eq('account_id', accountId).eq('run_id', runId),
    priorSnapshot ? supabase.from('tally_sync_vouchers').select('id,source_id,voucher_date,party,gross_value_paise').eq('account_id', accountId).eq('run_id', priorSnapshot.run_id) : Promise.resolve({ data: [], error: null } as any),
  ])
  for (const result of [vouchers, lines, stock]) if (result.error) throw result.error
  return { meta, vouchers: vouchers.data ?? [], priorVouchers: priorVouchers.data ?? [], lines: lines.data ?? [], stock: stock.data ?? [] }
}
function inRange(row: Row, start: string, end: string) { return row.voucher_date >= start && row.voucher_date <= end }
function paise(value: unknown): number { const n = Number(value ?? 0); if (!Number.isSafeInteger(n)) throw new Error('Report contains unsafe paise value'); return n }
function pageRows<T>(rows: T[], page: number, pageSize: number) { return rows.slice(page * pageSize, (page + 1) * pageSize) }

export async function getSalesOverview(filters: ReportFilters): Promise<SalesOverview> {
  const range = bounded(filters); const d = await load(filters); const vouchers = d.vouchers.filter(v => inRange(v, range.start, range.end) && (!filters.customer || String(v.party || '').toLowerCase().includes(filters.customer.toLowerCase().slice(0, 100)))); const lines = d.lines.filter(l => vouchers.some(v => v.id === l.voucher_id) && (!filters.product || String(l.item || '').toLowerCase().includes(filters.product.toLowerCase().slice(0, 100))));
  const revenue = vouchers.reduce((n, v) => n + paise(v.gross_value_paise), 0); const units = lines.reduce((n, l) => n + Number(l.quantity || 0), 0); const customers = new Set(vouchers.map(v => String(v.party || '').trim()).filter(Boolean));
  return { ...d.meta, revenue_paise: revenue, invoice_count: vouchers.length, units, average_order_value_paise: vouchers.length ? Math.round(revenue / vouchers.length) : 0, active_customers: customers.size, previous_period: (() => { const priorStart = new Date(`${range.start}T00:00:00Z`); priorStart.setUTCFullYear(priorStart.getUTCFullYear() - 1); const priorEnd = new Date(`${range.end}T00:00:00Z`); priorEnd.setUTCFullYear(priorEnd.getUTCFullYear() - 1); const prior = d.priorVouchers.filter((v: Row) => inRange(v, priorStart.toISOString().slice(0, 10), priorEnd.toISOString().slice(0, 10))); if (!prior.length) return null; return { revenue_paise: prior.reduce((n: number, v: Row) => n + paise(v.gross_value_paise), 0), invoice_count: prior.length } })(), comparison_status: d.priorVouchers.length ? 'available' : 'unavailable' }
}
export async function getCustomerSegments(filters: ReportFilters): Promise<CustomerSegmentReport> {
  const range = bounded(filters); const d = await load(filters); const vouchers = d.vouchers.filter(v => inRange(v, range.start, range.end) && (!filters.customer || String(v.party || '').toLowerCase().includes(filters.customer.toLowerCase().slice(0, 100)))); const map = new Map<string, CustomerSegment>();
  for (const v of vouchers) { const customer = String(v.party || '').trim(); if (!customer) continue; const row = map.get(customer) ?? { customer, gross_value_paise: 0, invoice_count: 0, last_purchase: null, segment: 'recent' as const }; row.gross_value_paise += paise(v.gross_value_paise); row.invoice_count = new Set([...(map.get(customer) as any)?.__invoice_ids ?? [], v.id]).size; (row as any).__invoice_ids = [...(map.get(customer) as any)?.__invoice_ids ?? [], v.id]; if (!row.last_purchase || v.voucher_date > row.last_purchase) row.last_purchase = v.voucher_date; map.set(customer, row) }
  const rows = [...map.values()].sort((a, b) => b.gross_value_paise - a.gross_value_paise || b.invoice_count - a.invoice_count || a.customer.localeCompare(b.customer)); const threshold = new Date(`${range.end}T00:00:00Z`).getTime() - range.inactiveDays * DAY;
  for (const row of rows) { const ts = row.last_purchase ? Date.parse(`${row.last_purchase}T00:00:00Z`) : 0; row.segment = ts < threshold ? 'inactive' : row.gross_value_paise >= 100000 ? 'high_value' : row.invoice_count > 1 ? 'frequent' : 'recent' }
  return { ...d.meta, rows: pageRows(rows, range.page, range.pageSize), total: rows.length, inactive_days: range.inactiveDays, page: range.page, page_size: range.pageSize }
}
export async function getProductPerformance(filters: ReportFilters): Promise<ProductPerformanceReport> {
  const range = bounded(filters); const d = await load(filters); const vouchers = d.vouchers.filter(v => inRange(v, range.start, range.end)); const ids = new Set(vouchers.map(v => v.id)); const map = new Map<string, ProductPerformance>();
  for (const l of d.lines.filter(x => ids.has(x.voucher_id) && (!filters.product || String(x.item || '').toLowerCase().includes(filters.product.toLowerCase().slice(0, 100))))) { const product = String(l.item || '').trim(); if (!product) continue; const v = d.vouchers.find(x => x.id === l.voucher_id)!; const row = map.get(product) ?? { product, units: 0, gross_value_paise: 0, invoice_count: 0, last_sale: null, no_sale: false, ...( { __invoice_ids: [] } as any) }; const idsForProduct = new Set([...(row as any).__invoice_ids, l.voucher_id]); (row as any).__invoice_ids = [...idsForProduct]; row.invoice_count = idsForProduct.size; row.units += Number(l.quantity || 0); row.gross_value_paise += paise(l.value_paise); row.last_sale = !row.last_sale || v.voucher_date > row.last_sale ? v.voucher_date : row.last_sale; map.set(product, row) }
  for (const s of d.stock) { const product = String(s.name || '').trim(); if (!product || map.has(product)) continue; map.set(product, { product, units: 0, gross_value_paise: 0, invoice_count: 0, last_sale: null, no_sale: true }) }
  const rows = [...map.values()].map(({ __invoice_ids, ...row }: any) => row).filter(row => !filters.category || String(d.stock.find(x => String(x.name || '') === row.product)?.item_group || '').toLowerCase().includes(filters.category.toLowerCase().slice(0, 100))).sort((a, b) => b.units - a.units || b.gross_value_paise - a.gross_value_paise || a.product.localeCompare(b.product)); return { ...d.meta, rows: pageRows(rows, range.page, range.pageSize), total: rows.length, page: range.page, page_size: range.pageSize }
}
export async function getStockOpportunities(filters: ReportFilters): Promise<StockOpportunityReport> {
  const range = bounded(filters); const d = await load(filters); const sold = new Set(d.lines.filter(l => d.vouchers.some(v => l.voucher_id === v.id && inRange(v, range.start, range.end)) && (!filters.product || String(l.item || '').toLowerCase().includes(filters.product.toLowerCase().slice(0, 100)))).map(l => String(l.item || '').trim())); const rows = d.stock.map(s => ({ product: String(s.name || ''), quantity: Number(s.quantity || 0), value_paise: paise(s.value_paise), negative_stock: Number(s.quantity || 0) < 0, no_sale: !sold.has(String(s.name || '').trim()) })).filter(r => r.product && (!filters.product || r.product.toLowerCase().includes(filters.product.toLowerCase().slice(0, 100))) && (!filters.category || String(d.stock.find(x => String(x.name || '') === r.product)?.item_group || '').toLowerCase().includes(filters.category.toLowerCase().slice(0, 100)))).sort((a, b) => Number(b.negative_stock) - Number(a.negative_stock) || b.value_paise - a.value_paise || a.product.localeCompare(b.product)); return { ...d.meta, rows: pageRows(rows, range.page, range.pageSize), total: rows.length, page: range.page, page_size: range.pageSize }
}
