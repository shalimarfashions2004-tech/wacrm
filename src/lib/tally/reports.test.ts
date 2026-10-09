/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles and Supabase row fixtures are intentionally structural. */
import { describe, expect, it } from 'vitest'
import { getCustomerSegments, getProductPerformance, getStockOpportunities, getSalesOverview } from './reports'

function client(reconciliationStatus = 'reconciled') {
  const runs = [{ id: 'run-1', source_period_start: '2026-01-01', source_period_end: '2026-03-31', received_at: '2026-04-01T00:00:00Z', reconciliation_status: reconciliationStatus }]
  const snapshots = [{ id: 'snap-1', run_id: 'run-1', period_start: '2026-01-01', period_end: '2026-03-31', coverage: { voucher_count: 3 }, currency: 'INR', created_at: '2026-04-01T00:00:00Z' }]
  const vouchers = [{ id: 'v1', voucher_date: '2026-03-01', party: 'Asha', gross_value_paise: 10000 }, { id: 'v2', voucher_date: '2026-03-02', party: 'Asha', gross_value_paise: 5000 }, { id: 'v3', voucher_date: '2026-01-01', party: 'Binu', gross_value_paise: 2000 }]
  const lines = [{ voucher_id: 'v1', item: 'Saree', quantity: 2, value_paise: 10000 }, { voucher_id: 'v2', item: 'Saree', quantity: 1, value_paise: 5000 }, { voucher_id: 'v3', item: 'Shirt', quantity: 1, value_paise: 2000 }]
  const stock = [{ name: 'Saree', quantity: 4, value_paise: 20000 }, { name: 'Belt', quantity: -1, value_paise: -1000 }, { name: 'Unused', quantity: 2, value_paise: 1000 }]
  return { from(table: string) { let data: any = table === 'tally_sync_runs' ? runs : table === 'tally_report_snapshots' ? snapshots : table === 'tally_sync_vouchers' ? vouchers : table === 'tally_sync_voucher_lines' ? lines : stock; const q: any = { data: null, error: null }; for (const m of ['select','eq','order','limit']) q[m] = (...args: any[]) => { if (m === 'eq' && args[0] === 'run_id' && data.some((x: any) => 'run_id' in x)) data = data.filter((x: any) => x.run_id === args[1]); return q }; q.maybeSingle = async () => ({ data: data[0] ?? null, error: null }); q.then = (resolve: any) => resolve({ data, error: null }); return q } } as any }

const base = (reconciliationStatus = 'reconciled') => ({ supabase: client(reconciliationStatus), accountId: 'acct-1', start: '2026-01-01', end: '2026-03-31', page: 0, pageSize: 50 })
describe('Tally reports', () => {
  it('calculates overview and top products/customers', async () => { expect((await getSalesOverview(base())).revenue_paise).toBe(17000); expect((await getProductPerformance(base())).rows[0].product).toBe('Saree'); expect((await getCustomerSegments(base())).rows[0].customer).toBe('Asha') })
  it('marks no-sale and negative stock opportunities', async () => { const p = await getProductPerformance(base()); expect(p.rows.find(x => x.product === 'Unused')?.no_sale).toBe(true); const s = await getStockOpportunities(base()); expect(s.rows.find(x => x.product === 'Belt')?.negative_stock).toBe(true) })
  it('keeps a received but unreconciled run pending', async () => { expect((await getSalesOverview(base('pending'))).reconciliation_status).toBe('pending') })
  it('bounds date ranges and pagination', async () => { await expect(getSalesOverview({ ...base(), start: '2020-01-01', end: '2026-03-31' })).rejects.toThrow('366 days'); expect((await getProductPerformance({ ...base(), pageSize: 1 })).rows).toHaveLength(1) })
})
