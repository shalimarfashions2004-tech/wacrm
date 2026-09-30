import type { Contact, ConsentCategory, ContactConsent } from '@/types';

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  'marketing',
  'utility',
  'service',
  'authentication',
];

export function consentCategoryForTemplate(category: string | null | undefined): ConsentCategory {
  const normalized = (category ?? '').toLowerCase();
  if (normalized === 'utility') return 'utility';
  if (normalized === 'authentication') return 'authentication';
  return 'marketing';
}

const OPT_OUT_PATTERN = /^(stop|unsubscribe|remove|cancel|opt[ -]?out|വേണ്ട|ഒഴിവാക്കുക)$/iu;

export function isOptOutMessage(text: string | null | undefined): boolean {
  return OPT_OUT_PATTERN.test((text ?? '').trim());
}

/** Marketing is never inferred from an imported phone number or a past order. */
export function isSuppressedForCategory(
  contact: Pick<Contact, 'suppressed_at' | 'suppression_reason' | 'consent'>,
  category: ConsentCategory,
): boolean {
  if (contact.suppressed_at) return true;
  const row = contact.consent?.find(
    (candidate) => candidate.channel === 'whatsapp' && candidate.category === category,
  );
  if (category === 'marketing') return row?.status !== 'opted_in';
  return row?.status === 'opted_out';
}

export function createConsentEvent(input: Omit<ContactConsent, 'id'>): Omit<ContactConsent, 'id'> {
  if (!input.contact_id || !input.account_id || !input.source || !input.wording_version) {
    throw new Error('Consent evidence requires contact, account, source and wording version');
  }
  if (!CONSENT_CATEGORIES.includes(input.category)) throw new Error('Unsupported consent category');
  return { ...input, consented_at: input.status === 'opted_in' ? input.consented_at ?? new Date().toISOString() : null, revoked_at: input.status === 'opted_out' ? input.revoked_at ?? new Date().toISOString() : null };
}

export function applyOptOut(contact: Contact, reason = 'recipient_request', at = new Date().toISOString()): Contact {
  return { ...contact, suppressed_at: at, suppression_reason: reason, consent: (contact.consent ?? []).map((row) => row.category === 'marketing' && row.channel === 'whatsapp' ? { ...row, status: 'opted_out', revoked_at: at } : row) };
}

export function filterContactsForCategory(
  contacts: Contact[],
  category: ConsentCategory,
): { eligible: Contact[]; suppressed: Contact[] } {
  const eligible: Contact[] = [];
  const suppressed: Contact[] = [];
  for (const contact of contacts) {
    if (isSuppressedForCategory(contact, category)) suppressed.push(contact);
    else eligible.push(contact);
  }
  return { eligible, suppressed };
}
