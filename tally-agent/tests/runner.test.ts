import { describe, expect, it, vi } from 'vitest';
import { uploadSyncPayload } from '../src/runner';

describe('CRM sync upload', () => {
  it('requires HTTPS and does not expose the key in errors', async () => {
    await expect(uploadSyncPayload({ tallyUrl: 'http://127.0.0.1:9000/', companyName: 'SHALIMAR FASHIONS', tallyRelease: '7.1' }, {} as never)).rejects.toThrow(/endpoint and scoped API key/);
    await expect(uploadSyncPayload({ tallyUrl: 'http://127.0.0.1:9000/', companyName: 'SHALIMAR FASHIONS', tallyRelease: '7.1', crmSyncEndpoint: 'http://crm.test/sync', crmApiKey: 'secret' }, {} as never)).rejects.toThrow(/HTTPS/);
  });

  it('posts the payload with a bearer key and returns the CRM receipt', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { run: { id: 'run-1' } } }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const payload = { company_name: 'SHALIMAR FASHIONS' } as never;
    await expect(uploadSyncPayload({ tallyUrl: 'http://127.0.0.1:9000/', companyName: 'SHALIMAR FASHIONS', tallyRelease: '7.1', crmSyncEndpoint: 'https://crm.shalimarfashions.com/api/v1/tally/sync', crmApiKey: 'secret', fetchImpl }, payload)).resolves.toEqual({ data: { run: { id: 'run-1' } } });
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer secret' }) }));
  });
  it('surfaces a bounded CRM validation reason without exposing the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid voucher row' }), { status: 400, headers: { 'content-type': 'application/json' } }));
    await expect(uploadSyncPayload({ tallyUrl: 'http://127.0.0.1:9000/', companyName: 'SHALIMAR FASHIONS', tallyRelease: '7.1', crmSyncEndpoint: 'https://crm.shalimarfashions.com/api/v1/tally/sync', crmApiKey: 'secret', fetchImpl }, {} as never)).rejects.toThrow('Invalid voucher row');
  });
});
