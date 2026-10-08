import { createHash } from 'node:crypto';
import type { AutomationStep } from '@/types';
import { buildSendComponents } from './template-send-builder';
import {
  validateInteractivePayload,
  type InteractiveMessagePayload,
} from './interactive';
import {
  sourceTemplate,
  type ManagedSnapshot,
  type ManagedRecipient,
  type ManagedSourceKind,
} from './managed-source';
import { ManagedDeliveryError } from './managed-policy';

export interface ManagedOperation {
  accountId: string;
  kind: ManagedSourceKind;
  sourceId: string;
  contactId: string;
  recipientId?: string;
  runId?: string;
  stepId?: string;
  conversationId?: string;
  context?: { message_text?: string; vars?: Record<string, unknown> };
}
export interface PreparedManagedPayload {
  body: Record<string, unknown>;
  wire: string;
  hash: string;
  text: string;
  contentType: 'template' | 'text' | 'interactive';
  templateName?: string;
  interactive?: InteractiveMessagePayload;
}

/** All message content comes from the database-returned approved snapshot. */
export function buildManagedPayload(
  snapshot: ManagedSnapshot,
  operation: ManagedOperation,
  phone: string
): PreparedManagedPayload {
  const to = phone.replace(/[^0-9]/g, '');
  if (!/^91[6-9][0-9]{9}$/.test(to))
    throw new ManagedDeliveryError(
      'messaging_india_mobile_required',
      'An Indian mobile number is required.'
    );
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
  };
  let text = '';
  let contentType: PreparedManagedPayload['contentType'] = 'text';
  let templateName: string | undefined;
  let interactive: InteractiveMessagePayload | undefined;
  if (operation.kind === 'broadcast') {
    const r = (snapshot.children as ManagedRecipient[]).find(
      (r) => r.id === operation.recipientId && r.contact === operation.contactId
    );
    if (!r || r.phone !== phone)
      throw new ManagedDeliveryError(
        'messaging_recipient_not_found',
        'The saved recipient changed. Review the campaign again.'
      );
    const template = sourceTemplate(
      snapshot,
      snapshot.source.template ?? '',
      snapshot.source.language
    );
    const params = r.params ?? [];
    if (!Array.isArray(params) || params.some((p) => typeof p !== 'string'))
      throw new Error('Invalid saved template parameters');
    body.type = 'template';
    contentType = 'template';
    templateName = template.name;
    body.template = {
      name: template.name,
      language: { code: template.language },
      components: buildSendComponents(template, {
        body: params,
        headerMediaUrl: snapshot.source.audience?.headerMediaUrl,
      }),
    };
    text = template.body_text.replace(
      /\{\{(\d+)\}\}/g,
      (_m, n) => params[Number(n) - 1] ?? ''
    );
  } else {
    const step = (snapshot.children as AutomationStep[]).find(
      (s) => s.id === operation.stepId
    );
    if (!step)
      throw new ManagedDeliveryError(
        'messaging_step_not_found',
        'The saved workflow step changed.'
      );
    const config = step.step_config as Record<string, unknown>;
    if (step.step_type === 'send_template') {
      const template = sourceTemplate(
        snapshot,
        String(config.template_name ?? ''),
        typeof config.language === 'string' ? config.language : undefined
      );
      const variables = (config.variables ?? {}) as Record<string, unknown>;
      const params = Object.keys(variables)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((k) => String(variables[k]));
      body.type = 'template';
      contentType = 'template';
      templateName = template.name;
      body.template = {
        name: template.name,
        language: { code: template.language },
        components: buildSendComponents(template, { body: params }),
      };
      text = template.body_text.replace(
        /\{\{(\d+)\}\}/g,
        (_m, n) => params[Number(n) - 1] ?? ''
      );
    } else if (step.step_type === 'send_message') {
      text = String(config.text ?? '').replace(
        /\{\{\s*([\w.]+)\s*\}\}/g,
        (_m, key: string) => {
          const [ns, prop] = key.split('.');
          return ns === 'message' && prop === 'text'
            ? String(operation.context?.message_text ?? '')
            : ns === 'vars' && prop
              ? String(operation.context?.vars?.[prop] ?? '')
              : '';
        }
      );
      if (!text.trim() || text.length > 4096)
        throw new Error('Message must contain between 1 and 4096 characters');
      body.type = 'text';
      body.text = { body: text };
    } else if (
      step.step_type === 'send_buttons' ||
      step.step_type === 'send_list'
    ) {
      const check = validateInteractivePayload(config);
      if (!check.ok) throw new Error(check.error);
      interactive = config as unknown as InteractiveMessagePayload;
      text = interactive.body;
      contentType = 'interactive';
      body.type = 'interactive';
      body.interactive = {
        type: interactive.kind === 'buttons' ? 'button' : 'list',
        body: { text },
        ...(interactive.header
          ? { header: { type: 'text', text: interactive.header } }
          : {}),
        ...(interactive.footer ? { footer: { text: interactive.footer } } : {}),
        action:
          interactive.kind === 'buttons'
            ? {
                buttons: interactive.buttons.map((b) => ({
                  type: 'reply',
                  reply: { id: b.id, title: b.title },
                })),
              }
            : {
                button: interactive.button_label,
                sections: interactive.sections,
              },
      };
    } else throw new Error('Unsupported messaging step');
  }
  const wire = JSON.stringify(body);
  return {
    body,
    wire,
    hash: createHash('sha256').update(wire).digest('hex'),
    text,
    contentType,
    templateName,
    interactive,
  };
}
