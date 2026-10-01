import type { SupabaseClient } from '@supabase/supabase-js'

import { isOptOutMessage } from '@/lib/whatsapp/consent'

export interface InboundOptOutInput {
  accountId: string
  contactId: string
  messageId: string
  text?: string | null
  at?: string
}

/**
 * Persist a customer STOP-style message as a hard suppression and a
 * WhatsApp marketing opt-out. Returning false means the message was not an
 * opt-out; true means both writes were attempted successfully.
 */
export async function persistInboundOptOut(
  db: SupabaseClient,
  input: InboundOptOutInput,
): Promise<boolean> {
  if (!isOptOutMessage(input.text)) return false

  const at = input.at ?? new Date().toISOString()
  const { error: contactError } = await db
    .from('contacts')
    .update({
      suppressed_at: at,
      suppression_reason: 'recipient_request',
    })
    .eq('id', input.contactId)
    .eq('account_id', input.accountId)
  if (contactError) throw new Error(`Failed to persist contact suppression: ${contactError.message}`)

  const { error: consentError } = await db
    .from('contact_consents')
    .upsert(
      {
        account_id: input.accountId,
        contact_id: input.contactId,
        channel: 'whatsapp',
        category: 'marketing',
        status: 'opted_out',
        source: 'whatsapp_inbound',
        wording_version: 'inbound-opt-out-v1',
        consented_at: null,
        revoked_at: at,
        evidence: {
          message_id: input.messageId,
          text: input.text ?? null,
        },
      },
      { onConflict: 'account_id,contact_id,channel,category' },
    )
  if (consentError) throw new Error(`Failed to persist WhatsApp opt-out consent: ${consentError.message}`)

  return true
}
