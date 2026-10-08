import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate } from '@/types';
import { createHash } from 'node:crypto';
import { dispatchManagedMessage } from './managed-delivery';
import { readManagedSource, type ManagedSource } from './managed-source';
import {
  managedConfig,
  verifyManagedProvider,
  verifyManagedTemplates,
} from './managed-provider';

vi.mock('./managed-source', async (original) => ({
  ...(await original<object>()),
  readManagedSource: vi.fn(),
}));
vi.mock('./managed-provider', () => ({
  managedConfig: vi.fn(),
  verifyManagedProvider: vi.fn(),
  verifyManagedTemplates: vi.fn(),
}));
const template: MessageTemplate = {
  id: 't',
  user_id: 'u',
  name: 'notice',
  category: 'Marketing',
  language: 'en_US',
  body_text: 'Hello {{1}}',
  created_at: '2026-01-01',
  status: 'APPROVED',
  meta_template_id: 'meta-t',
};
const op = {
  accountId: 'a',
  kind: 'broadcast' as const,
  sourceId: 'b',
  contactId: 'c',
  recipientId: 'r',
};
function fixture(): ManagedSource {
  return {
    fingerprint: 'a'.repeat(64),
    snapshot: {
      source: {
        id: 'b',
        name: 'Saved campaign',
        template: 'notice',
        language: 'en_US',
      },
      children: [
        { id: 'r', contact: 'c', phone: '919000000001', params: ['customer'] },
      ],
      templates: [template],
      sender: { phone: '123', waba: '456' },
      policy: {
        phone: '123',
        waba: '456',
        limit: 100000,
        reservation: 200,
        rate_valid_until: '2026-11-01',
      },
    },
  };
}
function database(
  options: {
    claimError?: string;
    duplicate?: boolean;
    outcome?: string;
    finishError?: boolean;
    wrongConversation?: boolean;
  } = {}
) {
  const events: string[] = [];
  const filters: unknown[][] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    void args;
    events.push(name);
    if (name === 'claim_messaging_delivery')
      return {
        data: { claimed: !options.duplicate, delivery_id: 'd' },
        error: options.claimError ? { message: options.claimError } : null,
      };
    return {
      data: null,
      error: options.finishError ? { message: 'failed' } : null,
    };
  });
  const db = {
    rpc,
    from(table: string) {
      const builder = {
        select: () => builder,
        update: () => builder,
        upsert: () => builder,
        eq: (...args: unknown[]) => {
          filters.push([table, ...args]);
          return builder;
        },
        maybeSingle: async () => ({
          data:
            table === 'contacts'
              ? { phone: '919000000001' }
              : table === 'conversations'
                ? options.wrongConversation
                  ? null
                  : { id: 'cv' }
                : {
                    outcome: options.outcome ?? 'accepted',
                    provider_message_id: 'wamid.saved',
                  },
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: null, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, rpc, events, filters };
}
describe('managed delivery boundary', () => {
  beforeEach(() => {
    vi.stubEnv('MESSAGING_MANAGED_DELIVERY_APPROVED', 'true');
    vi.stubEnv('MESSAGING_INBOX_PHONE_NUMBER_ID', '123');
    vi.stubEnv('MESSAGING_INBOX_WABA_ID', '456');
    vi.mocked(readManagedSource).mockResolvedValue(fixture());
    vi.mocked(managedConfig).mockResolvedValue({
      phone_number_id: '123',
      waba_id: '456',
      access_token: 'synthetic',
      status: 'connected',
      registered_at: '2026-01-01',
    });
    vi.mocked(verifyManagedProvider).mockResolvedValue({
      name: 'Test',
      phone: 'synthetic',
    });
    vi.mocked(verifyManagedTemplates).mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ messages: [{ id: 'wamid.new' }] }))
    );
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('claims before its single POST and hashes exactly the posted saved payload', async () => {
    const { db, rpc, events, filters } = database();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      expect(events).toEqual(['claim_messaging_delivery']);
      return Response.json({ messages: [{ id: 'wamid.new' }] });
    });
    const result = await dispatchManagedMessage(db, op);
    const wire = String(vi.mocked(fetch).mock.calls[0][1]?.body);
    expect(JSON.parse(wire).template.components[0].parameters[0].text).toBe(
      'customer'
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_account_id: 'a',
      p_expected_fingerprint: 'a'.repeat(64),
      p_payload_hash: createHash('sha256').update(wire).digest('hex'),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.messageId).toBe('wamid.new');
    expect(filters).toContainEqual(['contacts', 'account_id', 'a']);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_outcome: 'accepted',
      p_provider_message_id: 'wamid.new',
    });
  });
  it.each([
    'messaging_monthly_budget_exhausted',
    'messaging_approval_required',
    'messaging_documented_opt_in_required',
    'messaging_source_changed',
  ])('does not contact the message endpoint when %s', async (claimError) => {
    const { db } = database({ claimError });
    await expect(dispatchManagedMessage(db, op)).rejects.toMatchObject({
      code: claimError,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns a saved accepted receipt without repeating the POST', async () => {
    const { db } = database({ duplicate: true });
    await expect(dispatchManagedMessage(db, op)).resolves.toMatchObject({
      duplicate: true,
      messageId: 'wamid.saved',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['reserved', 'uncertain', 'failed'])(
    'does not retry an existing %s attempt',
    async (outcome) => {
      const { db } = database({ duplicate: true, outcome });
      await expect(dispatchManagedMessage(db, op)).rejects.toMatchObject({
        code: 'messaging_attempt_needs_review',
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it('retains an uncertain reservation after a network timeout', async () => {
    const { db, rpc } = database();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'));
    await expect(dispatchManagedMessage(db, op)).rejects.toMatchObject({
      code: 'messaging_attempt_uncertain',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_outcome: 'uncertain' });
  });
  it('records a definite provider rejection once', async () => {
    const { db, rpc } = database();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: { code: 190 } }, { status: 401 })
    );
    await expect(dispatchManagedMessage(db, op)).rejects.toMatchObject({
      code: 'messaging_provider_rejected',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_outcome: 'failed' });
  });
  it('never retries an accepted message when saving its receipt fails', async () => {
    const { db } = database({ finishError: true });
    await expect(dispatchManagedMessage(db, op)).rejects.toMatchObject({
      code: 'messaging_receipt_save_failed',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('provider verification failures do not consume budget', async () => {
    const { db, rpc } = database();
    vi.mocked(verifyManagedProvider).mockRejectedValueOnce(
      new Error('expired token')
    );
    await expect(dispatchManagedMessage(db, op)).rejects.toThrow(
      'expired token'
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a workflow conversation from another contact/account', async () => {
    const { db, rpc } = database({ wrongConversation: true });
    await expect(
      dispatchManagedMessage(db, {
        ...op,
        kind: 'automation',
        runId: 'run',
        stepId: 's',
        conversationId: 'other',
      })
    ).rejects.toMatchObject({ code: 'messaging_run_not_found' });
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('stops before any data access when the deployment is disabled', async () => {
    vi.stubEnv('MESSAGING_MANAGED_DELIVERY_APPROVED', 'false');
    const { db } = database();
    await expect(dispatchManagedMessage(db, op)).rejects.toMatchObject({
      code: 'messaging_managed_disabled',
    });
    expect(readManagedSource).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
