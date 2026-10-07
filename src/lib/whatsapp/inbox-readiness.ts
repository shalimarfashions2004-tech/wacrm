import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getInboxReplyApproval,
  isLiveDeliveryApproved,
} from './delivery-policy';

export interface InboxReadiness {
  enabled: boolean;
  message: string;
  generalDeliveryEnabled: boolean;
}

/** Schema-only reads through the signed-in account; no customer rows returned. */
export async function readInboxReadiness(
  db: SupabaseClient,
  accountId: string,
  config: { phone_number_id: string; waba_id?: string | null }
): Promise<InboxReadiness> {
  const result = (enabled: boolean, message: string): InboxReadiness => ({
    enabled,
    message,
    generalDeliveryEnabled: isLiveDeliveryApproved(),
  });
  const approval = getInboxReplyApproval();
  if (!approval) return result(false, 'Inbox replies are disabled.');
  if (
    config.phone_number_id !== approval.phoneNumberId ||
    config.waba_id !== approval.wabaId
  ) {
    return result(
      false,
      'Inbox replies are blocked: the saved connection does not match the approved sender.'
    );
  }
  const [contacts, consents] = await Promise.all([
    db
      .from('contacts')
      .select('id, suppressed_at')
      .eq('account_id', accountId)
      .limit(0),
    db
      .from('contact_consents')
      .select('id, category, status')
      .eq('account_id', accountId)
      .limit(0),
  ]);
  if (contacts.error || consents.error) {
    return result(
      false,
      'Inbox replies are blocked: contact safety records are unavailable.'
    );
  }
  return result(
    true,
    'Inbox replies are enabled for customer messages received within the last 24 hours. Each reply is checked for opt-outs before sending.'
  );
}
