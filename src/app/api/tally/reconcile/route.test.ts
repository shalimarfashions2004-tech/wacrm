/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles and Supabase row fixtures are intentionally structural. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'
import { requireRole } from '@/lib/auth/account'
import { reconcileRun } from '@/lib/tally/reconcile'

vi.mock('@/lib/auth/account', () => ({ requireRole: vi.fn(), toErrorResponse: (error: Error) => Response.json({ error: error.message }, { status: 500 }) }))
vi.mock('@/lib/tally/reconcile', () => ({ reconcileRun: vi.fn() }))
const auth = vi.mocked(requireRole)
const reconcile = vi.mocked(reconcileRun)
function request(method: string, id = 'run-1') { return new Request(`https://example.invalid/api/tally/reconcile?run_id=${id}`, { method }) }
function chain(data: unknown, error: unknown = null) { const c: any = { data, error }; for (const key of ['select', 'eq']) c[key] = vi.fn(() => c); c.maybeSingle = vi.fn(async () => ({ data, error })); return c }

describe('tally reconciliation route', () => {
  beforeEach(() => vi.clearAllMocks())
  it('GET reads status and never invokes reconciliation', async () => {
    const from = vi.fn((table: string) => chain(table === 'tally_sync_runs' ? { id: 'run-1', reconciliation_status: 'pending' } : null))
    auth.mockResolvedValue({ accountId: 'acct-1', supabase: { from } } as any)
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    expect(reconcile).not.toHaveBeenCalled()
  })
  it('POST performs reconciliation', async () => {
    auth.mockResolvedValue({ accountId: 'acct-1', supabase: {} } as any)
    reconcile.mockResolvedValue({ runId: 'run-1', status: 'reconciled', expectedCount: 0, observedCount: 0, expectedGrossValuePaise: 0, observedGrossValuePaise: 0, countDifference: 0, grossDifferencePaise: 0, reasonCodes: [], snapshotId: 'snap-1' })
    const response = await POST(request('POST'))
    expect(response.status).toBe(200)
    expect(reconcile).toHaveBeenCalledWith('run-1', expect.anything())
  })
})
