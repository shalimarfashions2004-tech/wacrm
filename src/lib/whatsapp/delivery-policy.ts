export type DeliveryMode = 'dry-run' | 'live';

/**
 * Live delivery is opt-in twice: the mode must be explicitly set to live
 * and an operator must set the separate approval flag. Keeping the policy
 * in one small module prevents dashboard, public API and worker paths from
 * silently growing different send gates.
 */
export function getDeliveryMode(raw = process.env.MESSAGING_DELIVERY_MODE): DeliveryMode {
  return raw === 'live' ? 'live' : 'dry-run';
}

export function isLiveDeliveryApproved(
  mode = getDeliveryMode(),
  approval = process.env.MESSAGING_LIVE_APPROVED,
): boolean {
  return mode === 'live' && approval === 'true';
}

export const DELIVERY_DISABLED_MESSAGE =
  'Live WhatsApp delivery is disabled. Use dry-run until credentials, consent evidence, budget controls and owner approval have been reviewed.';
