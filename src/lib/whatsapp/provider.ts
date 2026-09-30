import type { ConsentCategory } from '@/types';

export type DeliveryMode = 'dry-run' | 'live';

export interface OutboundMessage {
  idempotencyKey: string;
  to: string;
  category: ConsentCategory;
  templateName?: string;
  language?: string;
  body?: string;
  mediaUrl?: string;
}

export interface ProviderSendResult {
  providerMessageId: string;
  status: 'dry_run' | 'accepted';
  estimatedCostInr: number;
}

export interface MessagingProvider {
  readonly name: string;
  readonly mode: DeliveryMode;
  send(message: OutboundMessage): Promise<ProviderSendResult>;
  health(): Promise<{ ok: boolean; provider: string; mode: DeliveryMode }>;
}

/** Safe default: exercises validation and idempotency without contacting Meta. */
export class DryRunProvider implements MessagingProvider {
  readonly name = 'dry-run';
  readonly mode = 'dry-run' as const;
  readonly attempted: OutboundMessage[] = [];

  async send(message: OutboundMessage): Promise<ProviderSendResult> {
    if (!message.idempotencyKey || !message.to) throw new Error('Recipient and idempotency key are required');
    if (message.category === 'marketing' && !message.templateName) throw new Error('Marketing sends require an approved template');
    this.attempted.push(message);
    return { providerMessageId: `dry_${this.attempted.length}`, status: 'dry_run', estimatedCostInr: 0 };
  }

  async health() { return { ok: true, provider: this.name, mode: this.mode }; }
}

export function createMessagingProvider(mode: DeliveryMode = 'dry-run'): MessagingProvider {
  if (mode !== 'dry-run') throw new Error('Live provider wiring is approval-gated; use the Meta adapter only after credentials and consent controls are reviewed');
  return new DryRunProvider();
}
