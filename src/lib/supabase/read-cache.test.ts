import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { AccountReadCache } from './read-cache';

const origin = 'https://db.example.test';
const app = 'https://crm.example.test';
const scope = { userId: 'user-1', accountId: 'account-1', role: 'admin' };
function token(userId = scope.userId, expired = false) {
  return `header.${btoa(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + (expired ? -1 : 3600) }))}.signature`;
}
function options() {
  return { headers: { Authorization: `Bearer ${token()}` } };
}
function json(value: unknown, headers: HeadersInit = {}, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let transport: ReturnType<typeof vi.fn<typeof fetch>>;
let cache: AccountReadCache;
const contacts = `${origin}/rest/v1/contacts?select=*&limit=25`;

beforeEach(() => {
  transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => json([{ id: 'contact-1' }]));
  cache = new AccountReadCache(transport, origin, () => app);
  cache.setScope(scope);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('short account-scoped display reads', () => {
  it('shares simultaneous reads and gives every caller a consumable response', async () => {
    const responses = await Promise.all([
      cache.fetch(contacts, options()),
      cache.fetch(contacts, options()),
    ]);
    expect(await Promise.all(responses.map((r) => r.json()))).toEqual([
      [{ id: 'contact-1' }],
      [{ id: 'contact-1' }],
    ]);
    expect(await (await cache.fetch(contacts, options())).json()).toEqual([
      { id: 'contact-1' },
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('expires reads after ten seconds', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await cache.fetch(contacts, options());
    clock.mockReturnValue(now + 9_000);
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 10_001);
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(2);
    clock.mockRestore();
  });

  it('partitions pages, counts and PostgREST schemas', async () => {
    await cache.fetch(contacts, options());
    await cache.fetch(`${contacts}&offset=25`, options());
    await cache.fetch(contacts, {
      headers: { ...options().headers, Prefer: 'count=exact' },
    });
    await cache.fetch(contacts, {
      headers: { ...options().headers, 'Accept-Profile': 'other' },
    });
    await cache.fetch(contacts, {
      headers: { ...options().headers, Range: '25-49' },
    });
    expect(transport).toHaveBeenCalledTimes(5);
  });

  it('preserves actual Supabase pagination/count results and invalidates after a write', async () => {
    transport.mockImplementation(async (_url, init) =>
      init?.method === 'PATCH'
        ? json([{ id: 'edited' }])
        : json([{ id: 'contact-1' }], { 'content-range': '0-0/42' }, 206)
    );
    const db = createClient(origin, token(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: cache.fetch },
    });
    const query = () =>
      db.from('contacts').select('*', { count: 'exact' }).range(0, 24);
    expect(await query()).toMatchObject({
      data: [{ id: 'contact-1' }],
      count: 42,
      error: null,
      status: 206,
    });
    expect(await query()).toMatchObject({ count: 42 });
    expect(transport).toHaveBeenCalledTimes(1);
    await db.from('contacts').update({ name: 'Changed' }).eq('id', 'contact-1');
    await query();
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('keeps HEAD counts separate from body reads', async () => {
    transport.mockImplementation(
      async () =>
        new Response(null, {
          headers: {
            'content-type': 'application/json',
            'content-range': '*/12',
          },
        })
    );
    const opts = { ...options(), method: 'HEAD' };
    expect(
      (await cache.fetch(contacts, opts)).headers.get('content-range')
    ).toBe('*/12');
    expect(await (await cache.fetch(contacts, opts)).text()).toBe('');
    expect(transport).toHaveBeenCalledTimes(1);
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each(['accountId', 'role', 'userId'] as const)(
    'invalidates when %s changes',
    async (field) => {
      await cache.fetch('/api/flows');
      cache.setScope({ ...scope, [field]: 'different' });
      await cache.fetch('/api/flows');
      expect(transport).toHaveBeenCalledTimes(2);
    }
  );

  it('clears on sign-out and bypasses without a resolved account', async () => {
    await cache.fetch('/api/flows');
    cache.setScope(null);
    await cache.fetch('/api/flows');
    await cache.fetch('/api/flows');
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('rejects a pending old-account read after account switching', async () => {
    const pending = deferred<Response>();
    transport.mockReturnValueOnce(pending.promise);
    const read = cache.fetch(contacts, options());
    const check = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    cache.setScope({ ...scope, accountId: 'another-account' });
    pending.resolve(json([{ id: 'old-account' }]));
    await check;
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each(['missing', 'expired', 'different-user'])(
    'bypasses %s authorization',
    async (kind) => {
      const headers: Record<string, string> =
        kind === 'missing'
          ? {}
          : {
              Authorization: `Bearer ${token(kind === 'different-user' ? 'other-user' : scope.userId, kind === 'expired')}`,
            };
      await cache.fetch(contacts, { headers });
      await cache.fetch(contacts, { headers });
      expect(transport).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    'profiles',
    'accounts',
    'messages',
    'conversations',
    'whatsapp_configs',
    'automation_steps',
    'messaging_budget_ledger',
    'contact_consent',
  ])('never caches %s', async (table) => {
    const url = `${origin}/rest/v1/${table}?select=*`;
    await cache.fetch(url, options());
    await cache.fetch(url, options());
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    'access_token',
    'conversations(messages(*))',
    'profiles(*)',
    'consent',
  ])('bypasses embedded protected fields %s', async (select) => {
    const url = `${origin}/rest/v1/contacts?select=${encodeURIComponent(select)}`;
    await cache.fetch(url, options());
    await cache.fetch(url, options());
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('bypasses credentials and provider checks while caching only the named display APIs', async () => {
    for (const url of [
      '/api/whatsapp/config',
      '/api/whatsapp/managed/settings',
      '/api/ai/config',
      '/api/ai/usage',
      '/api/ai/knowledge/one',
    ]) {
      await cache.fetch(url);
      await cache.fetch(url);
    }
    expect(transport).toHaveBeenCalledTimes(10);
    await cache.fetch('/api/ai/knowledge');
    await cache.fetch('/api/ai/knowledge');
    expect(transport).toHaveBeenCalledTimes(11);
  });

  it('does not cache omitted cookies, foreign origins or Request objects', async () => {
    for (let i = 0; i < 2; i++) {
      await cache.fetch('/api/flows', { credentials: 'omit' });
      await cache.fetch('https://other.example.test/api/flows');
      await cache.fetch(new Request(contacts, options()));
    }
    expect(transport).toHaveBeenCalledTimes(6);
  });

  it('leaves abortable requests independent', async () => {
    const controller = new AbortController();
    const opts = { ...options(), signal: controller.signal };
    await cache.fetch(contacts, opts);
    await cache.fetch(contacts, opts);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it.each(['no-store', 'reload'] as const)(
    'forces a fresh read and removes stale data on %s',
    async (mode) => {
      await cache.fetch(contacts, options());
      transport.mockImplementation(async () => json([{ id: 'new' }]));
      expect(
        await (
          await cache.fetch(contacts, { ...options(), cache: mode })
        ).json()
      ).toEqual([{ id: 'new' }]);
      expect(await (await cache.fetch(contacts, options())).json()).toEqual([
        { id: 'new' },
      ]);
      expect(transport).toHaveBeenCalledTimes(3);
    }
  );

  it('does not retain failures and permits an independent retry', async () => {
    transport.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    expect((await cache.fetch(contacts, options())).status).toBe(403);
    transport.mockRejectedValueOnce(new Error('network'));
    await expect(cache.fetch(contacts, options())).rejects.toThrow('network');
    expect(await (await cache.fetch(contacts, options())).json()).toEqual([
      { id: 'contact-1' },
    ]);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('honors a server no-store response', async () => {
    transport.mockImplementation(async () =>
      json([], { 'cache-control': 'no-store' })
    );
    await cache.fetch(contacts, options());
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('does not retain oversized JSON or change its contents', async () => {
    const large = { text: '💚'.repeat(70_000) };
    transport.mockImplementation(async () => json(large));
    expect(await (await cache.fetch(contacts, options())).json()).toEqual(
      large
    );
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('evicts old entries instead of growing without a bound', async () => {
    for (let i = 0; i < 65; i++)
      await cache.fetch(`${contacts}&offset=${i}`, options());
    await cache.fetch(`${contacts}&offset=0`, options());
    expect(transport).toHaveBeenCalledTimes(66);
  });

  it('invalidates reads both before a write and when it finishes', async () => {
    await cache.fetch(contacts, options());
    const write = deferred<Response>();
    transport.mockImplementation(async (_url, init) =>
      init?.method === 'PATCH' ? write.promise : json([])
    );
    const writing = cache.fetch('/api/contacts/one/tags', { method: 'PATCH' });
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(3);
    write.resolve(json({ saved: true }));
    await writing;
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it('does not let an old pending read repopulate the cache after a write', async () => {
    const pending = deferred<Response>();
    transport.mockReturnValueOnce(pending.promise);
    const read = cache.fetch(contacts, options());
    await cache.fetch('/api/flows/one', { method: 'PATCH' });
    pending.resolve(json([{ id: 'old' }]));
    await read;
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('drops previously cached results on refocus/realtime invalidation', async () => {
    await cache.fetch(contacts, options());
    cache.invalidate();
    await cache.fetch(contacts, options());
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

describe('explicit saved settings views', () => {
  const path = '/api/settings/snapshot';
  beforeEach(() => {
    transport.mockImplementation(async () =>
      json(
        { accountId: scope.accountId },
        { 'cache-control': 'private, no-store' }
      )
    );
  });
  it('shares preload and screen requests while preserving HTTP no-store', async () => {
    const [preload, screen] = await Promise.all([
      cache.viewFetch(path),
      cache.viewFetch(path),
    ]);
    expect(preload.headers.get('cache-control')).toBe('private, no-store');
    expect(await screen.json()).toEqual({ accountId: scope.accountId });
    await cache.viewFetch(path);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('retains a saved view for at most sixty seconds', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await cache.viewFetch(path);
    clock.mockReturnValue(now + 59_000);
    await cache.viewFetch(path);
    expect(transport).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 60_001);
    await cache.viewFetch(path);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each(['accountId', 'userId', 'role'] as const)(
    'clears the saved view on %s change',
    async (field) => {
      await cache.viewFetch(path);
      cache.setScope({ ...scope, [field]: 'changed' });
      await cache.viewFetch(path);
      expect(transport).toHaveBeenCalledTimes(2);
    }
  );
  it('does not return an old pending view after scope changes', async () => {
    const pending = deferred<Response>();
    transport.mockReturnValueOnce(pending.promise);
    const read = cache.viewFetch(path);
    const check = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    cache.setScope(null);
    pending.resolve(json({ accountId: 'old' }));
    await check;
  });
  it('does not cache partial failures or failed auth', async () => {
    transport.mockResolvedValueOnce(json({}, { 'x-crm-view-cache': 'skip' }));
    await cache.viewFetch(path);
    transport.mockResolvedValueOnce(json({}, {}, 401));
    await cache.viewFetch(path);
    await cache.viewFetch(path);
    await cache.viewFetch(path);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('fresh refresh and writes invalidate saved views', async () => {
    await cache.viewFetch(path);
    await cache.viewFetch(path, { cache: 'no-store' });
    await cache.viewFetch(path);
    expect(transport).toHaveBeenCalledTimes(2);
    await cache.fetch('/api/ai/config', { method: 'POST', body: '{}' });
    await cache.viewFetch(path);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it.each([
    '/api/whatsapp/config',
    '/api/whatsapp/managed/settings',
    '/api/ai/test',
    '/api/ai/usage',
    '/api/whatsapp/config/verify-registration',
    '/api/settings/snapshot?token=secret',
    '/api/settings/snapshot?account=another',
  ])('keeps %s outside view memoization', async (url) => {
    await cache.viewFetch(url);
    await cache.viewFetch(url);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('keeps private headers and cancellation requests outside memoization', async () => {
    await cache.viewFetch(path, {
      headers: { Authorization: 'Bearer private' },
    });
    await cache.viewFetch(path, {
      headers: { Authorization: 'Bearer private' },
    });
    await cache.viewFetch(path, { signal: new AbortController().signal });
    await cache.viewFetch(path, { credentials: 'omit' });
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it('does not retain speculative data across mutations already in progress', async () => {
    const pending = deferred<Response>();
    transport.mockReturnValueOnce(pending.promise);
    const write = cache.fetch('/api/ai/config', { method: 'POST' });
    await cache.viewFetch(path);
    pending.resolve(json({ success: true }));
    await write;
    await cache.viewFetch(path);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('never puts sensitive query parameters in ordinary display cache keys', async () => {
    await cache.fetch('/api/flows?access_token=private');
    await cache.fetch('/api/flows?access_token=private');
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
