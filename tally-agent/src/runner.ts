import { AgentConfig, Period, SyncPayload } from './config';
import { extractSyncPayload } from './extract';
import { BoundedQueue } from './queue';
export async function runOnce(config: AgentConfig, period: Period): Promise<SyncPayload | null> { return extractSyncPayload(config, period); }
export { BoundedQueue };

/** Submit one already-validated receipt to CRM. The key is never logged. */
export async function uploadSyncPayload(config: AgentConfig, payload: SyncPayload): Promise<unknown> {
  if (!config.crmSyncEndpoint || !config.crmApiKey) throw new Error('CRM sync endpoint and scoped API key are required');
  const endpoint = new URL(config.crmSyncEndpoint);
  if (endpoint.protocol !== 'https:') throw new Error('CRM sync endpoint must use HTTPS');
  const response = await (config.fetchImpl ?? fetch)(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.crmApiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.requestTimeoutMs ?? 15_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : `HTTP ${response.status}`;
    throw new Error(`CRM sync failed: ${message.slice(0, 240)}`);
  }
  return body;
}
