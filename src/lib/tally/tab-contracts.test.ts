import { describe, expect, it } from 'vitest'
import { createTallyTabContext, isTallyInternalEvent, promotionalAudienceDecision, resolveTallyContact } from './tab-contracts'

describe('Tally tab contracts', () => {
  const snapshot = { id: 'snapshot-1', checksum: 'a'.repeat(64), periodStart: '2026-01-01', periodEnd: '2026-03-31', reconciliationState: 'reconciled' as const, receivedAt: '2026-10-09T00:00:00Z' }

  it('maps a ledger to one canonical contact and never creates one', () => {
    const result = resolveTallyContact({ ledger: { name: 'Asha', phone: '+91 98765 43210' }, contacts: [{ id: 'contact-1', name: 'Asha', phone: '9876543210' }] })
    expect(result).toMatchObject({ status: 'auto_matched', contactId: 'contact-1' })
  })

  it('keeps missing and shared mappings review-only or blocked', () => {
    expect(resolveTallyContact({ ledger: { name: 'New', phone: '9876543210' }, contacts: [] }).status).toBe('manual_review')
    expect(resolveTallyContact({ ledger: { name: 'Shared', phone: '9876543210' }, contacts: [{ id: 'a', phone: '9876543210' }, { id: 'b', phone: '9876543210' }] }).status).toBe('blocked')
  })

  it('distinguishes reconciled live, historical, stale and missing data', () => {
    expect(createTallyTabContext({ accountId: 'account-1', snapshot, now: new Date('2026-10-09T00:00:00Z') }).dataState).toBe('live_reconciled')
    expect(createTallyTabContext({ accountId: 'account-1', snapshot: { ...snapshot, receivedAt: null } }).dataState).toBe('historical_imported')
    expect(createTallyTabContext({ accountId: 'account-1', snapshot: { ...snapshot, receivedAt: '2026-01-01T00:00:00Z' }, now: new Date('2026-10-09T00:00:00Z') }).dataState).toBe('stale')
    expect(createTallyTabContext({ accountId: 'account-1' }).dataState).toBe('missing')
  })

  it('blocks promotional audiences for stale data but preserves ordinary replies', () => {
    const decision = promotionalAudienceDecision({ dataState: 'stale', reconciliationState: 'blocked', consentState: 'opted_in' })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/stale|unreconciled/)
  })

  it('accepts only internal sync/action events', () => {
    expect(isTallyInternalEvent({ type: 'sync_reconciled', accountId: 'account-1', runId: 'run-1', createdAt: '2026-10-09T00:00:00Z' })).toBe(true)
    expect(isTallyInternalEvent({ type: 'message_send', accountId: 'account-1', runId: 'run-1', createdAt: '2026-10-09T00:00:00Z' })).toBe(false)
  })
})
