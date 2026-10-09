import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { loadAiConfig } from '@/lib/ai/config'
import { buildTallyAiReport, type ReportLanguage, type TallyReportSnapshot } from '@/lib/tally/ai-report'

/** Preview-only grounded Tally report. It never sends, approves, or writes. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer')
    const body = await request.json().catch(() => null)
    if (!body || typeof body.snapshot !== 'object' || body.snapshot === null) return NextResponse.json({ error: 'snapshot is required' }, { status: 400 })
    const language: ReportLanguage = body.language === 'ml' ? 'ml' : 'en'
    const config = await loadAiConfig(supabase, accountId).catch(() => null)
    const report = await buildTallyAiReport(body.snapshot as TallyReportSnapshot, { language, approvedKnowledge: Array.isArray(body.approved_knowledge) ? body.approved_knowledge.filter((v: unknown): v is string => typeof v === 'string').slice(0, 20) : [], consentState: body.consent_state === 'known' || body.consent_state === 'mixed' ? body.consent_state : 'unknown', identityState: body.identity_state === 'complete' ? 'complete' : 'incomplete', ai: config ? { config, enabled: true } : undefined }, language)
    return NextResponse.json({ data: report, preview_only: true })
  } catch (error) { return toErrorResponse(error) }
}
