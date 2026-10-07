import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendTextMessage, sendTemplateMessage } from './meta-api';
import { MANUAL_TEST_MESSAGE } from './delivery-policy';

describe('provider boundary for manual tests', () => {
  const args = {
    phoneNumberId: '1234567890123456',
    accessToken: 'test-token',
    to: '15551234567',
    text: MANUAL_TEST_MESSAGE,
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    vi.stubEnv('MESSAGING_DELIVERY_MODE', 'dry-run');
    vi.stubEnv('MESSAGING_LIVE_APPROVED', 'false');
    vi.stubEnv('MESSAGING_TEST_RECIPIENT', args.to);
    vi.stubEnv('MESSAGING_TEST_PHONE_NUMBER_ID', args.phoneNumberId);
    vi.stubEnv('MESSAGING_TEST_EXPIRES_AT', '2026-10-07T10:30:00Z');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), {
            status: 200,
          })
      )
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('allows the explicitly marked, exact manual text test', async () => {
    await expect(
      sendTextMessage({ ...args, manualTest: true })
    ).resolves.toEqual({ messageId: 'wamid.test' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary text/automation and template sends blocked', async () => {
    await expect(sendTextMessage(args)).rejects.toThrow(
      'Live WhatsApp delivery is disabled'
    );
    await expect(
      sendTemplateMessage({
        ...args,
        templateName: 'hello_world',
        language: 'en_US',
      })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a changed target, text or expired approval before any network request', async () => {
    await expect(
      sendTextMessage({ ...args, manualTest: true, to: '15557654321' })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    await expect(
      sendTextMessage({ ...args, manualTest: true, text: 'Different message' })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    vi.setSystemTime(new Date('2026-10-07T10:30:00Z'));
    await expect(
      sendTextMessage({ ...args, manualTest: true })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    expect(fetch).not.toHaveBeenCalled();
  });
});
