import { runOnce, uploadSyncPayload } from './runner';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const config = {
    tallyUrl: process.env.TALLY_URL ?? 'http://127.0.0.1:9000/',
    companyName: process.env.TALLY_COMPANY ?? 'SHALIMAR FASHIONS',
    tallyRelease: required('TALLY_RELEASE'),
    crmSyncEndpoint: process.env.CRM_SYNC_ENDPOINT ?? 'https://crm.shalimarfashions.com/api/v1/tally/sync',
    crmApiKey: required('CRM_API_KEY'),
  };
  const period = { start: required('TALLY_PERIOD_START'), end: required('TALLY_PERIOD_END') };
  const payload = await runOnce(config, period);
  if (!payload) throw new Error('Tally company identity did not match SHALIMAR FASHIONS');
  const receipt = await uploadSyncPayload(config, payload) as { data?: { run?: unknown }; error?: unknown };
  console.log(JSON.stringify({ status: 'uploaded', receipt: receipt.data?.run ?? receipt.error ?? receipt }, null, 2));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Tally sync failed'); process.exitCode = 1; });
