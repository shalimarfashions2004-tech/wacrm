import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendInteractiveButtons,
  sendInteractiveList,
} from './meta-api';
import { issueInboxReplyPermit } from './inbox-reply-permit';
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

describe('production reply capability at the provider boundary', () => {
  const args = {
    phoneNumberId: '1234567890123456',
    accessToken: 'test-token',
    to: '15551234567',
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    vi.stubEnv('MESSAGING_DELIVERY_MODE', 'dry-run');
    vi.stubEnv('MESSAGING_LIVE_APPROVED', 'false');
    vi.stubEnv('MESSAGING_INBOX_REPLIES_APPROVED', 'true');
    vi.stubEnv('MESSAGING_INBOX_PHONE_NUMBER_ID', args.phoneNumberId);
    vi.stubEnv('MESSAGING_INBOX_WABA_ID', '9876543210987654');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ messages: [{ id: 'wamid.reply' }] }), {
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

  it('allows text, media, buttons and lists with a checked reply capability', async () => {
    const inboxReplyPermit = issueInboxReplyPermit(
      args.phoneNumberId,
      args.to,
      Date.now()
    );
    await sendTextMessage({ ...args, inboxReplyPermit, text: 'Reply' });
    await sendMediaMessage({
      ...args,
      inboxReplyPermit,
      kind: 'image',
      link: 'https://example.com/image.png',
    });
    await sendInteractiveButtons({
      ...args,
      inboxReplyPermit,
      bodyText: 'Choose',
      buttons: [{ id: 'a', title: 'One' }],
    });
    await sendInteractiveList({
      ...args,
      inboxReplyPermit,
      bodyText: 'Choose',
      buttonLabel: 'Open',
      sections: [{ title: 'Options', rows: [{ id: 'a', title: 'One' }] }],
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('rejects a JSON-shaped forgery, another recipient, an expired window and a revoked flag', async () => {
    const permit = issueInboxReplyPermit(
      args.phoneNumberId,
      args.to,
      Date.now()
    );
    await expect(
      sendTextMessage({
        ...args,
        text: 'Reply',
        inboxReplyPermit: { ...permit },
      })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    await expect(
      sendTextMessage({
        ...args,
        to: '15557654321',
        text: 'Reply',
        inboxReplyPermit: permit,
      })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    vi.advanceTimersByTime(30_001);
    await expect(
      sendTextMessage({ ...args, text: 'Reply', inboxReplyPermit: permit })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    const next = issueInboxReplyPermit(args.phoneNumberId, args.to, Date.now());
    vi.stubEnv('MESSAGING_INBOX_REPLIES_APPROVED', 'false');
    await expect(
      sendTextMessage({ ...args, text: 'Reply', inboxReplyPermit: next })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps workers and templates blocked even when the Inbox flag is enabled', async () => {
    await expect(
      sendTextMessage({ ...args, text: 'Automated' })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    await expect(
      sendMediaMessage({
        ...args,
        kind: 'image',
        link: 'https://example.com/image.png',
      })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    await expect(
      sendTemplateMessage({ ...args, templateName: 'promo', language: 'en' })
    ).rejects.toThrow('Live WhatsApp delivery is disabled');
    expect(fetch).not.toHaveBeenCalled();
  });
});
