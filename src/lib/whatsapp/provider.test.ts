import { describe, expect, it } from 'vitest';
import { createMessagingProvider, DryRunProvider } from './provider';

describe('provider boundary', () => {
  it('defaults to a non-delivering provider', async () => {
    const provider = createMessagingProvider();
    expect(provider).toBeInstanceOf(DryRunProvider);
    await expect(provider.send({ idempotencyKey: 'c1:r1', to: '919876543210', category: 'marketing', templateName: 'new_stock' })).resolves.toMatchObject({ status: 'dry_run' });
  });
  it('does not silently enable live delivery', () => {
    expect(() => createMessagingProvider('live')).toThrow(/approval-gated/);
  });
});
