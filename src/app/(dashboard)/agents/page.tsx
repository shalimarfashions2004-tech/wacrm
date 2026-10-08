'use client';

import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Sparkles, Settings2, BarChart3 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiConfig } from '@/components/settings/ai-config';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { PanelLoading } from '@/components/dashboard/panel-loading';

const AiPlayground = dynamic(
  () => import('@/components/agents/ai-playground').then((m) => m.AiPlayground),
  { loading: PanelLoading }
);
const AiUsageCard = dynamic(
  () => import('@/components/agents/ai-usage').then((m) => m.AiUsageCard),
  { loading: PanelLoading }
);

type Tab = 'playground' | 'setup' | 'usage';

export default function AgentsPage() {
  const t = useTranslations('Agents');
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  // Render the shell immediately. The setup panel owns the authenticated
  // config request and switches configured accounts to the playground once
  // that request completes. Keeping the request in one place prevents the
  // page-level fetch from racing profile hydration and avoids a blank page
  // while the API is resolving.
  const [tab, setTab] = useState<Tab>('setup');
  const userSelectedTabRef = useRef(false);
  const handleTabChange = useCallback((value: string) => {
    userSelectedTabRef.current = true;
    setTab(value as Tab);
  }, []);
  const handleConfigured = useCallback(() => {
    if (!userSelectedTabRef.current) setTab('playground');
  }, []);

  return (
    <div>
      <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-6">
        <TabsList>
          <TabsTrigger
            value="playground"
            onMouseEnter={() =>
              void import('@/components/agents/ai-playground').catch(() => {})
            }
            onFocus={() => void import('@/components/agents/ai-playground').catch(() => {})}
          >
            <Sparkles className="mr-1.5 h-4 w-4" /> {t('tabPlayground')}
          </TabsTrigger>
          <TabsTrigger value="setup">
            <Settings2 className="mr-1.5 h-4 w-4" /> {t('tabSetup')}
          </TabsTrigger>
          {canViewUsage && (
            <TabsTrigger
              value="usage"
              onMouseEnter={() => void import('@/components/agents/ai-usage').catch(() => {})}
              onFocus={() => void import('@/components/agents/ai-usage').catch(() => {})}
            >
              <BarChart3 className="mr-1.5 h-4 w-4" /> {t('tabUsage')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="playground" className="mt-4">
          <AiPlayground onGoToSetup={() => setTab('setup')} />
        </TabsContent>

        <TabsContent value="setup" className="mt-4">
          <AiConfig onConfigured={handleConfigured} />
        </TabsContent>

        {canViewUsage && (
          <TabsContent value="usage" className="mt-4">
            <AiUsageCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
