import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ crmViewFetch: vi.fn() }));
vi.mock('@/lib/supabase/read-cache', () => transport);
import { loadSettingsView, preloadSettingsViews } from './load-view';

beforeEach(() => {
  transport.crmViewFetch.mockReset();
  transport.crmViewFetch.mockResolvedValue(
    Response.json({
      accountId: 'account-1',
      whatsapp: { data: null },
      ai: { data: { configured: false } },
      knowledge: { data: [] },
      templates: { data: [{ id: 'template-1' }] },
    })
  );
});
describe('screen view loading', () => {
  it('returns the requested section and keeps absence distinct from failure', async () => {
    expect(await loadSettingsView('whatsapp', 'account-1')).toBeNull();
    // Mock a new consumable response, as the cache does for actual callers.
    transport.crmViewFetch.mockResolvedValueOnce(
      Response.json({
        accountId: 'account-1',
        ai: { data: { configured: false } },
      })
    );
    expect(await loadSettingsView('ai', 'account-1')).toEqual({
      configured: false,
    });
  });
  it('rejects a response from a different resolved account', async () => {
    await expect(
      loadSettingsView('templates', 'other-account')
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('reports the requested section failure without hiding it as an empty list', async () => {
    transport.crmViewFetch.mockResolvedValueOnce(
      Response.json({
        accountId: 'account-1',
        templates: { data: null, error: 'Could not load templates.' },
      })
    );
    await expect(loadSettingsView('templates', 'account-1')).rejects.toThrow(
      'Could not load templates.'
    );
  });
  it('rejects failed authentication', async () => {
    transport.crmViewFetch.mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    await expect(loadSettingsView('templates', 'account-1')).rejects.toThrow(
      'Unauthorized'
    );
  });
  it('explicit refresh bypasses previous display state and HTTP caches', async () => {
    await loadSettingsView('templates', 'account-1', true);
    expect(transport.crmViewFetch).toHaveBeenCalledWith(
      '/api/settings/snapshot',
      { cache: 'no-store' }
    );
  });
  it('consumes speculative error responses without raising an unrelated screen error', async () => {
    transport.crmViewFetch.mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    await expect(preloadSettingsViews()).resolves.toBeUndefined();
  });
});
