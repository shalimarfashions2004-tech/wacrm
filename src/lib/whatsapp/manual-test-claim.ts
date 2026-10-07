import { createHash } from 'node:crypto';

/** Stable UUID: the messages primary key reserves one attempt per approval. */
export function manualTestMessageId(approval: {
  phoneNumberId: string;
  recipient: string;
  expiresAt: number;
}): string {
  const bytes = createHash('sha256')
    .update(
      JSON.stringify([
        'manual-inbox-test-v1',
        approval.phoneNumberId,
        approval.recipient,
        approval.expiresAt,
      ])
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
