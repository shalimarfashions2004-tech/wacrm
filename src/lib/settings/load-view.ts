import { crmViewFetch } from '@/lib/supabase/read-cache';
import type { SettingsSnapshot, SettingsViews } from './snapshot';

export async function loadSettingsView<K extends keyof SettingsViews>(
  section: K,
  accountId: string,
  fresh = false
): Promise<SettingsViews[K]> {
  const res = await crmViewFetch(
    '/api/settings/snapshot',
    fresh ? { cache: 'no-store' } : undefined
  );
  const snapshot = (await res.json()) as SettingsSnapshot & { error?: string };
  if (!res.ok) throw new Error(snapshot.error ?? 'Could not load settings.');
  if (snapshot.accountId !== accountId)
    throw new DOMException('Account changed', 'AbortError');
  if (snapshot[section].error) throw new Error(snapshot[section].error);
  return snapshot[section].data as SettingsViews[K];
}

export async function preloadSettingsViews() {
  // Consume speculative results. Errors are rendered by the actual screen and
  // are never cached; preloading must not raise a toast on an unrelated page.
  const res = await crmViewFetch('/api/settings/snapshot');
  await res.arrayBuffer();
}
