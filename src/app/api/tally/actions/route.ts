import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getCustomerSegments } from '@/lib/tally/reports'

/** Read-only customer action queue. It never creates consent or sends a message. */
export async function GET(request: Request) {
  try {
    const ctx = await requireRole('viewer'); const url = new URL(request.url)
    const report = await getCustomerSegments({ supabase: ctx.supabase, accountId: ctx.accountId, start: url.searchParams.get('start') ?? undefined, end: url.searchParams.get('end') ?? undefined, page: Number(url.searchParams.get('page') ?? 0), pageSize: Number(url.searchParams.get('page_size') ?? 50), inactiveDays: Number(url.searchParams.get('inactive_days') ?? 90) })
    return NextResponse.json({ data: { ...report, rows: report.rows.map(row => ({ ...row, action: row.segment === 'inactive' ? 'review_reengagement' : row.segment === 'high_value' ? 'review_high_value' : 'review_customer' })) } })
  } catch (error) { return toErrorResponse(error) }
}
