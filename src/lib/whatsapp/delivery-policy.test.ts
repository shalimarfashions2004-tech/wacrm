import { describe, expect, it } from 'vitest';
import { getDeliveryMode, isLiveDeliveryApproved } from './delivery-policy';

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
