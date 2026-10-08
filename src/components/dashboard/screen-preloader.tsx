'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { preloadSettingsViews } from '@/lib/settings/load-view';

/** Warm saved details after authentication, without mounting editors or making
 * provider calls. No messages, template sync, default seeds or AI generation.
 */
export function ScreenPreloader() {
  const { user, accountId, accountRole, accountStatus } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (accountStatus !== 'ready' || !userId || !accountId || !accountRole)
      return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      timer = setTimeout(() => {
        void Promise.allSettled([
          preloadSettingsViews(),
          import('@/components/settings/whatsapp-config'),
          import('@/components/settings/template-manager'),
          import('@/components/settings/ai-config'),
          import('@/components/agents/ai-playground'),
        ]);
      }, 250);
    };
    schedule();
    // AuthProvider clears stale views on focus. Warm again after it does so.
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [userId, accountId, accountRole, accountStatus]);
  return null;
}
