import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import type { SettingsSnapshot } from '@/lib/settings/snapshot';
import type { MessageTemplate } from '@/types';

const TEMPLATE_FIELDS = [
  'id',
  'user_id',
  'name',
  'category',
  'language',
  'header_type',
  'header_content',
  'header_handle',
  'header_media_url',
  'body_text',
  'footer_text',
  'buttons',
  'sample_values',
  'status',
  'meta_template_id',
  'rejection_reason',
  'quality_score',
  'submission_error',
  'last_submitted_at',
  'created_at',
] as const;

function templateView(row: Record<string, unknown>): MessageTemplate {
  // Do not return future database columns implicitly. select('*') tolerates
  // older schemas without optional template fields; the wire DTO is explicit.
  return Object.fromEntries(
    TEMPLATE_FIELDS.map((key) => [key, row[key]])
  ) as unknown as MessageTemplate;
}

/** One account authentication, then parallel read-only screen queries.
 * No Meta/AI calls, credential decryption, updates, seeding or delivery checks.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const [whatsapp, ai, knowledge, templates] = await Promise.all([
      supabase
        .from('whatsapp_config')
        // Optional tracking/media columns may be absent on older schemas.
        // The explicit response DTO below strips every credential/future field.
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase
        .from('ai_configs')
        .select(
          'provider, model, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id, api_key, embeddings_api_key'
        )
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase
        .from('ai_knowledge_documents')
        .select('id, title, updated_at')
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),
    ]);
    // Build an explicit DTO; even encrypted credentials never enter the browser.
    const wa = whatsapp.data;
    const config = ai.data;
    const snapshot: SettingsSnapshot = {
      accountId,
      whatsapp: whatsapp.error
        ? { data: null, error: 'Could not load WhatsApp settings.' }
        : {
            data: wa
              ? {
                  id: wa.id,
                  phone_number_id: wa.phone_number_id,
              waba_id: wa.waba_id ?? null,
                  status: wa.status,
              registered_at: wa.registered_at ?? null,
              subscribed_apps_at: wa.subscribed_apps_at ?? null,
              last_registration_error: wa.last_registration_error ?? null,
                  mirror_inbound_media: wa.mirror_inbound_media !== false,
                  has_access_token: Boolean(wa.access_token),
                  has_verify_token: Boolean(wa.verify_token),
                }
              : null,
          },
      ai: ai.error
        ? { data: null, error: 'Could not load AI configuration.' }
        : {
            data: config
              ? {
                  configured: true,
                  provider: config.provider,
                  model: config.model,
                  system_prompt: config.system_prompt,
                  is_active: config.is_active,
                  auto_reply_enabled: config.auto_reply_enabled,
                  auto_reply_max_per_conversation:
                    config.auto_reply_max_per_conversation,
                  handoff_agent_id: config.handoff_agent_id,
                  has_key: Boolean(config.api_key),
                  has_embeddings_key: Boolean(config.embeddings_api_key),
                }
              : { configured: false },
          },
      knowledge: knowledge.error
        ? { data: null, error: 'Could not load knowledge base.' }
        : { data: knowledge.data ?? [] },
      templates: templates.error
        ? { data: null, error: 'Could not load templates.' }
        : { data: (templates.data ?? []).map(templateView) },
    };
    const partial = [whatsapp, ai, knowledge, templates].some(
      (result) => result.error
    );
    return NextResponse.json(snapshot, {
      headers: {
        'Cache-Control': 'private, no-store',
        ...(partial ? { 'X-CRM-View-Cache': 'skip' } : {}),
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
