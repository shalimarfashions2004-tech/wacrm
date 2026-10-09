import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type ReconciliationStatus = 'reconciled' | 'blocked'
export interface ReconciliationResult {
  runId: string
  status: ReconciliationStatus
  expectedCount: number | null
  observedCount: number
  expectedGrossValuePaise: number | null
  observedGrossValuePaise: number
  countDifference: number | null
  grossDifferencePaise: number | null
  reasonCodes: string[]
  snapshotId: string | null
}

function parseResult(value: unknown, runId: string): ReconciliationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reconciliation result')
  const row = value as Record<string, unknown>
  const status = row.status === 'reconciled' || row.status === 'blocked' ? row.status : null
  if (!status) throw new Error('Invalid reconciliation status')
  const reasons = Array.isArray(row.reasonCodes) ? row.reasonCodes.filter((x): x is string => typeof x === 'string') : []
  const numberOrNull = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : x === null ? null : null
  return {
    runId: typeof row.runId === 'string' ? row.runId : runId,
    status,
    expectedCount: numberOrNull(row.expectedCount),
    observedCount: numberOrNull(row.observedCount) ?? 0,
    expectedGrossValuePaise: numberOrNull(row.expectedGrossValuePaise),
    observedGrossValuePaise: numberOrNull(row.observedGrossValuePaise) ?? 0,
    countDifference: numberOrNull(row.countDifference),
    grossDifferencePaise: numberOrNull(row.grossDifferencePaise),
    reasonCodes: reasons,
    snapshotId: typeof row.snapshotId === 'string' ? row.snapshotId : null,
  }
}

/** Reconcile a staged run and create its report snapshot only on an exact match. */
export async function reconcileRun(runId: string, client?: SupabaseClient): Promise<ReconciliationResult> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase.rpc('tally_reconcile_run', { p_run_id: runId })
  if (error) throw error
  return parseResult(data, runId)
}
