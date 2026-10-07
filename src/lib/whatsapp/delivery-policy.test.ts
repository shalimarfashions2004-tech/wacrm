import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDeliveryMode,
  isLiveDeliveryApproved,
  getManualTestApproval,
  isManualTestDeliveryApproved,
  MANUAL_TEST_MESSAGE,
} from './delivery-policy';

describe('delivery policy', () => {
  it('defaults unknown or missing modes to dry-run', () => {
    expect(getDeliveryMode('')).toBe('dry-run');
    expect(getDeliveryMode('unexpected')).toBe('dry-run');
  });

  it('requires both live mode and the explicit approval flag', () => {
    expect(isLiveDeliveryApproved('dry-run', 'true')).toBe(false);
    expect(isLiveDeliveryApproved('live', 'false')).toBe(false);
    expect(isLiveDeliveryApproved('live', 'true')).toBe(true);
  });
});

describe('expiring manual test approval', () => {
  const now = Date.parse('2026-10-07T10:00:00Z');
  const request = {
    phoneNumberId: '1234567890123456',
    to: '15551234567',
    text: MANUAL_TEST_MESSAGE,
  };
  beforeEach(() => {
    vi.stubEnv('MESSAGING_DELIVERY_MODE', 'dry-run');
    vi.stubEnv('MESSAGING_LIVE_APPROVED', 'false');
    vi.stubEnv('MESSAGING_TEST_RECIPIENT', request.to);
    vi.stubEnv('MESSAGING_TEST_PHONE_NUMBER_ID', request.phoneNumberId);
    vi.stubEnv('MESSAGING_TEST_EXPIRES_AT', '2026-10-07T10:30:00Z');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('allows only the exact approved sender, recipient and text without enabling general delivery', () => {
    expect(isManualTestDeliveryApproved(request, now)).toBe(true);
    expect(isLiveDeliveryApproved()).toBe(false);
    expect(
      isManualTestDeliveryApproved({ ...request, to: '15557654321' }, now)
    ).toBe(false);
    expect(
      isManualTestDeliveryApproved(
        { ...request, phoneNumberId: '9999999999999999' },
        now
      )
    ).toBe(false);
    expect(
      isManualTestDeliveryApproved(
        { ...request, text: 'An offer for customers' },
        now
      )
    ).toBe(false);
  });

  it.each([
    '',
    'invalid',
    '2026-10-07T10:00:00Z',
    '2026-10-07T09:59:59Z',
    '2026-10-07T11:00:01Z',
  ])(
    'fails closed for invalid, expired or over-one-hour approval %s',
    (expiry) => {
      vi.stubEnv('MESSAGING_TEST_EXPIRES_AT', expiry);
      expect(getManualTestApproval(now)).toBeNull();
    }
  );

  it.each(['', '*', '+15551234567', '15551234567,15557654321', '123'])(
    'rejects broad or malformed recipients %s',
    (recipient) => {
      vi.stubEnv('MESSAGING_TEST_RECIPIENT', recipient);
      expect(getManualTestApproval(now)).toBeNull();
    }
  );
});
