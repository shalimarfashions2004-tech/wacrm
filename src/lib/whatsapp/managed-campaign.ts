import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimBroadcastDelivery,
  releaseBroadcastDelivery,
} from './broadcast-resume';
import { readManagedSource } from './managed-source';
import { deliverManagedCampaign } from './managed-delivery';
import { ManagedDeliveryError, managedSender } from './managed-policy';

export async function startManagedCampaign(
  db: SupabaseClient,
  accountId: string,
  id: string
): Promise<() => Promise<void>> {
  if (!managedSender())
    throw new ManagedDeliveryError(
      'messaging_managed_disabled',
      'Managed delivery is disabled.'
    );
  const source = await readManagedSource(db, accountId, 'broadcast', id);
  const { data: approval, error } = await db
    .from('messaging_source_approvals')
    .select('id')
    .eq('account_id', accountId)
    .eq('source_kind', 'broadcast')
    .eq('source_id', id)
    .eq('fingerprint', source.fingerprint)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !approval)
    throw new ManagedDeliveryError(
      'messaging_approval_required',
      'Review and approve the saved campaign before continuing.'
    );
  const claimed = await claimBroadcastDelivery(db, accountId, id);
  if (!claimed)
    throw new ManagedDeliveryError(
      'messaging_campaign_busy',
      'A delivery pass is already running.'
    );
  const { error: updateError } = await db
    .from('broadcasts')
    .update({ status: 'sending', delivery_mode: 'live', delivery_error: null })
    .eq('account_id', accountId)
    .eq('id', id);
  if (updateError) {
    await releaseBroadcastDelivery(db, id);
    throw new Error('Cannot start delivery pass');
  }
  return async () => {
    let deliveryError: string | null = null;
    try {
      await deliverManagedCampaign(db, accountId, id);
    } catch (error) {
      deliveryError =
        error instanceof ManagedDeliveryError
          ? error.message
          : 'The delivery pass stopped. Review progress before continuing.';
    } finally {
      try {
        const [pending, accepted] = await Promise.all([
          db
            .from('broadcast_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('broadcast_id', id)
            .eq('status', 'pending'),
          db
            .from('broadcast_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('broadcast_id', id)
            .in('status', ['sent', 'delivered', 'read', 'replied']),
        ]);
        if (pending.error || accepted.error)
          throw new Error('Cannot read campaign progress');
        const { error: finishError } = await db
          .from('broadcasts')
          .update({
            status:
              (pending.count ?? 0) > 0
                ? 'draft'
                : (accepted.count ?? 0) > 0
                  ? 'sent'
                  : 'failed',
            delivery_error: deliveryError,
          })
          .eq('id', id)
          .eq('account_id', accountId);
        if (finishError)
          throw new Error(
            'Could not save campaign progress; check recipient receipts before continuing.'
          );
      } finally {
        await releaseBroadcastDelivery(db, id);
      }
    }
  };
}
