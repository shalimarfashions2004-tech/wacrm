import type { AiProvider } from '@/lib/ai/types';
import type { MessageTemplate } from '@/types';

/** Saved display metadata only. Provider health and send eligibility are fresh reads. */
export interface WhatsAppSettingsView {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  status: string;
  registered_at: string | null;
  subscribed_apps_at: string | null;
  last_registration_error: string | null;
  mirror_inbound_media: boolean;
  has_access_token: boolean;
  has_verify_token: boolean;
}
export interface AiSettingsView {
  configured: boolean;
  provider?: AiProvider;
  model?: string;
  system_prompt?: string | null;
  is_active?: boolean;
  auto_reply_enabled?: boolean;
  auto_reply_max_per_conversation?: number;
  handoff_agent_id?: string | null;
  has_key?: boolean;
  has_embeddings_key?: boolean;
}
export interface SettingsViews {
  whatsapp: WhatsAppSettingsView | null;
  ai: AiSettingsView;
  knowledge: { id: string; title: string; updated_at: string }[];
  templates: MessageTemplate[];
}
export type SettingsSnapshot = {
  accountId: string;
} & {
  [K in keyof SettingsViews]: { data: SettingsViews[K] | null; error?: string };
};
