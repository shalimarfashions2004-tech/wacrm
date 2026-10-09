import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { reconcileRun } from '@/lib/tally/reconcile'

function runIdFrom(request: Request) {
  return new URL(request.url).searchParams.get('run_id')
}

/** GET /api/tally/reconcile?run_id=... (admin+): read status without mutating. */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const runId = runIdFrom(request)
    if (!runId) return NextResponse.json({ error: 'run_id is required' }, { status: 400 })
    const { data, error } = await supabase
      .from('tally_sync_runs')
      .select('id,reconciliation_status,reconciliation_reason_codes,reconciled_at,source_period_start,source_period_end,counts,gross_value_paise')
      .eq('account_id', accountId)
      .eq('id', runId)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    const snapshot = await supabase.from('tally_report_snapshots').select('id,source_checksum,period_start,period_end,coverage,currency,metric_version,created_at').eq('account_id', accountId).eq('run_id', runId).maybeSingle()
    if (snapshot.error) throw snapshot.error
    return NextResponse.json({ data: { ...data, snapshot: snapshot.data ?? null } })
  } catch (error) {
    return toErrorResponse(error)
  }
}

/** POST /api/tally/reconcile?run_id=... (admin+): reconcile and snapshot. */
export async function POST(request: Request) {
  try {
    const { supabase } = await requireRole('admin')
    const runId = runIdFrom(request)
    if (!runId) return NextResponse.json({ error: 'run_id is required' }, { status: 400 })
    const result = await reconcileRun(runId, supabase)
    return NextResponse.json({ data: result })
  } catch (error) {
    return toErrorResponse(error)
  }
}
