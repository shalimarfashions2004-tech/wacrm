import { runOnce, uploadSyncPayload } from './runner';
import { parseSalesControls } from './controls';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function timeoutMs(): number {
  const configured = process.env.TALLY_REQUEST_TIMEOUT_MS?.trim();
  if (!configured) return 600_000;
  if (!/^\d+$/.test(configured)) throw new Error('TALLY_REQUEST_TIMEOUT_MS must be a whole number of milliseconds');
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 30_000 || value > 900_000) throw new Error('TALLY_REQUEST_TIMEOUT_MS must be between 30000 and 900000');
  return value;
}

async function main() {
  const config = {
    tallyUrl: process.env.TALLY_URL ?? 'http://127.0.0.1:9000/',
    companyName: process.env.TALLY_COMPANY ?? 'SHALIMAR FASHIONS',
    tallyRelease: required('TALLY_RELEASE'),
    // Full voucher objects can take longer and be larger than master-only
    // reports. Keep both limits finite while allowing the closed-period read
    // to finish on the shop computer.
    maxResponseBytes: 64 * 1024 * 1024,
    requestTimeoutMs: timeoutMs(),
    onProgress: (message: string) => console.log(`[Tally] ${message}`),
    crmSyncEndpoint: process.env.CRM_SYNC_ENDPOINT ?? 'https://crm.shalimarfashions.com/api/v1/tally/sync',
    crmApiKey: required('CRM_API_KEY'),
  };
  const period = { start: required('TALLY_PERIOD_START'), end: required('TALLY_PERIOD_END') };
  const controls = parseSalesControls(required('TALLY_SALES_VOUCHER_COUNT'), required('TALLY_SALES_GROSS_INR'), period);
  const payload = await runOnce(config, period, controls);
  if (!payload) throw new Error('Tally company identity did not match SHALIMAR FASHIONS');
  console.log(`[Tally] Read complete: ${payload.counts.ledgers} ledgers, ${payload.counts.vouchers} posted sales vouchers, ${payload.counts.stock_items} stock items.`);
  console.log('[Tally] Uploading the verified snapshot to CRM...');
  const receipt = await uploadSyncPayload(config, payload) as { data?: { run?: unknown }; error?: unknown };
  console.log('[Tally] CRM upload complete.');
  console.log(JSON.stringify({ status: 'uploaded', receipt: receipt.data?.run ?? receipt.error ?? receipt }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Tally sync failed';
  if (error instanceof DOMException && error.name === 'AbortError' || /operation was aborted|aborted|timed out/i.test(message)) {
    console.error(`${message.includes('timed out') ? message : 'Tally read timed out'}. Keep SHALIMAR FASHIONS open at TallyPrime's Gateway screen and retry; no data was uploaded.`);
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
