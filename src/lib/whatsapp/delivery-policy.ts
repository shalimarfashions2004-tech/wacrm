export type DeliveryMode = 'dry-run' | 'live';

/**
 * Live delivery is opt-in twice: the mode must be explicitly set to live
 * and an operator must set the separate approval flag. Keeping the policy
 * in one small module prevents dashboard, public API and worker paths from
 * silently growing different send gates.
 */
export function getDeliveryMode(
  raw = process.env.MESSAGING_DELIVERY_MODE
): DeliveryMode {
  return raw === 'live' ? 'live' : 'dry-run';
}

export function isLiveDeliveryApproved(
  mode = getDeliveryMode(),
  approval = process.env.MESSAGING_LIVE_APPROVED
): boolean {
  return mode === 'live' && approval === 'true';
}

export const DELIVERY_DISABLED_MESSAGE =
  'Live WhatsApp delivery is disabled. Use dry-run until credentials, consent evidence, budget controls and owner approval have been reviewed.';

export const MANUAL_TEST_MESSAGE = 'Shalimar Connect test — please reply OK.';

/** Server-only, expiring approval for a fixed-text manual inbox test. */
export function getManualTestApproval(now = Date.now()) {
  const recipient = process.env.MESSAGING_TEST_RECIPIENT ?? '';
  const phoneNumberId = process.env.MESSAGING_TEST_PHONE_NUMBER_ID ?? '';
  const expiresAt = Date.parse(process.env.MESSAGING_TEST_EXPIRES_AT ?? '');
  if (
    !/^[1-9]\d{7,14}$/.test(recipient) ||
    !/^\d+$/.test(phoneNumberId) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    expiresAt - now > 60 * 60 * 1000
  ) {
    return null;
  }
  return { recipient, phoneNumberId, expiresAt };
}

export function isManualTestDeliveryApproved(
  request: { phoneNumberId: string; to: string; text: string },
  now = Date.now()
): boolean {
  const approval = getManualTestApproval(now);
  return Boolean(
    approval &&
    request.phoneNumberId === approval.phoneNumberId &&
    request.to === approval.recipient &&
    request.text === MANUAL_TEST_MESSAGE
  );
}
