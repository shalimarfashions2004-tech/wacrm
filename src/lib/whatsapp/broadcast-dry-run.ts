import { createMessagingProvider } from './provider';
import { isValidE164, sanitizePhoneForMeta } from './phone-utils';

export interface DryRunRecipient {
  phone: string;
  idempotencyKey?: string;
}

export interface DryRunResult {
  phone: string;
  status: 'sent' | 'failed';
  whatsapp_message_id?: string;
  error?: string;
}

/** Exercise recipient validation and idempotency without contacting Meta. */
export async function runDryRunBroadcast({
  recipients,
  templateName,
}: {
  recipients: DryRunRecipient[];
  templateName: string;
}): Promise<{ sent: number; failed: number; results: DryRunResult[] }> {
  const provider = createMessagingProvider('dry-run');
  const results: DryRunResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const [index, recipient] of recipients.entries()) {
    const sanitized = sanitizePhoneForMeta(recipient.phone);
    if (!isValidE164(sanitized)) {
      results.push({ phone: recipient.phone, status: 'failed', error: 'Invalid phone number format' });
      failed++;
      continue;
    }

    try {
      const result = await provider.send({
        idempotencyKey: recipient.idempotencyKey ?? `dry-run:${sanitized}:${index}`,
        to: sanitized,
        category: 'marketing',
        templateName,
      });
      results.push({ phone: recipient.phone, status: 'sent', whatsapp_message_id: result.providerMessageId });
      sent++;
    } catch (error) {
      results.push({
        phone: recipient.phone,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  return { sent, failed, results };
}
