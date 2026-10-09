/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles and Supabase row fixtures are intentionally structural. */
import { describe, expect, it, vi } from 'vitest'
import { reconcileRun } from './reconcile'

function client(result: unknown) {
  return { rpc: vi.fn(async () => ({ data: result, error: null })) } as any
}
const base = { runId: 'run-1', expectedCount: 2, observedCount: 2, expectedGrossValuePaise: 300, observedGrossValuePaise: 300, countDifference: 0, grossDifferencePaise: 0, reasonCodes: [], snapshotId: 'snap-1' }

describe('reconcileRun', () => {
  it('accepts an exact match and returns a snapshot', async () => {
    const db = client({ ...base, status: 'reconciled' })
    await expect(reconcileRun('run-1', db)).resolves.toMatchObject({ status: 'reconciled', snapshotId: 'snap-1' })
    expect(db.rpc).toHaveBeenCalledWith('tally_reconcile_run', { p_run_id: 'run-1' })
  })
  it('blocks a voucher count mismatch', async () => {
    await expect(reconcileRun('run-1', client({ ...base, status: 'blocked', observedCount: 1, countDifference: -1, reasonCodes: ['count_mismatch'], snapshotId: null }))).resolves.toMatchObject({ status: 'blocked', reasonCodes: ['count_mismatch'] })
  })
  it('blocks a gross mismatch', async () => {
    await expect(reconcileRun('run-1', client({ ...base, status: 'blocked', observedGrossValuePaise: 200, grossDifferencePaise: -100, reasonCodes: ['gross_mismatch'], snapshotId: null }))).resolves.toMatchObject({ status: 'blocked', reasonCodes: ['gross_mismatch'] })
  })
  it('reports a missing period as blocked', async () => {
    await expect(reconcileRun('run-1', client({ ...base, status: 'blocked', reasonCodes: ['missing_period'], snapshotId: null }))).resolves.toMatchObject({ status: 'blocked', reasonCodes: ['missing_period'] })
  })
  it('reports invalid negative totals as blocked', async () => {
    await expect(reconcileRun('run-1', client({ ...base, status: 'blocked', expectedGrossValuePaise: -1, reasonCodes: ['invalid_expected_gross'], snapshotId: null }))).resolves.toMatchObject({ status: 'blocked', reasonCodes: ['invalid_expected_gross'] })
  })
  it('is idempotent on reruns when the database returns the same snapshot', async () => {
    const db = client({ ...base, status: 'reconciled' })
    const first = await reconcileRun('run-1', db)
    const second = await reconcileRun('run-1', db)
    expect(second).toEqual(first)
    expect(db.rpc).toHaveBeenCalledTimes(2)
  })
})
