import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMessageToConversation } from './send-message';
import { MANUAL_TEST_MESSAGE } from './delivery-policy';
import { sendTextMessage } from './meta-api';

vi.mock('./meta-api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendTextMessage: vi.fn(),
}));
vi.mock('./encryption', () => ({
  decrypt: (v: string) => v,
  isLegacyFormat: () => false,
}));
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      }),
    }),
  }),
}));

const recipient = '15551234567';
const sender = '1234567890123456';
const now = new Date('2026-10-07T10:00:00Z');
const params = {
  conversationId: 'cv-1',
  messageType: 'text',
  contentText: MANUAL_TEST_MESSAGE,
};
const manual = { source: 'manual-inbox' } as const;

function testDb(
  options: {
    phone?: string;
    sender?: string;
    suppressedAt?: string;
    inboundAt?: string | null;
    inboundError?: boolean;
    claimError?: boolean;
  } = {}
) {
  const claims = new Map<string, Record<string, unknown>>();
  const filters: unknown[][] = [];
  const writes: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      let row: Record<string, unknown> | undefined;
      let operation = 'read';
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => {
          filters.push([table, 'eq', ...args]);
          return builder;
        },
        not: (...args: unknown[]) => {
          filters.push([table, 'not', ...args]);
          return builder;
        },
        gte: (...args: unknown[]) => {
          filters.push([table, 'gte', ...args]);
          return builder;
        },
        lte: (...args: unknown[]) => {
          filters.push([table, 'lte', ...args]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        insert: (value: Record<string, unknown>) => {
          operation = 'insert';
          row = value;
          return builder;
        },
        update: (value: Record<string, unknown>) => {
          operation = 'update';
          row = value;
          return builder;
        },
        maybeSingle: async () => ({
          data:
            options.inboundAt === null
              ? null
              : { created_at: options.inboundAt ?? '2026-10-07T09:55:00Z' },
          error: options.inboundError ? { message: 'read failed' } : null,
        }),
        single: async () => {
          if (table === 'conversations')
            return {
              data: {
                id: 'cv-1',
                contact: {
                  id: 'ct-1',
                  phone: options.phone ?? recipient,
                  suppressed_at: options.suppressedAt,
                },
              },
              error: null,
            };
          if (table === 'whatsapp_config')
            return {
              data: {
                id: 'cfg-1',
                phone_number_id: options.sender ?? sender,
                access_token: 'test-token',
              },
              error: null,
            };
          if (table === 'messages' && operation === 'update' && row) {
            writes.push(row);
            return { data: { id: [...claims.keys()][0] }, error: null };
          }
          throw new Error(`Unexpected single query: ${table}/${operation}`);
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (table === 'messages' && operation === 'insert' && row) {
            if (options.claimError)
              return resolve({ error: { code: '42501' } });
            const id = String(row.id);
            if (claims.has(id)) return resolve({ error: { code: '23505' } });
            claims.set(id, row);
          }
          return resolve({ error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, claims, filters, writes };
}

describe('restricted manual inbox test', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('MESSAGING_DELIVERY_MODE', 'dry-run');
    vi.stubEnv('MESSAGING_LIVE_APPROVED', 'false');
    vi.stubEnv('MESSAGING_TEST_RECIPIENT', recipient);
    vi.stubEnv('MESSAGING_TEST_PHONE_NUMBER_ID', sender);
    vi.stubEnv('MESSAGING_TEST_EXPIRES_AT', '2026-10-07T10:30:00Z');
    vi.mocked(sendTextMessage)
      .mockReset()
      .mockResolvedValue({ messageId: 'wamid.test' });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('keeps the public/shared default path closed before reading any data', async () => {
    const db = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(
      sendMessageToConversation(db, 'acct-1', params)
    ).rejects.toMatchObject({ code: 'delivery_disabled' });
    expect(db.from).not.toHaveBeenCalled();
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('requires configured approval and the exact text even on the inbox path', async () => {
    const db = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(
      sendMessageToConversation(
        db,
        'acct-1',
        { ...params, contentText: 'crm test' },
        manual
      )
    ).rejects.toMatchObject({
      code: 'delivery_disabled',
      message: `Only the approved text test is enabled. Send this exact text without quotation marks: ${MANUAL_TEST_MESSAGE}`,
    });
    vi.stubEnv('MESSAGING_TEST_EXPIRES_AT', '');
    await expect(
      sendMessageToConversation(db, 'acct-1', params, manual)
    ).rejects.toMatchObject({ code: 'delivery_disabled' });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('reserves one attempt and records the Meta receipt for the exact target', async () => {
    const { db, claims, filters, writes } = testDb();
    const result = await sendMessageToConversation(
      db,
      'acct-1',
      params,
      manual
    );
    expect(result.whatsappMessageId).toBe('wamid.test');
    expect(claims.size).toBe(1);
    expect(claims.get(result.messageId)?.status).toBe('sending');
    expect(writes).toContainEqual(
      expect.objectContaining({
        message_id: 'wamid.test',
        status: 'sent',
        content_text: MANUAL_TEST_MESSAGE,
      })
    );
    expect(sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: recipient,
        phoneNumberId: sender,
        text: MANUAL_TEST_MESSAGE,
        manualTest: true,
      })
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        ['conversations', 'eq', 'account_id', 'acct-1'],
        ['whatsapp_config', 'eq', 'account_id', 'acct-1'],
        ['messages', 'eq', 'conversation_id', 'cv-1'],
        ['messages', 'eq', 'sender_type', 'customer'],
        ['messages', 'not', 'message_id', 'is', null],
        ['messages', 'gte', 'created_at', '2026-10-06T10:00:00.000Z'],
      ])
    );
  });

  it.each([
    { phone: '15557654321' },
    { sender: '9999999999999999' },
    { suppressedAt: now.toISOString() },
    { inboundAt: null },
    { inboundAt: 'invalid' },
    { inboundAt: '2026-10-06T09:59:59Z' },
    { inboundAt: '2026-10-07T10:00:01Z' },
    { inboundError: true },
  ])(
    'fails closed for mismatched, suppressed or ineligible conversation %j',
    async (options) => {
      const { db, claims } = testDb(options);
      await expect(
        sendMessageToConversation(db, 'acct-1', params, manual)
      ).rejects.toMatchObject({ code: 'delivery_disabled' });
      expect(claims.size).toBe(0);
      expect(sendTextMessage).not.toHaveBeenCalled();
    }
  );

  it('blocks a double click before a second provider call', async () => {
    const { db, claims } = testDb();
    const results = await Promise.allSettled([
      sendMessageToConversation(db, 'acct-1', params, manual),
      sendMessageToConversation(db, 'acct-1', params, manual),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ code: 'test_already_attempted' }),
      })
    );
    expect(claims.size).toBe(1);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
  });

  it('retains the reservation after a provider timeout and prevents a retry', async () => {
    const { db, claims } = testDb();
    vi.mocked(sendTextMessage).mockRejectedValueOnce(new Error('Timed out'));
    await expect(
      sendMessageToConversation(db, 'acct-1', params, manual)
    ).rejects.toMatchObject({ code: 'test_delivery_unconfirmed' });
    await expect(
      sendMessageToConversation(db, 'acct-1', params, manual)
    ).rejects.toMatchObject({ code: 'test_already_attempted' });
    expect(claims.size).toBe(1);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
  });

  it('does not contact Meta if the durable reservation fails', async () => {
    const { db } = testDb({ claimError: true });
    await expect(
      sendMessageToConversation(db, 'acct-1', params, manual)
    ).rejects.toMatchObject({ code: 'db_error' });
    expect(sendTextMessage).not.toHaveBeenCalled();
  });
});
