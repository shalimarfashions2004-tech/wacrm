import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  managedDatabaseError,
  ManagedDeliveryError,
  managedSender,
} from './managed-policy';
import {
  readManagedSource,
  sourceTemplates,
  type ManagedRecipient,
} from './managed-source';
import {
  managedConfig,
  verifyManagedProvider,
  verifyManagedTemplates,
} from './managed-provider';
import { buildManagedPayload, type ManagedOperation } from './managed-payload';

export interface ManagedResult {
  accepted: boolean;
  duplicate: boolean;
  deliveryId: string;
  messageId?: string;
}

/** Sole managed provider path. HTTP callers pass source IDs, never message payloads.
 * A permanent database claim precedes the ONE network attempt. The wire string
 * hashed by the claim is the exact immutable string posted to Meta.
 */
export async function dispatchManagedMessage(
  db: SupabaseClient,
  operation: ManagedOperation
): Promise<ManagedResult> {
  if (!managedSender())
    throw new ManagedDeliveryError(
      'messaging_managed_disabled',
      'Managed delivery is disabled.'
    );
  const source = await readManagedSource(
    db,
    operation.accountId,
    operation.kind,
    operation.sourceId
  );
  if (
    operation.kind === 'broadcast' &&
    source.snapshot.source.scheduled_at &&
    Date.parse(source.snapshot.source.scheduled_at) > Date.now()
  ) {
    throw new ManagedDeliveryError(
      'messaging_not_due',
      'This campaign is scheduled for a later time.'
    );
  }
  const config = await managedConfig(db, operation.accountId);
  if (
    source.snapshot.sender.phone !== config.phone_number_id ||
    source.snapshot.sender.waba !== config.waba_id
  ) {
    throw new ManagedDeliveryError(
      'messaging_sender_mismatch',
      'The approved sender has changed.'
    );
  }
  const { data: contact, error: contactError } = await db
    .from('contacts')
    .select('phone')
    .eq('account_id', operation.accountId)
    .eq('id', operation.contactId)
    .maybeSingle();
  if (contactError || !contact)
    throw new ManagedDeliveryError(
      'messaging_contact_not_found',
      'This contact is not in the account.'
    );
  if (operation.kind === 'automation') {
    const { data: conversation, error } = await db
      .from('conversations')
      .select('id')
      .eq('id', operation.conversationId ?? '')
      .eq('account_id', operation.accountId)
      .eq('contact_id', operation.contactId)
      .maybeSingle();
    if (error || !conversation || !operation.runId || !operation.stepId)
      throw new ManagedDeliveryError(
        'messaging_run_not_found',
        'The workflow run or conversation could not be verified.'
      );
  }
  const payload = buildManagedPayload(
    source.snapshot,
    operation,
    contact.phone
  );
  // Validate before reserving money. Read failures never fall through to send.
  await verifyManagedProvider(config);
  const templates = sourceTemplates(source.snapshot, operation.kind).filter(
    (t) => t.name === payload.templateName
  );
  await verifyManagedTemplates(config, templates);
  const { data: claim, error: claimError } = await db.rpc(
    'claim_messaging_delivery',
    {
      p_account_id: operation.accountId,
      p_source_kind: operation.kind,
      p_source_id: operation.sourceId,
      p_contact_id: operation.contactId,
      p_expected_fingerprint: source.fingerprint,
      p_payload_hash: payload.hash,
      p_recipient_id: operation.recipientId ?? null,
      p_run_id: operation.runId ?? null,
      p_step_id: operation.stepId ?? null,
    }
  );
  if (claimError) throw managedDatabaseError(claimError);
  if (!claim?.delivery_id || typeof claim.claimed !== 'boolean')
    throw new ManagedDeliveryError(
      'messaging_claim_missing',
      'No delivery claim was returned. Nothing was sent.'
    );
  if (!claim.claimed) {
    const { data: existing, error } = await db
      .from('messaging_delivery_ledger')
      .select('outcome,provider_message_id')
      .eq('account_id', operation.accountId)
      .eq('id', claim.delivery_id)
      .maybeSingle();
    if (error || !existing || existing.outcome !== 'accepted') {
      throw new ManagedDeliveryError(
        'messaging_attempt_needs_review',
        'A previous attempt exists and will not be retried. Review its provider receipt first.'
      );
    }
    return {
      accepted: true,
      duplicate: true,
      deliveryId: claim.delivery_id,
      messageId: existing.provider_message_id,
    };
  }

  // No further asynchronous work between the successful claim and provider I/O.
  let messageId: string;
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.access_token}`,
        },
        body: payload.wire,
        signal: AbortSignal.timeout(15_000),
      }
    );
    const result = (await response.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { code?: number };
    } | null;
    if (!response.ok) {
      const explicitRejection =
        response.status >= 400 &&
        response.status < 500 &&
        typeof result?.error?.code === 'number';
      await recordResult(
        explicitRejection ? 'failed' : 'uncertain',
        null,
        `meta_${result?.error?.code ?? response.status}`
      );
      throw new ManagedDeliveryError(
        'messaging_provider_rejected',
        'Meta did not accept this attempt. Its reservation is retained; it will not retry automatically.',
        502
      );
    }
    if (!result?.messages?.[0]?.id) throw new Error('Missing provider receipt');
    messageId = result.messages[0].id;
  } catch (error) {
    if (error instanceof ManagedDeliveryError) throw error;
    await recordResult('uncertain', null, 'provider_response_uncertain').catch(
      () => {}
    );
    throw new ManagedDeliveryError(
      'messaging_attempt_uncertain',
      'Delivery is uncertain. The attempt and budget reservation are saved. Check Meta before trying anything further.',
      502
    );
  }
  // If persistence fails, the permanent reserved row still prevents a retry.
  await recordResult('accepted', messageId);
  if (operation.kind === 'broadcast') {
    const { error } = await db
      .from('broadcast_recipients')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        whatsapp_message_id: messageId,
        provider_message_id: messageId,
        attempt_count: 1,
        error_message: null,
      })
      .eq('id', operation.recipientId!)
      .eq('broadcast_id', operation.sourceId)
      .eq('contact_id', operation.contactId);
    if (error)
      throw new ManagedDeliveryError(
        'messaging_receipt_sync_failed',
        'Meta accepted this message. Its receipt is saved, but the campaign view needs reconciliation.'
      );
  } else {
    const id = createHash('sha256')
      .update(`managed:${claim.delivery_id}`)
      .digest('hex')
      .slice(0, 32)
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    const { error } = await db
      .from('messages')
      .upsert(
        {
          id,
          conversation_id: operation.conversationId,
          sender_type: 'bot',
          content_type: payload.contentType,
          content_text: payload.text,
          template_name: payload.templateName ?? null,
          interactive_payload: payload.interactive ?? null,
          message_id: messageId,
          status: 'sent',
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (error)
      throw new ManagedDeliveryError(
        'messaging_receipt_sync_failed',
        'Meta accepted this message. Its receipt is saved, but the Inbox view needs reconciliation.'
      );
    await db
      .from('conversations')
      .update({
        last_message_text: payload.text,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', operation.conversationId!)
      .eq('account_id', operation.accountId)
      .eq('contact_id', operation.contactId);
  }
  return {
    accepted: true,
    duplicate: false,
    deliveryId: claim.delivery_id,
    messageId,
  };

  async function recordResult(
    outcome: string,
    providerId: string | null,
    code: string | null = null
  ) {
    const { error } = await db.rpc('finish_messaging_delivery', {
      p_account_id: operation.accountId,
      p_delivery_id: claim.delivery_id,
      p_outcome: outcome,
      p_provider_message_id: providerId,
      p_result_code: code,
    });
    if (error)
      throw new ManagedDeliveryError(
        'messaging_receipt_save_failed',
        'The delivery result could not be saved. The permanent attempt blocks automatic retry.'
      );
  }
}

const RECIPIENT_BLOCKS = new Set([
  'messaging_documented_opt_in_required',
  'messaging_contact_suppressed',
  'messaging_consent_opted_out',
  'messaging_inbound_opt_out',
  'messaging_india_mobile_required',
  'messaging_contact_not_found',
  'messaging_historical_attempt_requires_review',
]);

/** Bounded pass. Unstarted recipients stay pending and can be continued safely. */
export async function deliverManagedCampaign(
  db: SupabaseClient,
  accountId: string,
  sourceId: string
) {
  const deadline = Date.now() + 210_000;
  const source = await readManagedSource(db, accountId, 'broadcast', sourceId);
  for (const recipient of source.snapshot.children as ManagedRecipient[]) {
    if (Date.now() > deadline) break;
    const { data: row, error } = await db
      .from('broadcast_recipients')
      .select('status')
      .eq('id', recipient.id)
      .eq('broadcast_id', sourceId)
      .maybeSingle();
    if (error) throw new Error('Cannot read campaign progress');
    if (!row || row.status !== 'pending') continue;
    try {
      const result = await dispatchManagedMessage(db, {
        accountId,
        kind: 'broadcast',
        sourceId,
        contactId: recipient.contact,
        recipientId: recipient.id,
      });
      if (result.duplicate && result.messageId) {
        // Receipt repair only; the provider is never called again for this key.
        const { error: updateError } = await db
          .from('broadcast_recipients')
          .update({
            status: 'sent',
            whatsapp_message_id: result.messageId,
            provider_message_id: result.messageId,
            sent_at: new Date().toISOString(),
            attempt_count: 1,
            error_message: null,
          })
          .eq('id', recipient.id)
          .eq('broadcast_id', sourceId);
        if (updateError) throw new Error('Cannot reconcile provider receipt');
      }
    } catch (error) {
      if (
        error instanceof ManagedDeliveryError &&
        RECIPIENT_BLOCKS.has(error.code)
      ) {
        const { error: updateError } = await db
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            suppressed_reason: error.code,
            error_message: error.message,
          })
          .eq('id', recipient.id)
          .eq('broadcast_id', sourceId);
        if (updateError) throw new Error('Cannot record recipient exclusion');
        continue;
      }
      if (
        error instanceof ManagedDeliveryError &&
        [
          'messaging_provider_rejected',
          'messaging_attempt_uncertain',
          'messaging_attempt_needs_review',
          'messaging_receipt_save_failed',
        ].includes(error.code)
      ) {
        await db
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            attempt_count: 1,
            error_message: error.message,
          })
          .eq('id', recipient.id)
          .eq('broadcast_id', sourceId);
      }
      throw error; // Budget, approval, provider and uncertain results stop the pass.
    }
  }
}
