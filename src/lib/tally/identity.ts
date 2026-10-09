export type IdentityMatchStatus = 'auto_matched' | 'manual_review' | 'blocked'
export type IdentityEvidence = {
  key: 'phone' | 'name' | 'conflict' | 'missing_phone' | 'shared_phone'
  value?: string
  detail: string
}

export type TallyLedgerIdentity = {
  sourceId?: string | null
  name?: string | null
  phone?: string | null
}

export type ExistingContactIdentity = {
  id: string
  name?: string | null
  phone?: string | null
  suppressed_at?: string | null
}

export type MatchResult = {
  status: IdentityMatchStatus
  contactId: string | null
  normalizedPhone: string | null
  evidence: IdentityEvidence[]
}

/** Normalize an Indian contact number to the canonical 91XXXXXXXXXX form. */
export function normalizeTallyPhone(raw: string | null | undefined): string | null {
  if (!raw || !/^[+0-9\s()\-./]+$/.test(raw)) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`
  return /^91[6-9]\d{9}$/.test(digits) ? digits : null
}

export function normalizeTallyName(name: string | null | undefined): string {
  return (name ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Match a staged Tally ledger to CRM contacts. No write or consent decision is
 * made here; callers must persist manual reviews and resolve them separately.
 */
export function matchTallyLedger(input: {
  ledger: TallyLedgerIdentity
  contacts: ExistingContactIdentity[]
}): MatchResult {
  const normalizedPhone = normalizeTallyPhone(input.ledger.phone)
  const ledgerName = normalizeTallyName(input.ledger.name)
  const evidence: IdentityEvidence[] = []
  if (!normalizedPhone) {
    evidence.push({ key: 'missing_phone', detail: input.ledger.phone ? 'Tally phone is invalid or unsupported' : 'Tally ledger has no phone number' })
    if (ledgerName) evidence.push({ key: 'name', value: ledgerName, detail: 'Name alone cannot auto-match a CRM contact' })
    return { status: 'blocked', contactId: null, normalizedPhone: null, evidence }
  }
  evidence.push({ key: 'phone', value: normalizedPhone, detail: 'Normalized Indian phone number' })
  const candidates = input.contacts.filter((contact) => normalizeTallyPhone(contact.phone) === normalizedPhone)
  if (candidates.length === 0) {
    evidence.push({ key: 'conflict', detail: 'No existing CRM contact has this phone number' })
    return { status: 'manual_review', contactId: null, normalizedPhone, evidence }
  }
  if (candidates.length > 1) {
    evidence.push({ key: 'shared_phone', value: normalizedPhone, detail: `Phone is shared by ${candidates.length} CRM contacts` })
    return { status: 'blocked', contactId: null, normalizedPhone, evidence }
  }
  const contact = candidates[0]
  const contactName = normalizeTallyName(contact.name)
  if (ledgerName && contactName && ledgerName !== contactName) {
    evidence.push({ key: 'conflict', detail: 'Phone matches but ledger and CRM names differ' })
    return { status: 'manual_review', contactId: contact.id, normalizedPhone, evidence }
  }
  if (contact.suppressed_at) evidence.push({ key: 'conflict', detail: 'Matched CRM contact is suppressed; suppression must be preserved' })
  evidence.push({ key: 'name', value: contactName || ledgerName, detail: ledgerName && contactName ? 'Normalized names agree' : 'Phone match does not require a name' })
  return { status: 'auto_matched', contactId: contact.id, normalizedPhone, evidence }
}
