import type { AudienceConfig } from '@/lib/broadcasts/audience';
import type { Contact } from '@/types';
export interface CustomerAudienceReceipt {
  import_id: string;
  source_sha256: string;
  source_as_of: string;
  source_start: string;
  source_kind: string;
  total: number;
  eligible: number;
  excluded: number;
  reasons: Record<string, number>;
  contacts: Contact[];
  segment_rules: string;
}
export async function previewCustomerAudience(
  audience: AudienceConfig,
  language: string,
  signal?: AbortSignal
): Promise<CustomerAudienceReceipt> {
  const response = await fetch('/api/customer-data/audience', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      importId: audience.customerData?.importId,
      preset: audience.customerData?.preset,
      language,
      excludeTagIds: audience.excludeTagIds,
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? 'Customer audience could not be checked.');
  return data as CustomerAudienceReceipt;
}
