import { managedResponseError } from '@/lib/whatsapp/managed-http';
import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  MANAGED_RATE,
  configuredManagedSender,
  ManagedDeliveryError,
  managedBudgetReady,
  managedDatabaseError,
  managedSender,
  type ManagedBudget,
} from '@/lib/whatsapp/managed-policy';
import {
  managedConfig,
  verifyManagedProvider,
} from '@/lib/whatsapp/managed-provider';

export async function GET() {
  try {
    const { supabase, accountId, role } = await getCurrentAccount();
    const { data, error } = await supabase.rpc('read_messaging_budget', {
      p_account_id: accountId,
    });
    if (error) throw managedDatabaseError(error);
    const budget = data as ManagedBudget;
    return NextResponse.json({
      budget,
      ready: managedBudgetReady(budget),
      deploymentEnabled: !!managedSender(),
      providerCheckAvailable: !!configuredManagedSender(),
      canApprove: role === 'admin' || role === 'owner',
      reviewedRate: MANAGED_RATE,
    });
  } catch (error) {
    return managedResponseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    if (!['verify', 'enable', 'pause'].includes(body?.action))
      return NextResponse.json(
        { error: 'Choose verify, enable or pause.' },
        { status: 400 }
      );
    const db = supabaseAdmin();
    if (body.action === 'pause') {
      const { error } = await db.rpc('configure_messaging_budget', {
        p_account_id: accountId,
        p_actor_id: userId,
        p_enabled: false,
        p_reservation_paise: null,
        p_rate_source: null,
        p_rate_reviewed_at: null,
        p_rate_valid_until: null,
      });
      if (error) throw managedDatabaseError(error);
      return NextResponse.json({
        enabled: false,
        message:
          'Campaigns and automatic messages are paused. Inbox replies keep their separate setting.',
      });
    }
    if (body.action === 'enable' && !managedSender())
      throw new ManagedDeliveryError(
        'messaging_managed_disabled',
        'Delivery checks are still in progress. You can check the Meta connection while campaigns remain paused.'
      );
    if (
      body.action === 'enable' &&
      Date.parse(MANAGED_RATE.validUntil) <= Date.now()
    )
      throw new ManagedDeliveryError(
        'messaging_rate_review_required',
        'The message cost allowance has expired and needs review.'
      );
    const config = await managedConfig(db, accountId);
    const provider = await verifyManagedProvider(config);
    if (body.action === 'enable') {
      const { error } = await db.rpc('configure_messaging_budget', {
        p_account_id: accountId,
        p_actor_id: userId,
        p_enabled: true,
        p_reservation_paise: MANAGED_RATE.reservationPaise,
        p_rate_source: MANAGED_RATE.source,
        p_rate_reviewed_at: MANAGED_RATE.reviewedAt,
        p_rate_valid_until: MANAGED_RATE.validUntil,
      });
      if (error) throw managedDatabaseError(error);
    }
    return NextResponse.json({
      provider,
      enabled: body.action === 'enable',
      checkedAt: new Date().toISOString(),
      message:
        body.action === 'enable'
          ? 'Managed delivery is enabled. Each saved campaign or workflow still needs its own approval.'
          : 'Meta sender and app subscription checks passed.',
    });
  } catch (error) {
    return managedResponseError(error);
  }
}
