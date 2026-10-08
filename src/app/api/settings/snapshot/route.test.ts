import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/account';

const auth = vi.hoisted(() => ({ getCurrentAccount: vi.fn() }));
vi.mock('@/lib/auth/account', async (original) => ({
  ...(await original<typeof import('@/lib/auth/account')>()),
  getCurrentAccount: auth.getCurrentAccount,
}));
import { GET } from './route';

const accountId = 'account-1';
let rows: Record<string, unknown>;
let errors: Record<string, { message: string }>;
let reads: { table: string; field: string; value: unknown }[];
let started: string[];
let release: (() => void) | undefined;
let wait: Promise<void> | undefined;

function query(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((field: string, value: unknown) => {
      reads.push({ table, field, value });
      return builder;
    }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then: async (resolve: (result: unknown) => void) => {
      started.push(table);
      await wait;
      resolve({ data: rows[table] ?? null, error: errors[table] ?? null });
    },
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  reads = [];
  started = [];
  wait = undefined;
  release = undefined;
  errors = {};
  rows = {
    whatsapp_config: {
      id: 'wa-1',
      phone_number_id: 'phone-1',
      waba_id: 'waba-1',
      status: 'connected',
      registered_at: '2026-10-07',
      access_token: 'encrypted-private-token',
      verify_token: 'encrypted-private-verify',
    },
    ai_configs: {
      provider: 'openai',
      model: 'test',
      is_active: false,
      api_key: 'encrypted-private-ai',
      embeddings_api_key: 'encrypted-private-embeddings',
    },
    ai_knowledge_documents: [
      { id: 'doc-1', title: 'Store', updated_at: 'today' },
    ],
    message_templates: [
      {
        id: 'template-1',
        name: 'store_intro',
        status: 'PENDING',
        future_secret: 'encrypted-private-template',
      },
    ],
  };
  auth.getCurrentAccount.mockResolvedValue({
    accountId,
    supabase: { from: vi.fn(query) },
  });
});

describe('saved settings snapshot', () => {
  it('authenticates once, scopes every query and strips all credentials', async () => {
    const res = await GET();
    const data = await res.json();
    expect(auth.getCurrentAccount).toHaveBeenCalledTimes(1);
    expect(reads).toHaveLength(4);
    expect(
      reads.every(
        (read) => read.field === 'account_id' && read.value === accountId
      )
    ).toBe(true);
    expect(data.accountId).toBe(accountId);
    expect(data.whatsapp.data).toMatchObject({
      has_access_token: true,
      has_verify_token: true,
      mirror_inbound_media: true,
    });
    expect(data.ai.data).toMatchObject({
      configured: true,
      has_key: true,
      has_embeddings_key: true,
      is_active: false,
    });
    expect(JSON.stringify(data)).not.toContain('encrypted-private');
    expect(data.whatsapp.data).not.toHaveProperty('access_token');
    expect(data.ai.data).not.toHaveProperty('api_key');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(data).not.toHaveProperty('connected');
    expect(data).not.toHaveProperty('budget');
  });
  it('starts all four reads before waiting for any result', async () => {
    wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = GET();
    await vi.waitFor(() => expect(started).toHaveLength(4));
    release!();
    expect((await request).status).toBe(200);
  });
  it('keeps absent configuration distinct from a failed query', async () => {
    rows.whatsapp_config = null;
    rows.ai_configs = null;
    const data = await (await GET()).json();
    expect(data.whatsapp).toEqual({ data: null });
    expect(data.ai).toEqual({ data: { configured: false } });
  });
  it.each([
    'whatsapp_config',
    'ai_configs',
    'ai_knowledge_documents',
    'message_templates',
  ])(
    'isolates a %s failure and prevents retention of the partial response',
    async (table) => {
      errors[table] = { message: 'private database details' };
      const response = await GET();
      const data = await response.json();
      expect(response.headers.get('x-crm-view-cache')).toBe('skip');
      expect(JSON.stringify(data)).not.toContain('private database details');
      expect(
        Object.values(data).filter(
          (part) => typeof part === 'object' && part && 'error' in part
        )
      ).toHaveLength(1);
    }
  );
  it.each([new UnauthorizedError(), new ForbiddenError()])(
    'rejects missing session/account before reading data',
    async (error) => {
      auth.getCurrentAccount.mockRejectedValueOnce(error);
      expect((await GET()).status).toBe(error.status);
      expect(reads).toEqual([]);
    }
  );
});
