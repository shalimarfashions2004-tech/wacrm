export const MANAGED_RATE = Object.freeze({
  reservationPaise: 200,
  reviewedAt: '2026-10-07T10:00:00Z',
  validUntil: '2026-10-31T18:30:00Z',
  source:
    'https://whatsappbusiness.com/products/platform-pricing/ — India marketing/utility/service; conservative INR 2 reservation; reviewed 2026-10-07',
});

/** Sender binding is also available for read-only checks while delivery is off. */
export function configuredManagedSender() {
  const phoneNumberId = process.env.MESSAGING_INBOX_PHONE_NUMBER_ID?.trim();
  const wabaId = process.env.MESSAGING_INBOX_WABA_ID?.trim();
  if (
    !phoneNumberId ||
    !/^\d+$/.test(phoneNumberId) ||
    !wabaId ||
    !/^\d+$/.test(wabaId)
  )
    return null;
  return { phoneNumberId, wabaId };
}

export function managedSender() {
  return process.env.MESSAGING_MANAGED_DELIVERY_APPROVED === 'true'
    ? configuredManagedSender()
    : null;
}

export class ManagedDeliveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409
  ) {
    super(message);
  }
}

const messages: Record<string, string> = {
  messaging_managed_disabled:
    'Campaigns and automatic messages are paused. Check WhatsApp campaign settings.',
  messaging_rate_review_required:
    'The message cost allowance needs review before sending.',
  messaging_policy_missing:
    'The monthly budget has not been installed for this account.',
  messaging_source_changed:
    'The saved message, audience or budget changed. Review it and approve again.',
  messaging_approval_required:
    'An admin must approve this saved campaign or workflow before sending.',
  messaging_documented_opt_in_required:
    'This contact has no documented permission for this message category.',
  messaging_contact_suppressed: 'This contact has opted out of messages.',
  messaging_consent_opted_out:
    'This contact has opted out of this message category.',
  messaging_inbound_opt_out:
    'The latest customer message is an opt-out request.',
  messaging_service_window_closed:
    'Automatic replies require a customer message received within the last 24 hours.',
  messaging_monthly_budget_exhausted:
    'The monthly message allowance is exhausted. No further money was reserved.',
  messaging_historical_attempt_requires_review:
    'This recipient has a previous attempt that needs review. It will not be resent automatically.',
  messaging_india_mobile_required:
    'This rollout supports Indian mobile numbers only.',
  messaging_template_not_approved:
    'Sync an approved WhatsApp template before sending.',
  messaging_category_unsupported:
    'This rollout supports marketing, utility and in-window service messages.',
};

export function managedDatabaseError(error: {
  message?: string;
  code?: string;
}): ManagedDeliveryError {
  if (
    ['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(
      error.code ?? ''
    )
  ) {
    return new ManagedDeliveryError(
      'messaging_database_update_required',
      'The final campaign database update is needed before these controls can be used.'
    );
  }
  const code =
    error.message?.match(/messaging_[a-z_]+/)?.[0] ??
    'messaging_database_unavailable';
  return new ManagedDeliveryError(
    code,
    messages[code] ??
      'The message safety check could not be completed. Refresh and review the saved setup.'
  );
}

export interface ManagedBudget {
  enabled: boolean;
  monthlyLimitPaise: number;
  reservedPaise: number;
  remainingPaise: number;
  reservationPaise: number | null;
  rateValidUntil: string | null;
  rateSource: string | null;
  needsReviewCount: number;
  phoneNumberId: string;
  wabaId: string;
}

export function managedBudgetReady(
  budget: ManagedBudget,
  now = Date.now()
): boolean {
  const sender = managedSender();
  return Boolean(
    sender &&
    budget.enabled &&
    budget.phoneNumberId === sender.phoneNumberId &&
    budget.wabaId === sender.wabaId &&
    budget.reservationPaise &&
    budget.reservationPaise > 0 &&
    budget.rateValidUntil &&
    Date.parse(budget.rateValidUntil) > now
  );
}
