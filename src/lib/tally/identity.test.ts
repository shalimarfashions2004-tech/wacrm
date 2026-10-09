import { describe, expect, it } from 'vitest'
import { matchTallyLedger, normalizeTallyPhone } from './identity'

const contact = (id: string, name: string, phone: string, extra: Record<string, unknown> = {}) => ({ id, name, phone, ...extra })

describe('Tally identity mapping', () => {
  it('normalizes an Indian phone and auto-matches it', () => {
    expect(normalizeTallyPhone('+91 98765-43210')).toBe('919876543210')
    expect(matchTallyLedger({ ledger: { name: 'Asha Menon', phone: '09876543210' }, contacts: [contact('c1', 'Asha Menon', '919876543210')] })).toMatchObject({ status: 'auto_matched', contactId: 'c1', normalizedPhone: '919876543210' })
  })
  it('blocks shared phones rather than choosing a contact', () => {
    const result = matchTallyLedger({ ledger: { name: 'Asha', phone: '9876543210' }, contacts: [contact('c1', 'Asha', '9876543210'), contact('c2', 'Arun', '919876543210')] })
    expect(result).toMatchObject({ status: 'blocked', contactId: null })
    expect(result.evidence.some((item) => item.key === 'shared_phone')).toBe(true)
  })
  it('blocks missing phones even when a name is present', () => {
    expect(matchTallyLedger({ ledger: { name: 'Asha Menon' }, contacts: [contact('c1', 'Asha Menon', '9876543210')] })).toMatchObject({ status: 'blocked', contactId: null })
  })
  it('accepts punctuation and case variants in names', () => {
    expect(matchTallyLedger({ ledger: { name: '  Asha-MENON  ', phone: '9876543210' }, contacts: [contact('c1', 'Asha Menon', '+91 98765 43210')] })).toMatchObject({ status: 'auto_matched', contactId: 'c1' })
  })
  it('keeps a phone/name conflict in manual review', () => {
    expect(matchTallyLedger({ ledger: { name: 'Arun', phone: '9876543210' }, contacts: [contact('c1', 'Asha Menon', '9876543210')] })).toMatchObject({ status: 'manual_review', contactId: 'c1' })
  })
  it('requires review for a phone with no existing CRM contact', () => {
    expect(matchTallyLedger({ ledger: { name: 'Asha', phone: '9876543210' }, contacts: [] })).toMatchObject({ status: 'manual_review', contactId: null })
  })
  it('does not turn a suppressed contact into an unsuppressed one', () => {
    const result = matchTallyLedger({ ledger: { name: 'Asha', phone: '9876543210' }, contacts: [contact('c1', 'Asha', '9876543210', { suppressed_at: '2026-01-01T00:00:00Z' })] })
    expect(result).toMatchObject({ status: 'auto_matched', contactId: 'c1' })
    expect(result.evidence.some((item) => item.detail.includes('suppressed'))).toBe(true)
  })
})
