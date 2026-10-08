import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate, AutomationStep } from '@/types';
import { ManagedDeliveryError, managedDatabaseError } from './managed-policy';

export type ManagedSourceKind = 'broadcast' | 'automation';
export interface ManagedRecipient {
  id: string;
  contact: string;
  phone: string | null;
  params: string[] | null;
}
export interface ManagedSnapshot {
  source: {
    id: string;
    name: string;
    template?: string;
    language?: string;
    scheduled_at?: string | null;
    audience?: { headerMediaUrl?: string; preparationComplete?: boolean };
    trigger?: string;
    config?: unknown;
  };
  children: (ManagedRecipient | AutomationStep)[];
  templates: MessageTemplate[];
  sender: { phone: string; waba: string };
  policy: {
    phone: string;
    waba: string;
    limit: number;
    reservation: number | null;
    rate_valid_until: string | null;
  };
}
export interface ManagedSource {
  snapshot: ManagedSnapshot;
  fingerprint: string;
}

export async function readManagedSource(
  db: SupabaseClient,
  accountId: string,
  kind: ManagedSourceKind,
  sourceId: string
): Promise<ManagedSource> {
  const { data, error } = await db.rpc('read_messaging_source', {
    p_account_id: accountId,
    p_source_kind: kind,
    p_source_id: sourceId,
  });
  if (error) throw managedDatabaseError(error);
  if (!data?.snapshot || !/^[a-f0-9]{64}$/.test(data.fingerprint ?? '')) {
    throw new ManagedDeliveryError(
      'messaging_snapshot_missing',
      'The saved campaign could not be verified.'
    );
  }
  return data as ManagedSource;
}

export function sourceTemplate(
  snapshot: ManagedSnapshot,
  name: string,
  language = 'en_US'
): MessageTemplate {
  const matches = snapshot.templates.filter(
    (t) => t.name === name && t.language === language
  );
  if (
    matches.length !== 1 ||
    matches[0].status !== 'APPROVED' ||
    !matches[0].meta_template_id
  ) {
    throw new ManagedDeliveryError(
      'messaging_template_not_approved',
      'Sync the approved template from Meta before reviewing this campaign.'
    );
  }
  if (!['marketing', 'utility'].includes(matches[0].category.toLowerCase())) {
    throw new ManagedDeliveryError(
      'messaging_category_unsupported',
      'Only marketing and utility templates are enabled for this rollout.'
    );
  }
  return matches[0];
}

export function sourceTemplates(
  snapshot: ManagedSnapshot,
  kind: ManagedSourceKind
): MessageTemplate[] {
  if (kind === 'broadcast')
    return [
      sourceTemplate(
        snapshot,
        snapshot.source.template ?? '',
        snapshot.source.language
      ),
    ];
  return (snapshot.children as AutomationStep[])
    .filter((s) => s.step_type === 'send_template')
    .map((s) => {
      const c = s.step_config as { template_name?: string; language?: string };
      return sourceTemplate(snapshot, c.template_name ?? '', c.language);
    });
}
