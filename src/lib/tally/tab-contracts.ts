import { matchTallyLedger, type ExistingContactIdentity, type TallyLedgerIdentity } from './identity'

export type TallyReconciliationState = 'reconciled' | 'pending' | 'blocked'
export type TallyDataState = 'live_reconciled' | 'historical_imported' | 'stale' | 'missing'
export type TallyConsentState = 'opted_in' | 'opted_out' | 'unknown'

export interface TallyTabContext {
  /** The account and canonical CRM contact this context belongs to. */
  accountId: string
  contactId: string | null
  sourceSnapshot: { id: string; checksum: string | null } | null
  sourcePeriod: { start: string; end: string } | null
  reconciliationState: TallyReconciliationState
  consentState: TallyConsentState
  evidenceLinks: string[]
  dataState: TallyDataState
}

export interface TallySnapshotInput {
  id?: string | null
  checksum?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  reconciliationState?: TallyReconciliationState | null
  receivedAt?: string | null
}

const DEFAULT_STALE_DAYS = 7

/** Build the one context shape shared by CRM tabs. This is read-only. */
export function createTallyTabContext(input: {
  accountId: string
  contactId?: string | null
  snapshot?: TallySnapshotInput | null
  consentState?: TallyConsentState
  evidenceLinks?: string[]
  now?: Date
  staleAfterDays?: number
}): TallyTabContext {
  if (!input.accountId.trim()) throw new Error('Tally tab context requires an account')
  const snapshot = input.snapshot ?? null
  const state = snapshotState(snapshot, input.now ?? new Date(), input.staleAfterDays ?? DEFAULT_STALE_DAYS)
  return {
    accountId: input.accountId,
    contactId: input.contactId ?? null,
    sourceSnapshot: snapshot?.id ? { id: snapshot.id, checksum: snapshot.checksum ?? null } : null,
    sourcePeriod: snapshot?.periodStart && snapshot.periodEnd ? { start: snapshot.periodStart, end: snapshot.periodEnd } : null,
    reconciliationState: snapshot?.reconciliationState ?? 'pending',
    consentState: input.consentState ?? 'unknown',
    evidenceLinks: [...new Set((input.evidenceLinks ?? []).filter((link) => link.trim()))],
    dataState: state,
  }
}

export function snapshotState(snapshot: TallySnapshotInput | null, now = new Date(), staleAfterDays = DEFAULT_STALE_DAYS): TallyDataState {
  if (!snapshot?.id) return 'missing'
  if (snapshot.reconciliationState !== 'reconciled') return 'stale'
  if (!snapshot.receivedAt) return 'historical_imported'
  const age = now.getTime() - Date.parse(snapshot.receivedAt)
  if (!Number.isFinite(age) || age > staleAfterDays * 86400000) return 'stale'
  return 'live_reconciled'
}

/** Identity matching never creates a CRM row; unresolved results remain review-only. */
export function resolveTallyContact(input: { ledger: TallyLedgerIdentity; contacts: ExistingContactIdentity[] }) {
  return matchTallyLedger(input)
}

export function promotionalAudienceDecision(context: Pick<TallyTabContext, 'dataState' | 'reconciliationState' | 'consentState'>): { allowed: boolean; reason: string | null } {
  if (context.reconciliationState !== 'reconciled' || context.dataState === 'stale' || context.dataState === 'missing') {
    return { allowed: false, reason: 'Tally data is stale or unreconciled' }
  }
  if (context.consentState !== 'opted_in') return { allowed: false, reason: 'Marketing consent is not recorded' }
  return { allowed: true, reason: null }
}

export interface TallyInternalEvent {
  type: 'sync_received' | 'sync_reconciled' | 'sync_blocked' | 'action_required'
  accountId: string
  runId: string
  createdAt: string
}

/** Only internal sync/action events may enter automation/notification loaders. */
export function isTallyInternalEvent(value: unknown): value is TallyInternalEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return ['sync_received', 'sync_reconciled', 'sync_blocked', 'action_required'].includes(String(event.type))
    && typeof event.accountId === 'string' && event.accountId.length > 0
    && typeof event.runId === 'string' && event.runId.length > 0
    && typeof event.createdAt === 'string' && !Number.isNaN(Date.parse(event.createdAt))
}
