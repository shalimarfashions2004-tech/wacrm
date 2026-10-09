import { AgentConfig, Period, SyncPayload } from './config';
import { extractSyncPayload } from './extract';
import { BoundedQueue } from './queue';
export async function runOnce(config: AgentConfig, period: Period): Promise<SyncPayload | null> { return extractSyncPayload(config, period); }
export { BoundedQueue };
