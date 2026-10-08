import { after, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  readManagedSource,
  sourceTemplates,
  type ManagedSourceKind,
  type ManagedRecipient,
} from '@/lib/whatsapp/managed-source';
import type { AutomationStep } from '@/types';
import { buildManagedPayload } from '@/lib/whatsapp/managed-payload';
import {
  managedConfig,
  verifyManagedProvider,
  verifyManagedTemplates,
} from '@/lib/whatsapp/managed-provider';
import {
  managedDatabaseError,
  ManagedDeliveryError,
  managedBudgetReady,
  type ManagedBudget,
} from '@/lib/whatsapp/managed-policy';
import { reviewManagedAudience } from '@/lib/whatsapp/managed-review';
import { startManagedCampaign } from '@/lib/whatsapp/managed-campaign';
import { managedResponseError } from '@/lib/whatsapp/managed-http';

export const maxDuration = 300;
type Params = { params: Promise<{ kind: string; id: string }> };
function sourceKind(value: string): ManagedSourceKind {
  if (value !== 'broadcast' && value !== 'automation')
    throw new ManagedDeliveryError(
      'invalid_source',
      'Unknown message source.',
      400
    );
  return value;
}
export async function GET(_request: Request, { params }: Params) {
  try {
    const { accountId, supabase } = await requireRole('admin');
    const { kind: rawKind, id } = await params;
    const kind = sourceKind(rawKind);
    const db = supabaseAdmin();
    const source = await readManagedSource(db, accountId, kind, id);
    const { data: budget, error } = await supabase.rpc(
      'read_messaging_budget',
      { p_account_id: accountId }
    );
    if (error) throw managedDatabaseError(error);
    const { data: approval, error: approvalError } = await supabase
      .from('messaging_source_approvals')
      .select('id,fingerprint,expires_at')
      .eq('account_id', accountId)
      .eq('source_kind', kind)
      .eq('source_id', id)
      .is('revoked_at', null)
      .maybeSingle();
    if (approvalError) throw managedDatabaseError(approvalError);
    const audience =
      kind === 'broadcast'
        ? await reviewManagedAudience(db, accountId, source.snapshot)
        : null;
    const templates = sourceTemplates(source.snapshot, kind);
    let deliveryError: string | null = null;
    if (kind === 'broadcast') {
      const { data: progress, error: progressError } = await db
        .from('broadcasts')
        .select('delivery_error')
        .eq('id', id)
        .eq('account_id', accountId)
        .maybeSingle();
      if (progressError) throw managedDatabaseError(progressError);
      deliveryError = progress?.delivery_error ?? null;
    }
    const samples =
      kind === 'broadcast'
        ? (source.snapshot.children as ManagedRecipient[])
            .filter((r) => r.phone)
            .slice(0, 3)
            .map((r) => {
              try {
                return {
                  phone: r.phone!,
                  text: buildManagedPayload(
                    source.snapshot,
                    {
                      accountId,
                      kind,
                      sourceId: id,
                      contactId: r.contact,
                      recipientId: r.id,
                    },
                    r.phone!
                  ).text,
                };
              } catch {
                return {
                  phone: r.phone!,
                  text: 'This recipient needs valid saved template values before sending.',
                };
              }
            })
        : [];
    return NextResponse.json({
      fingerprint: source.fingerprint,
      name: source.snapshot.source.name,
      templates: templates.map((t) => ({
        name: t.name,
        body: t.body_text,
        category: t.category,
        language: t.language,
        headerType: t.header_type,
        headerText: t.header_content,
        mediaUrl:
          source.snapshot.source.audience?.headerMediaUrl || t.header_media_url,
        footer: t.footer_text,
        buttons: t.buttons ?? [],
      })),
      workflow:
        kind === 'automation'
          ? (source.snapshot.children as AutomationStep[])
              .filter((s) =>
                [
                  'send_message',
                  'send_buttons',
                  'send_list',
                  'send_template',
                ].includes(s.step_type)
              )
              .map((s) => ({
                step_type: s.step_type,
                step_config: s.step_config,
              }))
          : null,
      trigger: source.snapshot.source.trigger,
      samples,
      deliveryError,
      audience,
      budget,
      ready: managedBudgetReady(budget as ManagedBudget),
      approved:
        !!approval &&
        approval.fingerprint === source.fingerprint &&
        Date.parse(approval.expires_at) > Date.now(),
      expiresAt: approval?.expires_at ?? null,
    });
  } catch (error) {
    return managedResponseError(error);
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const { accountId, supabase } = await requireRole('admin');
    const { kind: rawKind, id } = await params;
    const kind = sourceKind(rawKind);
    const body = await request.json().catch(() => null);
    if (body?.action === 'revoke') {
      const { error } = await supabase.rpc('revoke_messaging_source', {
        p_account_id: accountId,
        p_source_kind: kind,
        p_source_id: id,
      });
      if (error) throw managedDatabaseError(error);
      return NextResponse.json({ approved: false });
    }
    if (body?.action !== 'approve' || typeof body.fingerprint !== 'string')
      return NextResponse.json(
        { error: 'Review the saved message before approving.' },
        { status: 400 }
      );
    const db = supabaseAdmin();
    const source = await readManagedSource(db, accountId, kind, id);
    if (source.fingerprint !== body.fingerprint)
      throw new ManagedDeliveryError(
        'messaging_source_changed',
        'The saved content changed. Refresh the review.'
      );
    const { data: budget, error: budgetError } = await supabase.rpc(
      'read_messaging_budget',
      { p_account_id: accountId }
    );
    if (budgetError) throw managedDatabaseError(budgetError);
    if (!managedBudgetReady(budget))
      throw new ManagedDeliveryError(
        'messaging_managed_disabled',
        'Enable managed delivery in WhatsApp settings first.'
      );
    if (kind === 'broadcast') {
      if (source.snapshot.source.audience?.preparationComplete !== true)
        throw new ManagedDeliveryError(
          'messaging_preparation_incomplete',
          'Prepare this campaign through New broadcast before approval.'
        );
      const audience = await reviewManagedAudience(
        db,
        accountId,
        source.snapshot
      );
      if (!audience.eligible)
        throw new ManagedDeliveryError(
          'messaging_audience_empty',
          'No unattempted recipients have the required recorded consent.'
        );
      if (audience.eligible * budget.reservationPaise > budget.remainingPaise)
        throw new ManagedDeliveryError(
          'messaging_budget_insufficient',
          'This campaign exceeds the remaining monthly allowance. Prepare a smaller audience.'
        );
    }
    if (
      kind === 'automation' &&
      (source.snapshot.children as AutomationStep[]).some((s) =>
        ['wait', 'wait_for_reply', 'delay'].includes(s.step_type)
      ) &&
      process.env.MESSAGING_WORKFLOW_SCHEDULER_VERIFIED !== 'true'
    )
      throw new ManagedDeliveryError(
        'messaging_scheduler_required',
        'Waiting workflows need a verified scheduler before approval. Immediate workflows can be reviewed now.'
      );
    const config = await managedConfig(db, accountId);
    await verifyManagedProvider(config);
    await verifyManagedTemplates(
      config,
      sourceTemplates(source.snapshot, kind)
    );
    const { error } = await supabase.rpc('approve_messaging_source', {
      p_account_id: accountId,
      p_source_kind: kind,
      p_source_id: id,
      p_expected_fingerprint: body.fingerprint,
    });
    if (error) throw managedDatabaseError(error);
    if (kind === 'broadcast') {
      const work = await startManagedCampaign(db, accountId, id);
      after(work);
      return NextResponse.json(
        { approved: true, sending: true },
        { status: 202 }
      );
    }
    return NextResponse.json({
      approved: true,
      message:
        'Future runs of this saved workflow may send after per-contact and budget checks. Existing steps have not been run.',
    });
  } catch (error) {
    return managedResponseError(error);
  }
}
