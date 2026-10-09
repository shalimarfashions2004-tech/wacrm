import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getCustomerSegments, getProductPerformance, getSalesOverview, getStockOpportunities } from '@/lib/tally/reports'

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('viewer'); const url = new URL(request.url); const type = url.searchParams.get('type') ?? 'overview'
    const filters = { supabase: ctx.supabase, accountId: ctx.accountId, start: url.searchParams.get('start') ?? undefined, end: url.searchParams.get('end') ?? undefined, product: url.searchParams.get('product') ?? undefined, category: url.searchParams.get('category') ?? undefined, customer: url.searchParams.get('customer') ?? undefined, page: Number(url.searchParams.get('page') ?? 0), pageSize: Number(url.searchParams.get('page_size') ?? 50), inactiveDays: Number(url.searchParams.get('inactive_days') ?? 90) }
    const data = type === 'customers' ? await getCustomerSegments(filters) : type === 'products' ? await getProductPerformance(filters) : type === 'stock' ? await getStockOpportunities(filters) : await getSalesOverview(filters)
    return NextResponse.json({ data })
  } catch (error) { return toErrorResponse(error) }
}
