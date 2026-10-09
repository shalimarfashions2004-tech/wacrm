import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ requireRole: vi.fn() }))
const reports = vi.hoisted(() => ({ getSalesOverview: vi.fn(), getProductPerformance: vi.fn() }))
const ai = vi.hoisted(() => ({ loadAiConfig: vi.fn() }))
const builder = vi.hoisted(() => ({ buildTallyAiReport: vi.fn() }))
vi.mock('@/lib/auth/account', () => ({ requireRole: auth.requireRole, toErrorResponse: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : 'error' }, { status: 500 }) }))
vi.mock('@/lib/tally/reports', () => reports)
vi.mock('@/lib/ai/config', () => ai)
vi.mock('@/lib/tally/ai-report', () => ({ buildTallyAiReport: builder.buildTallyAiReport }))
import { POST } from './route'

const overview = { snapshot_id: '11111111-1111-4111-8111-111111111111', source_period: { start: '2026-06-01', end: '2026-10-08' }, reconciliation_status: 'reconciled', currency: 'INR', coverage: {}, last_sync_at: null, revenue_paise: 12500, invoice_count: 2, units: 3, average_order_value_paise: 6250, active_customers: 1, comparison_status: 'unavailable' }
beforeEach(() => { vi.clearAllMocks(); auth.requireRole.mockResolvedValue({ supabase: { from: vi.fn() }, accountId: 'account-1' }); reports.getSalesOverview.mockResolvedValue(overview); reports.getProductPerformance.mockResolvedValue({ ...overview, rows: [{ product: 'Silk', units: 3 }] }); ai.loadAiConfig.mockResolvedValue(null); builder.buildTallyAiReport.mockResolvedValue({ needs_review: true, generated_by: 'deterministic' }); })

describe('server-grounded Tally AI report', () => {
  it('ignores forged browser snapshot values and loads the selected server snapshot', async () => {
    const response = await POST(new Request('https://crm.test/api/ai/tally-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot_id: overview.snapshot_id, snapshot: { revenue_paise: 999999999 }, language: 'en' }) }))
    expect(response.status).toBe(200)
    expect(reports.getSalesOverview).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account-1', snapshotId: overview.snapshot_id }))
    expect(builder.buildTallyAiReport).toHaveBeenCalledWith(expect.objectContaining({ revenue_paise: 12500, rows: [{ product: 'Silk', units: 3 }] }), expect.objectContaining({ consentState: 'unknown', identityState: 'incomplete', approvedKnowledge: [] }), 'en')
  })
  it('rejects a malformed snapshot id before querying data', async () => {
    const response = await POST(new Request('https://crm.test/api/ai/tally-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot_id: 'forged' }) }))
    expect(response.status).toBe(400)
    expect(reports.getSalesOverview).not.toHaveBeenCalled()
  })
})
