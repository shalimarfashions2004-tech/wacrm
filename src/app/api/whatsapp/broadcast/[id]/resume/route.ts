import { after, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { startManagedCampaign } from '@/lib/whatsapp/managed-campaign';
import { managedResponseError } from '@/lib/whatsapp/managed-http';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(
      `broadcast-resume:${userId}`,
      RATE_LIMITS.broadcast
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => ({}));
    if (body.scope === 'failed')
      return NextResponse.json(
        {
          error:
            'Previous attempts cannot be retried automatically. Continue only recipients that have not been attempted.',
        },
        { status: 409 }
      );
    const { id } = await params;
    const work = await startManagedCampaign(supabaseAdmin(), accountId, id);
    after(work);
    return NextResponse.json(
      { success: true, broadcast_id: id, scope: 'pending' },
      { status: 202 }
    );
  } catch (error) {
    return managedResponseError(error);
  }
}
