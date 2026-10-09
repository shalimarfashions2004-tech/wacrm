import { describe, expect, it } from 'vitest';
import { extractSyncPayload } from '../src/extract';
const xml = (company: string) => `<ENVELOPE><COMPANYNAME>${company}</COMPANYNAME><COMPANYGUID>abc</COMPANYGUID><LEDGER><GUID>l1</GUID><NAME>Asha</NAME><PHONE>+91 999</PHONE></LEDGER><VOUCHER><GUID>v1</GUID><DATE>20260401</DATE><PARTYLEDGERNAME>Asha</PARTYLEDGERNAME><AMOUNT>100.00</AMOUNT><INVENTORYENTRIES.LIST><STOCKITEMNAME>Silk</STOCKITEMNAME><QUANTITY>2</QUANTITY><RATE>50</RATE><AMOUNT>100</AMOUNT></INVENTORYENTRIES.LIST></VOUCHER><STOCKITEM><GUID>s1</GUID><NAME>Silk</NAME><CLOSINGVALUE>100</CLOSINGVALUE></STOCKITEM></ENVELOPE>`;
const config = (body: string) => ({ tallyUrl: 'http://localhost:9000', companyName: 'SHALIMAR FASHIONS', tallyRelease: '7.1', fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/xml' } }) });
describe('extractSyncPayload', () => {
  it('returns null for a wrong company', async () => { await expect(extractSyncPayload(config(xml('OTHER')), { start: '2026-04-01', end: '2026-04-30' })).resolves.toBeNull(); });
  it('extracts records and deterministic hashes', async () => { const period = { start: '2026-04-01', end: '2026-04-30' }; const a = await extractSyncPayload(config(xml('SHALIMAR FASHIONS')), period); const b = await extractSyncPayload(config(xml('SHALIMAR FASHIONS')), period); expect(a).toEqual(b); expect(a?.counts).toEqual({ ledgers: 1, vouchers: 1, stock_items: 1 }); expect(a?.gross_value_paise).toBe(10000); expect(a?.payload_sha256).toMatch(/^[a-f0-9]{64}$/); });
});
