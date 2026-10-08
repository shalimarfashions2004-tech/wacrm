import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import { dispatchManagedMessage } from '@/lib/whatsapp/managed-delivery';
import { supabaseAdmin } from './admin-client';

interface ManagedAutomationIdentity {
  sourceId: string;
  runId: string | null;
  stepId: string;
  context?: { message_text?: string; vars?: Record<string, unknown> };
}

interface SendTextArgs {
  managed: ManagedAutomationIdentity;
  /** Account-level tenancy key. Drives contact + whatsapp_config
   *  lookups so an automation authored by user A still sends through
   *  the WhatsApp number user B saved on the same account. */
  accountId: string;
  /** Original author of the automation/flow — used for INSERT audit
   *  columns (messages.sender_id-ish) and for resolving the agent's
   *  identity in logs. Not consulted for tenancy. */
  userId: string;
  conversationId: string;
  contactId: string;
  text: string;
}

interface SendTemplateArgs {
  managed: ManagedAutomationIdentity;
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  templateName: string;
  language?: string;
  params?: string[];
}

interface SendInteractiveArgs {
  managed: ManagedAutomationIdentity;
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  payload: InteractiveMessagePayload;
}

async function send(
  args: SendTextArgs | SendTemplateArgs | SendInteractiveArgs
): Promise<{ whatsapp_message_id: string }> {
  if (!args.managed?.runId)
    throw new Error('A saved workflow run is required for automatic messaging');
  const result = await dispatchManagedMessage(supabaseAdmin(), {
    accountId: args.accountId,
    kind: 'automation',
    sourceId: args.managed.sourceId,
    contactId: args.contactId,
    conversationId: args.conversationId,
    runId: args.managed.runId,
    stepId: args.managed.stepId,
    context: args.managed.context,
  });
  if (!result.messageId) throw new Error('No confirmed provider receipt');
  return { whatsapp_message_id: result.messageId };
}
export const engineSendText = (args: SendTextArgs) => send(args);
export const engineSendTemplate = (args: SendTemplateArgs) => send(args);
export const engineSendInteractive = (args: SendInteractiveArgs) => send(args);
