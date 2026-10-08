import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate } from '@/types';
import { decrypt } from './encryption';
import {
  getSubscribedApps,
  listWabaPhoneNumbers,
  verifyPhoneNumber,
} from './meta-api';
import { appSubscriptionState, phoneNumberBelongsToWaba } from './waba-pairing';
import {
  ManagedDeliveryError,
  configuredManagedSender,
} from './managed-policy';

export interface ManagedConfig {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  status: string;
  registered_at: string | null;
}
export async function managedConfig(
  db: SupabaseClient,
  accountId: string
): Promise<ManagedConfig> {
  const sender = configuredManagedSender();
  if (!sender)
    throw new ManagedDeliveryError(
      'messaging_sender_missing',
      'The WhatsApp sender IDs are missing from this deployment.'
    );
  const { data, error } = await db
    .from('whatsapp_config')
    .select('phone_number_id,waba_id,access_token,status,registered_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (
    error ||
    !data ||
    data.phone_number_id !== sender.phoneNumberId ||
    data.waba_id !== sender.wabaId ||
    data.status !== 'connected' ||
    !data.registered_at
  ) {
    throw new ManagedDeliveryError(
      'messaging_sender_mismatch',
      'Check the saved registered WhatsApp connection before enabling campaigns.'
    );
  }
  return { ...data, access_token: decrypt(data.access_token) } as ManagedConfig;
}

/** Read-only provider checks. Never registers, subscribes or sends a message. */
export async function verifyManagedProvider(
  config: ManagedConfig
): Promise<{ name: string; phone: string }> {
  const appId =
    process.env.META_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_APP_ID?.trim();
  if (!appId)
    throw new ManagedDeliveryError(
      'messaging_app_missing',
      'The Meta app ID is missing from this deployment.'
    );
  try {
    const [phone, numbers, apps] = await Promise.all([
      verifyPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken: config.access_token,
      }),
      listWabaPhoneNumbers({
        wabaId: config.waba_id,
        accessToken: config.access_token,
      }),
      getSubscribedApps({
        wabaId: config.waba_id,
        accessToken: config.access_token,
      }),
    ]);
    if (
      phone.id !== config.phone_number_id ||
      !phoneNumberBelongsToWaba(numbers, config.phone_number_id) ||
      appSubscriptionState(apps, appId).appIdMatch !== true ||
      phone.quality_rating === 'RED'
    ) {
      throw new Error('provider checks failed');
    }
    return {
      name: phone.verified_name ?? 'WhatsApp business',
      phone: phone.display_phone_number,
    };
  } catch {
    throw new ManagedDeliveryError(
      'messaging_provider_check_failed',
      'Meta could not confirm the sender, account, app subscription and quality. Check WhatsApp connection settings.',
      502
    );
  }
}

interface RemoteComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Record<string, unknown>[];
}
interface RemoteTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: RemoteComponent[];
}

/** Compare the text shown for approval with the actual template Meta will use. */
export function templateMatchesProvider(
  local: MessageTemplate,
  remote: RemoteTemplate
): boolean {
  const components = remote.components ?? [];
  const header = components.find((c) => c.type === 'HEADER');
  const body = components.find((c) => c.type === 'BODY');
  const footer = components.find((c) => c.type === 'FOOTER');
  const buttons = components.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  const normalizeButton = (b: Record<string, unknown>) => [
    b.type,
    b.text ?? '',
    b.url ?? '',
    b.phone_number ?? '',
  ];
  return (
    remote.id === local.meta_template_id &&
    remote.name === local.name &&
    remote.language === local.language &&
    remote.status === 'APPROVED' &&
    remote.category.toLowerCase() === local.category.toLowerCase() &&
    body?.text === local.body_text &&
    (header?.format?.toLowerCase() ?? null) === (local.header_type ?? null) &&
    (local.header_type !== 'text' ||
      (header?.text ?? '') === (local.header_content ?? '')) &&
    (footer?.text ?? '') === (local.footer_text ?? '') &&
    JSON.stringify(buttons.map(normalizeButton)) ===
      JSON.stringify(
        (local.buttons ?? []).map((b) =>
          normalizeButton(b as unknown as Record<string, unknown>)
        )
      )
  );
}

export async function verifyManagedTemplates(
  config: ManagedConfig,
  templates: MessageTemplate[]
): Promise<void> {
  for (const template of new Map(templates.map((t) => [t.id, t])).values()) {
    const query = new URLSearchParams({
      name: template.name,
      fields: 'id,name,language,category,status,components',
      limit: '100',
    });
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.waba_id}/message_templates?${query}`,
      {
        headers: { Authorization: `Bearer ${config.access_token}` },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      }
    );
    if (!response.ok)
      throw new ManagedDeliveryError(
        'messaging_template_check_failed',
        'Meta could not verify the template. Sync templates and try again.',
        502
      );
    const data = (await response.json()) as { data?: RemoteTemplate[] };
    const remote = data.data?.find((t) => t.id === template.meta_template_id);
    if (!remote || !templateMatchesProvider(template, remote)) {
      throw new ManagedDeliveryError(
        'messaging_template_changed',
        `Sync “${template.name}” from Meta, then review and approve it again.`
      );
    }
  }
}
