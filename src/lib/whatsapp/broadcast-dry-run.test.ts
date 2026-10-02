import { describe, expect, it } from 'vitest';
import { runDryRunBroadcast } from './broadcast-dry-run';

describe('runDryRunBroadcast', () => {
  it('validates recipients and returns provider ids without sending', async () => {
    const result = await runDryRunBroadcast({
      templateName: 'hello_world',
      recipients: [
        { phone: '+91 7356734356', idempotencyKey: 'broadcast:one' },
        { phone: 'not-a-phone', idempotencyKey: 'broadcast:two' },
      ],
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toEqual([
      { phone: '+91 7356734356', status: 'sent', whatsapp_message_id: 'dry_1' },
      { phone: 'not-a-phone', status: 'failed', error: 'Invalid phone number format' },
    ]);
  });

  it('uses a stable fallback idempotency key when one is absent', async () => {
    const result = await runDryRunBroadcast({
      templateName: 'hello_world',
      recipients: [{ phone: '917356734356' }],
    });

    expect(result.results[0]).toMatchObject({
      phone: '917356734356',
      status: 'sent',
      whatsapp_message_id: 'dry_1',
    });
  });
});
