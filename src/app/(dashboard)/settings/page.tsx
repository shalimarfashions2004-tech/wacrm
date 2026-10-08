'use client';

import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';
import { DashboardPageLoading } from '@/components/dashboard/page-loading';
import { PanelLoading } from '@/components/dashboard/panel-loading';
import { preloadSettingsViews } from '@/lib/settings/load-view';
import { PanelActivity } from '@/components/dashboard/panel-activity';

// Load the selected panel rather than shipping every integration/editor first.
const SecurityPanel = dynamic(
  () =>
    import('@/components/settings/security-panel').then((m) => m.SecurityPanel),
  { loading: PanelLoading }
);
const WhatsAppConfig = dynamic(
  () =>
    import('@/components/settings/whatsapp-config').then(
      (m) => m.WhatsAppConfig
    ),
  { loading: PanelLoading }
);
const TemplateManager = dynamic(
  () =>
    import('@/components/settings/template-manager').then(
      (m) => m.TemplateManager
    ),
  { loading: PanelLoading }
);
const QuickRepliesManager = dynamic(
  () =>
    import('@/components/settings/quick-replies-manager').then(
      (m) => m.QuickRepliesManager
    ),
  { loading: PanelLoading }
);
const FieldsAndTagsPanel = dynamic(
  () =>
    import('@/components/settings/fields-and-tags-panel').then(
      (m) => m.FieldsAndTagsPanel
    ),
  { loading: PanelLoading }
);
const DealsSettings = dynamic(
  () =>
    import('@/components/settings/deals-settings').then((m) => m.DealsSettings),
  { loading: PanelLoading }
);
const MembersTab = dynamic(
  () => import('@/components/settings/members-tab').then((m) => m.MembersTab),
  { loading: PanelLoading }
);
const ApiKeysSettings = dynamic(
  () =>
    import('@/components/settings/api-keys-settings').then(
      (m) => m.ApiKeysSettings
    ),
  { loading: PanelLoading }
);

function preloadSection(section: SettingsSection) {
  if (section === 'whatsapp' || section === 'templates') {
    void preloadSettingsViews().catch(() => {});
  }
  let loading: Promise<unknown> | undefined;
  switch (section) {
    case 'security':
      loading = import('@/components/settings/security-panel');
      break;
    case 'whatsapp':
      loading = import('@/components/settings/whatsapp-config');
      break;
    case 'templates':
      loading = import('@/components/settings/template-manager');
      break;
    case 'quick-replies':
      loading = import('@/components/settings/quick-replies-manager');
      break;
    case 'fields':
      loading = import('@/components/settings/fields-and-tags-panel');
      break;
    case 'deals':
      loading = import('@/components/settings/deals-settings');
      break;
    case 'members':
      loading = import('@/components/settings/members-tab');
      break;
    case 'api':
      loading = import('@/components/settings/api-keys-settings');
      break;
  }
  void loading?.catch(() => {});
}

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={<DashboardPageLoading />}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { user, accountId, accountRole, accountStatus } = useAuth();
  if (accountStatus === 'loading') return <DashboardPageLoading />;
  if (accountStatus !== 'ready') return null;
  return (
    <ScopedSettings key={JSON.stringify([user?.id, accountId, accountRole])} />
  );
}

function ScopedSettings() {
  const searchParams = useSearchParams();
  const { defaultCurrency } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const section = resolveSection(searchParams.get('tab'));
  const [visited, setVisited] = useState<SettingsSection[]>([section]);
  // A deep link/history update can select a panel without a rail click. Record
  // it during render so returning to it keeps its data and unsaved form state.
  if (!visited.includes(section)) setVisited([...visited, section]);

  const go = (next: SettingsSection) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    // These panels are client state. Next synchronizes useSearchParams with
    // native history without a server navigation/authentication round trip.
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency]
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    whatsapp: <WhatsAppConfig active={section === 'whatsapp'} />,
    templates: <TemplateManager />,
    'quick-replies': <QuickRepliesManager />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
  };

  return (
    <div>
      <div>
        <p className="text-muted-foreground mt-1 text-sm">{t('pageDesc')}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail
          active={section}
          onSelect={go}
          onIntent={preloadSection}
          hints={hints}
        />
        <div className="min-w-0">
          {visited.map((id) => (
            <PanelActivity key={id} value={id === section}>
              <div hidden={id !== section} inert={id !== section}>
                {panel[id]}
              </div>
            </PanelActivity>
          ))}
        </div>
      </div>
    </div>
  );
}
