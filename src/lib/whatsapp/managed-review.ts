import type { SupabaseClient } from '@supabase/supabase-js';
import {
  sourceTemplate,
  type ManagedSnapshot,
  type ManagedRecipient,
} from './managed-source';

/** Review only. The database repeats authoritative checks for every attempt. */
export async function reviewManagedAudience(
  db: SupabaseClient,
  accountId: string,
  snapshot: ManagedSnapshot
) {
  const template = sourceTemplate(
    snapshot,
    snapshot.source.template ?? '',
    snapshot.source.language
  );
  const category = template.category.toLowerCase();
  const recipients = snapshot.children as ManagedRecipient[];
  let eligible = 0;
  let excluded = 0;
  let attempted = 0;
  for (let i = 0; i < recipients.length; i += 400) {
    const batch = recipients.slice(i, i + 400);
    const ids = batch.map((r) => r.contact).filter(Boolean);
    const [contacts, consents, rows, ledger] = await Promise.all([
      db
        .from('contacts')
        .select('id,phone,suppressed_at')
        .eq('account_id', accountId)
        .in('id', ids),
      db
        .from('contact_consents')
        .select(
          'contact_id,category,status,source,wording_version,consented_at,revoked_at'
        )
        .eq('account_id', accountId)
        .eq('channel', 'whatsapp')
        .in('category', [category, 'service'])
        .in('contact_id', ids),
      db
        .from('broadcast_recipients')
        .select('id,status,sent_at,whatsapp_message_id,attempt_count')
        .eq('broadcast_id', snapshot.source.id)
        .in(
          'id',
          batch.map((r) => r.id)
        ),
      db
        .from('messaging_delivery_ledger')
        .select('contact_id')
        .eq('account_id', accountId)
        .eq('source_kind', 'broadcast')
        .eq('source_id', snapshot.source.id)
        .in('contact_id', ids),
    ]);
    if (contacts.error || consents.error || rows.error || ledger.error)
      throw new Error('Cannot verify the campaign audience');
    for (const recipient of batch) {
      const row = rows.data?.find((r) => r.id === recipient.id);
      if (
        !row ||
        row.status !== 'pending' ||
        row.sent_at ||
        row.whatsapp_message_id ||
        row.attempt_count > 0 ||
        ledger.data?.some((r) => r.contact_id === recipient.contact)
      ) {
        attempted++;
        continue;
      }
      const contact = contacts.data?.find((c) => c.id === recipient.contact);
      const records =
        consents.data?.filter((c) => c.contact_id === recipient.contact) ?? [];
      const optedIn = records.find(
        (c) =>
          c.category === category &&
          c.status === 'opted_in' &&
          c.source?.trim() &&
          c.wording_version?.trim() &&
          c.consented_at &&
          Date.parse(c.consented_at) <= Date.now() &&
          !c.revoked_at
      );
      if (
        !contact ||
        contact.suppressed_at ||
        !/^91[6-9][0-9]{9}$/.test(
          (contact.phone ?? '').replace(/[^0-9]/g, '')
        ) ||
        !optedIn ||
        records.some((c) => c.status === 'opted_out')
      )
        excluded++;
      else eligible++;
    }
  }
  return { total: recipients.length, eligible, excluded, attempted };
}
