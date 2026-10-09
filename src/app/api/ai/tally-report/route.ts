import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { loadAiConfig } from '@/lib/ai/config'
import { buildTallyAiReport, type ReportLanguage, type TallyReportSnapshot } from '@/lib/tally/ai-report'
import { getProductPerformance, getSalesOverview } from '@/lib/tally/reports'

/** Preview-only grounded Tally report. It never sends, approves, or writes. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer')
    const body = (await request.json().catch(() => null) ?? {}) as Record<string, unknown>
    if (body?.snapshot_id !== undefined && (typeof body.snapshot_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.snapshot_id))) return NextResponse.json({ error: 'snapshot_id must be a UUID' }, { status: 400 })
    const language: ReportLanguage = body?.language === 'ml' ? 'ml' : 'en'
    const filters = {
      supabase,
      accountId,
      snapshotId: typeof body.snapshot_id === 'string' ? body.snapshot_id : undefined,
      start: typeof body.start === 'string' ? body.start : undefined,
      end: typeof body.end === 'string' ? body.end : undefined,
      product: typeof body.product === 'string' ? body.product : undefined,
      category: typeof body.category === 'string' ? body.category : undefined,
      customer: typeof body.customer === 'string' ? body.customer : undefined,
    }
    const [overview, products] = await Promise.all([getSalesOverview(filters), getProductPerformance(filters)])
    const serverSnapshot: TallyReportSnapshot = { ...overview, rows: products.rows, snapshot_id: overview.snapshot_id }
    const config = await loadAiConfig(supabase, accountId).catch(() => null)
    const report = await buildTallyAiReport(serverSnapshot, { language, approvedKnowledge: [], consentState: 'unknown', identityState: 'incomplete', ai: config ? { config, enabled: true } : undefined }, language)
    return NextResponse.json({ data: report, preview_only: true })
  } catch (error) { return toErrorResponse(error) }
}
