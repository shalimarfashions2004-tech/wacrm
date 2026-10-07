// ============================================================
// Outbound message send — the core that both the dashboard's
// `/api/whatsapp/send` route and the public `/api/v1/messages`
// endpoint call.
//
// Given a conversation and message params, this:
//   1. validates the params for the message type,
//   2. loads the conversation + contact + WhatsApp config,
//   3. sends to Meta (with phone-variant retry + contact auto-fix),
//   4. persists the message + updates the conversation,
//   5. pauses any active Flow run for the contact (agent stepped in).
//
// It is transport-agnostic: it takes a `SupabaseClient` and an
// `accountId` and throws `SendMessageError` on failure. The callers
// own auth, rate-limiting, body parsing, and mapping the error to
// their respective response shapes (internal `{ error }` vs the v1
// envelope). The authenticated Inbox may use a separate, sender-bound
// reply approval; public API callers still require general live approval.
// ============================================================

import { randomUUID } from 'node:crypto';
import { isOptOutMessage } from './consent';
import {
  issueInboxReplyPermit,
  type InboxReplyPermit,
} from './inbox-reply-permit';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  type MediaKind,
} from '@/lib/whatsapp/meta-api';
import {
  validateInteractivePayload,
  interactivePayloadPreviewText,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import { resolveContactSendTarget } from '@/lib/whatsapp/wa-identity';
import { manualTestMessageId } from '@/lib/whatsapp/manual-test-claim';
import type { MessageTemplate } from '@/types';
import {
  resolveTemplateRow,
  templateBodyParams,
  templateContentText,
} from '@/lib/whatsapp/template-body';
import {
  DELIVERY_DISABLED_MESSAGE,
  isLiveDeliveryApproved,
  getManualTestApproval,
  getInboxReplyApproval,
  isManualTestDeliveryApproved,
  MANUAL_TEST_MESSAGE,
} from '@/lib/whatsapp/delivery-policy';

export const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const;
export const VALID_MESSAGE_TYPES = [
  'text',
  'template',
  'interactive',
  ...MEDIA_KINDS,
] as const;

/**
 * Typed failure with a machine `code` and a suggested HTTP `status`.
 * Callers map it to their own response shape (`toErrorResponse` for
 * the dashboard route, the v1 envelope for the public endpoint).
 */
export class SendMessageError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SendMessageError';
    this.code = code;
    this.status = status;
  }
}

export interface SendMessageParams {
  conversationId: string;
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  /** Legacy positional body params (only used if messageParams.body unset). */
  templateParams?: string[];
  /** Structured template params (header/body/buttons). */
  templateMessageParams?: unknown;
  /** Structured payload for `messageType === 'interactive'`. */
  interactivePayload?: InteractiveMessagePayload | null;
  replyToMessageId?: string | null;
}

export interface SendMessageResult {
  /** Our `messages.id` (the persisted row). */
  messageId: string;
  /** Meta's `wamid` for the delivered message. */
  whatsappMessageId: string;
}

/**
 * Send a message in an existing conversation and persist it.
 *
 * `db` may be an RLS-scoped user client (dashboard) or the service-
 * role client (public API) — every query is filtered by `accountId`
 * either way, so tenancy holds regardless of which client is passed.
 */
/**
 * Validate the message-shape params (type, required content, caption
 * cap) independently of any DB state, throwing `SendMessageError` on a
 * bad payload. Exported so a caller can reject a malformed request
 * *before* it finds-or-creates a contact/conversation — otherwise an
 * invalid payload leaves an orphan empty conversation behind. The send
 * core calls this too, so validation can't be skipped.
 */
export function validateSendMessageParams(params: {
  messageType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  templateName?: string | null;
  interactivePayload?: InteractiveMessagePayload | null;
}): void {
  const {
    messageType,
    contentText,
    mediaUrl,
    templateName,
    interactivePayload,
  } = params;

  if (!messageType) {
    throw new SendMessageError('bad_request', 'message_type is required', 400);
  }

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);

  if (!(VALID_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
    throw new SendMessageError(
      'bad_request',
      `Unsupported message_type "${messageType}"`,
      400
    );
  }

  if (messageType === 'text' && !contentText) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for text messages',
      400
    );
  }

  if (messageType === 'template' && !templateName) {
    throw new SendMessageError(
      'bad_request',
      'template_name is required for template messages',
      400
    );
  }

  // Interactive: validate the full structured payload against Meta's
  // limits up front so a bad payload 400s before we touch Meta.
  if (messageType === 'interactive') {
    const result = validateInteractivePayload(interactivePayload);
    if (!result.ok) {
      throw new SendMessageError('bad_request', result.error, 400);
    }
  }

  if (isMediaKind && !mediaUrl) {
    throw new SendMessageError(
      'bad_request',
      `media_url is required for ${messageType} messages`,
      400
    );
  }

  // Meta caps media captions at 1024 chars (audio carries none).
  if (
    isMediaKind &&
    messageType !== 'audio' &&
    typeof contentText === 'string' &&
    contentText.length > 1024
  ) {
    throw new SendMessageError(
      'bad_request',
      'Caption exceeds the 1024-character limit',
      400
    );
  }
}

export async function sendMessageToConversation(
  db: SupabaseClient,
  accountId: string,
  params: SendMessageParams,
  options: { source?: 'manual-inbox' } = {}
): Promise<SendMessageResult> {
  const {
    conversationId,
    messageType,
    contentText,
    mediaUrl,
    filename,
    templateName,
    templateLanguage,
    templateParams,
    templateMessageParams,
    interactivePayload,
    replyToMessageId,
  } = params;

  if (!conversationId) {
    throw new SendMessageError(
      'bad_request',
      'conversation_id is required',
      400
    );
  }

  validateSendMessageParams({
    messageType,
    contentText,
    mediaUrl,
    templateName,
    interactivePayload,
  });

  const liveApproved = isLiveDeliveryApproved();
  const testApproval = getManualTestApproval();
  const inboxApproval =
    options.source === 'manual-inbox' ? getInboxReplyApproval() : null;
  const inboxReply = Boolean(inboxApproval && messageType !== 'template');
  let inboxReplyPermit: InboxReplyPermit | undefined;
  let manualTest = false;
  if (!liveApproved && !inboxReply) {
    let disabledReason: string | null = null;
    if (options.source !== 'manual-inbox') {
      disabledReason = DELIVERY_DISABLED_MESSAGE;
    } else if (inboxApproval && messageType === 'template') {
      disabledReason =
        'Inbox replies are enabled. Template and campaign sending remain disabled until campaign checks are complete.';
    } else if (!testApproval) {
      disabledReason =
        'Live delivery is disabled. The temporary test approval is missing, invalid or expired. Ask the owner to check the test setup.';
    } else if (messageType !== 'text' || contentText !== MANUAL_TEST_MESSAGE) {
      disabledReason = `Only the approved text test is enabled. Send this exact text without quotation marks: ${MANUAL_TEST_MESSAGE}`;
    }
    if (disabledReason) {
      throw new SendMessageError('delivery_disabled', disabledReason, 409);
    }
    manualTest = true;
  }

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType);

  // Conversation + contact, account-scoped.
  const { data: conversation, error: convError } = await db
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single();

  if (convError || !conversation) {
    throw new SendMessageError('not_found', 'Conversation not found', 404);
  }

  const contact = conversation.contact;

  // A contact is addressable by phone number OR by business-scoped user
  // ID. Meta withholds the phone number for a customer who has adopted
  // a WhatsApp username, so those contacts carry only a BSUID and are
  // reached through Meta's `recipient` field instead of `to` (issue
  // #519). Phone stays preferred when we have one: only it supports the
  // trunk-prefix variant retry below.
  const resolvedTarget = resolveContactSendTarget(contact);
  if (!resolvedTarget) {
    throw new SendMessageError(
      'bad_request',
      contact?.phone
        ? 'Invalid phone number format'
        : 'Contact has no phone number or WhatsApp user ID',
      400
    );
  }
  const sendTarget = resolvedTarget.target;
  const hasValidPhone = resolvedTarget.isPhone;
  const sanitizedPhone = hasValidPhone ? sendTarget : '';

  // WhatsApp config, account-scoped.
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (configError || !config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }

  if (inboxReply && inboxApproval) {
    if (
      config.phone_number_id !== inboxApproval.phoneNumberId ||
      config.waba_id !== inboxApproval.wabaId
    ) {
      throw new SendMessageError(
        'delivery_disabled',
        'The saved WhatsApp connection differs from the approved Inbox sender. Check Settings → WhatsApp.',
        409
      );
    }
    if (
      !contact ||
      contact.account_id !== accountId ||
      !Object.hasOwn(contact, 'suppressed_at')
    ) {
      throw new SendMessageError(
        'consent_unavailable',
        'Contact safety records are unavailable. No message was sent.',
        503
      );
    }
    if (contact.suppressed_at) {
      throw new SendMessageError(
        'contact_suppressed',
        'This contact has opted out. No message was sent.',
        409
      );
    }
    const { data: optOut, error: consentError } = await db
      .from('contact_consents')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', contact.id)
      .eq('channel', 'whatsapp')
      .eq('category', 'service')
      .eq('status', 'opted_out')
      .limit(1)
      .maybeSingle();
    if (consentError || optOut) {
      throw new SendMessageError(
        'consent_unavailable',
        'Reply consent could not be confirmed, or this contact has opted out. No message was sent.',
        409
      );
    }
    const { data: inbound, error: inboundError } = await db
      .from('messages')
      .select('created_at, content_text')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .not('message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const inboundAt = Date.parse(inbound?.created_at ?? '');
    if (
      inboundError ||
      !Number.isFinite(inboundAt) ||
      inboundAt > Date.now() ||
      inboundAt <= Date.now() - 24 * 60 * 60 * 1000 ||
      isOptOutMessage(inbound?.content_text)
    ) {
      throw new SendMessageError(
        'service_window_closed',
        'A customer message from the last 24 hours is required to reply. No message was sent.',
        409
      );
    }
    inboxReplyPermit = issueInboxReplyPermit(
      config.phone_number_id,
      sendTarget,
      inboundAt
    );
  }

  if (manualTest && testApproval) {
    let disabledReason: string | null = null;
    if (contact?.suppressed_at) {
      disabledReason =
        'This contact is suppressed. The approved test cannot be sent to an opted-out contact.';
    } else if (config.phone_number_id !== testApproval.phoneNumberId) {
      disabledReason =
        'The saved WhatsApp Phone Number ID does not match the approved test sender. Check Settings → WhatsApp connection before retrying.';
    } else if (sendTarget !== testApproval.recipient) {
      disabledReason =
        'This conversation is not the personal number approved for the test. Open the approved personal-number conversation in Inbox.';
    } else if (
      !isManualTestDeliveryApproved({
        phoneNumberId: config.phone_number_id,
        to: sendTarget,
        text: contentText!,
      })
    ) {
      disabledReason =
        'The temporary test approval expired during this request. No message was sent.';
    }
    if (disabledReason) {
      throw new SendMessageError('delivery_disabled', disabledReason, 409);
    }
    // Require a provider-backed inbound message in the owned conversation.
    // This allowance must not initiate a conversation or bypass the 24h window.
    const { data: inbound, error: inboundError } = await db
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .not('message_id', 'is', null)
      .gte(
        'created_at',
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      )
      .lte('created_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const inboundAt = Date.parse(inbound?.created_at ?? '');
    if (
      inboundError ||
      !Number.isFinite(inboundAt) ||
      inboundAt > Date.now() ||
      inboundAt < Date.now() - 24 * 60 * 60 * 1000
    ) {
      throw new SendMessageError(
        'delivery_disabled',
        'Send TEST from the approved personal number first, then retry this reply within 24 hours.',
        409
      );
    }
  }

  const accessToken = decrypt(config.access_token);

  // Self-heal legacy CBC ciphertexts. Fire-and-forget; idempotent.
  if (isLegacyFormat(config.access_token)) {
    void db
      .from('whatsapp_config')
      .update({ access_token: encrypt(accessToken) })
      .eq('id', config.id)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.warn(
            '[send-message] access_token GCM upgrade failed:',
            error.message
          );
        }
      });
  }

  // Resolve the reply target to its Meta message_id. The parent must
  // belong to this same conversation — otherwise a caller could quote
  // messages they can't see by guessing UUIDs.
  let contextMessageId: string | undefined;
  if (replyToMessageId) {
    const { data: parent, error: parentError } = await db
      .from('messages')
      .select('message_id, conversation_id')
      .eq('id', replyToMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (parentError || !parent) {
      throw new SendMessageError(
        'bad_request',
        'reply_to_message_id not found in this conversation',
        400
      );
    }
    if (!parent.message_id) {
      console.warn(
        '[send-message] reply target has no Meta message_id; sending without context'
      );
    } else {
      contextMessageId = parent.message_id;
    }
  }

  // Template row — needed for the send-builder's header + button
  // components AND for the body we persist. The lookup tolerates the
  // en / en_US split so a caller that omits the language still resolves
  // a row (see resolveTemplateRow).
  let templateRow: MessageTemplate | null = null;
  let sendLanguage = templateLanguage || 'en_US';
  if (messageType === 'template' && templateName) {
    const resolved = await resolveTemplateRow(
      db,
      accountId,
      templateName,
      templateLanguage
    );
    if (resolved.malformed) {
      throw new SendMessageError(
        'template_malformed',
        'Template row is malformed locally — run "Sync from Meta" in Settings to repair it.',
        500
      );
    }
    templateRow = resolved.row;
    sendLanguage = resolved.language;
  }

  const attempt = async (phone: string): Promise<string> => {
    if (messageType === 'template') {
      const result = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: templateName!,
        language: sendLanguage,
        template: templateRow ?? undefined,
        messageParams: templateMessageParams ?? undefined,
        params: templateParams || [],
        contextMessageId,
      });
      return result.messageId;
    }
    if (isMediaKind) {
      const result = await sendMediaMessage({
        ...(inboxReplyPermit ? { inboxReplyPermit } : {}),
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        kind: messageType as MediaKind,
        link: mediaUrl!,
        caption: contentText || undefined,
        filename: filename || undefined,
        contextMessageId,
      });
      return result.messageId;
    }
    if (messageType === 'interactive') {
      const p = interactivePayload!;
      if (p.kind === 'buttons') {
        const result = await sendInteractiveButtons({
          ...(inboxReplyPermit ? { inboxReplyPermit } : {}),
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: phone,
          bodyText: p.body,
          headerText: p.header || undefined,
          footerText: p.footer || undefined,
          buttons: p.buttons,
          contextMessageId,
        });
        return result.messageId;
      }
      const result = await sendInteractiveList({
        ...(inboxReplyPermit ? { inboxReplyPermit } : {}),
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        bodyText: p.body,
        buttonLabel: p.button_label,
        headerText: p.header || undefined,
        footerText: p.footer || undefined,
        sections: p.sections,
        contextMessageId,
      });
      return result.messageId;
    }
    const result = await sendTextMessage({
      ...(inboxReplyPermit ? { inboxReplyPermit } : {}),
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: contentText!,
      contextMessageId,
      ...(manualTest ? { manualTest: true } : {}),
    });
    return result.messageId;
  };

  // Send via Meta — retry across phone-number variants if Meta rejects
  // with "recipient not in allowed list"; persist a working variant
  // back to the contact so the next send goes straight through.
  let waMessageId = '';
  let workingPhone = sendTarget;
  // Persist before contacting Meta, and retain the row on an uncertain outcome.
  // Restricted tests use a deterministic ID for their single allowed attempt;
  // ordinary replies reserve their own row for delivery reconciliation.
  const reservedMessageId =
    manualTest && testApproval
      ? manualTestMessageId(testApproval)
      : inboxReply
        ? randomUUID()
        : null;
  if (reservedMessageId) {
    const { error: claimError } = await db.from('messages').insert({
      id: reservedMessageId,
      conversation_id: conversationId,
      sender_type: 'agent',
      content_type: messageType,
      content_text: contentText ?? null,
      media_url: mediaUrl || null,
      interactive_payload: interactivePayload || null,
      status: 'sending',
      reply_to_message_id: replyToMessageId || null,
    });
    if (claimError) {
      throw new SendMessageError(
        claimError.code === '23505' ? 'test_already_attempted' : 'db_error',
        claimError.code === '23505'
          ? 'This approved test has already been attempted. Check the recipient and delivery status before approving another test.'
          : 'Could not save the message before delivery. No message was sent.',
        claimError.code === '23505' ? 409 : 500
      );
    }
  }
  try {
    // Variants only make sense for a phone number — a BSUID is opaque
    // and has exactly one correct form, so it gets a single attempt.
    const variants =
      hasValidPhone && !manualTest && !inboxReply
        ? phoneVariants(sanitizedPhone)
        : [sendTarget];
    let lastError: unknown = null;

    for (const variant of variants) {
      try {
        waMessageId = await attempt(variant);
        workingPhone = variant;
        lastError = null;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isRecipientNotAllowedError(message)) {
          throw err;
        }
        lastError = err;
        console.warn(
          `[send-message] variant "${variant}" rejected by Meta, trying next…`
        );
      }
    }

    if (lastError) throw lastError;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown Meta API error';
    console.error('[send-message] Meta send failed for all variants:', message);
    if (reservedMessageId) {
      throw new SendMessageError(
        inboxReply ? 'delivery_unconfirmed' : 'test_delivery_unconfirmed',
        inboxReply
          ? 'Delivery is unconfirmed. Check this conversation and the recipient before retrying to avoid a duplicate.'
          : 'The test was attempted, but delivery is unconfirmed. Check the recipient and Meta delivery status before approving another attempt.',
        502
      );
    }
    throw new SendMessageError('meta_error', `Meta API error: ${message}`, 502);
  }

  if (hasValidPhone && workingPhone !== sanitizedPhone) {
    console.log(
      `[send-message] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
    );
    await db
      .from('contacts')
      .update({ phone: workingPhone })
      .eq('id', contact.id);
  }

  // Persist the sent message. Field names MUST match the messages
  // schema (see 001_initial_schema.sql).
  // Interactive messages persist the body as content_text (so the
  // conversation-list preview reads sensibly) plus the full structured
  // payload so the thread can re-render the buttons / rows.
  //
  // Templates persist the *substituted* body. The composer pre-renders
  // and posts it as contentText; every other caller (the public API,
  // most importantly) sends none, and storing null there left the
  // Inbox rendering an empty bubble — issue #483.
  const persistedText =
    messageType === 'interactive'
      ? interactivePayload!.body
      : messageType === 'template'
        ? templateContentText(
            templateRow,
            templateBodyParams(templateParams, templateMessageParams),
            contentText
          )
        : (contentText ?? null);

  const messageData = {
    conversation_id: conversationId,
    sender_type: 'agent',
    content_type: messageType,
    content_text: persistedText,
    media_url: mediaUrl || null,
    template_name: templateName || null,
    interactive_payload:
      messageType === 'interactive' ? interactivePayload : null,
    message_id: waMessageId,
    status: 'sent',
    reply_to_message_id: replyToMessageId || null,
  };
  const messageWrite = reservedMessageId
    ? db
        .from('messages')
        .update(messageData)
        .eq('id', reservedMessageId)
        .eq('conversation_id', conversationId)
    : db.from('messages').insert(messageData);
  const { data: messageRecord, error: msgError } = await messageWrite
    .select()
    .single();

  if (msgError) {
    console.error('[send-message] error inserting sent message:', msgError);
    throw new SendMessageError(
      'db_error',
      `Message sent to Meta but failed to save to DB: ${msgError.message}`,
      500
    );
  }

  const lastMessageText =
    messageType === 'interactive'
      ? interactivePayloadPreviewText(interactivePayload!)
      : persistedText || `[${messageType}]`;

  await db
    .from('conversations')
    .update({
      last_message_text: lastMessageText,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // Pause any active Flow run for this contact — the agent stepping in
  // is the strongest "yield, human is here" signal. Best-effort.
  try {
    const { error: pauseErr } = await supabaseAdmin()
      .from('flow_runs')
      .update({
        status: 'paused_by_agent',
        ended_at: new Date().toISOString(),
        end_reason: 'agent_replied',
      })
      .eq('account_id', accountId)
      .eq('contact_id', contact.id)
      .eq('status', 'active');
    if (pauseErr) {
      console.error('[flows] pause-on-agent-send failed:', pauseErr.message);
    }
  } catch (err) {
    console.error(
      '[flows] pause-on-agent-send threw:',
      err instanceof Error ? err.message : err
    );
  }

  return { messageId: messageRecord.id, whatsappMessageId: waMessageId };
}
