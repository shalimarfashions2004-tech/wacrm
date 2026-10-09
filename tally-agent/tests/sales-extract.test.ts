import { describe, expect, it } from 'vitest';
import { extractSyncPayload } from '../src/extract';

const period = { start: '2026-09-01', end: '2026-09-30' };
function config(vouchers: string) {
  return {
    tallyUrl: 'http://localhost:9000', companyName: 'SHALIMAR FASHIONS', tallyRelease: '7.1',
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      const body = String(init?.body);
      const data = body.includes('fld_VoucherNumber') ? vouchers : '';
      return new Response(`<ENVELOPE><COMPANY NAME="SHALIMAR FASHIONS"><GUID>abc</GUID></COMPANY><DATA>${data}</DATA></ENVELOPE>`, { headers: { 'content-type': 'text/xml' } });
    }) as typeof fetch,
  };
}
const voucher = (id: string, changes = '') => `<ROW><GUID>${id}</GUID><VoucherNumber>${id}</VoucherNumber><Date>2026-09-01</Date><VoucherTypeName>GST SALES (B2B)</VoucherTypeName><IsSales>Yes</IsSales><IsCancelled>No</IsCancelled><IsOptional>No</IsOptional><Amount>125.50</Amount><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Silk</STOCKITEMNAME><BILLEDQTY>2 nos</BILLEDQTY><AMOUNT>100</AMOUNT></ALLINVENTORYENTRIES.LIST>${changes}</ROW>`;
describe('posted-sales extraction', () => {
  it('keeps custom Sales types and persists the posted-sales scope', async () => {
    const result = await extractSyncPayload(config(voucher('s1')), period);
    expect(result?.vouchers[0]).toMatchObject({ voucherType: 'GST SALES (B2B)', isSales: true, grossValuePaise: 12550 });
    expect(result?.metric_scope).toBe('posted_sales_gross_v1');
  });
  it('excludes purchases, cancelled and optional sales even if Tally returns them', async () => {
    const rows = voucher('p1').replace('<IsSales>Yes', '<IsSales>No') +
      voucher('c1').replace('<IsCancelled>No', '<IsCancelled>Yes') +
      voucher('o1').replace('<IsOptional>No', '<IsOptional>Yes') + voucher('s1');
    expect((await extractSyncPayload(config(rows), period))?.counts.vouchers).toBe(1);
  });
  it('stops on unclassified vouchers rather than assuming they are sales', async () => {
    await expect(extractSyncPayload(config(voucher('s1').replace('<IsSales>Yes</IsSales>', '')), period)).rejects.toThrow('sales classification');
  });
  it('rejects repeated voucher IDs and out-of-period sales before upload', async () => {
    await expect(extractSyncPayload(config(voucher('s1') + voucher('s1')), period)).rejects.toThrow('Duplicate voucher');
    await expect(extractSyncPayload(config(voucher('s1').replace('2026-09-01', '2026-08-01')), period)).rejects.toThrow('outside');
  });
});
