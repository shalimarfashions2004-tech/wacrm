import { AgentConfig, Period, SyncPayload, Ledger, Voucher, StockItem } from './config';
import { readTallyXml, sha256, text, descendants, XmlNode } from './tally-xml';

const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\"', '&quot;').replaceAll("'", '&apos;');
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const request = (company: string, period: Period, collection: 'ShalimarCompany' | 'ShalimarLedgers' | 'ShalimarVouchers' | 'ShalimarStockItems') => { if (!company.trim() || /[<>]/.test(company) || !validDate(period.start) || !validDate(period.end) || period.start > period.end) throw new Error('Invalid company or period'); return `<ENVELOPE><HEADER><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${collection}</ID></HEADER><BODY><DESC><TDL><TDLMESSAGE><COLLECTION NAME="ShalimarCompany"><TYPE>Company</TYPE><FETCH>Name,GUID</FETCH><COMPUTE>CompanyName : $Name</COMPUTE><COMPUTE>CompanyGUID : $GUID</COMPUTE></COLLECTION><COLLECTION NAME="ShalimarLedgers"><TYPE>Ledger</TYPE><FETCH>GUID,Name,Phone,Address</FETCH></COLLECTION><COLLECTION NAME="ShalimarVouchers"><TYPE>Voucher</TYPE><FETCH>GUID,VoucherNumber,Date,PartyLedgerName,Amount,InventoryEntries</FETCH></COLLECTION><COLLECTION NAME="ShalimarStockItems"><TYPE>Stock Item</TYPE><FETCH>GUID,Name,Parent,BaseUnits,ClosingBalance,ClosingValue</FETCH></COLLECTION></TDLMESSAGE></TDL><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY><SVFROMDATE>${period.start.replaceAll('-', '')}</SVFROMDATE><SVTODATE>${period.end.replaceAll('-', '')}</SVTODATE></STATICVARIABLES></DESC></BODY></ENVELOPE>`; };
const child = (n: XmlNode, name: string) => n.getElementsByTagName(name)[0];
const money = (s: string) => { const n = Number(s.replaceAll(',', '').replace(/[₹$]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
function first(root: XmlNode, ...names: string[]) { for (const n of names) { const x = child(root, n); if (x) return text(x); } return ''; }

export async function extractSyncPayload(config: AgentConfig, period: Period): Promise<SyncPayload | null> {
  const doc = await readTallyXml(config.tallyUrl, request(config.companyName, period, 'ShalimarCompany'), { maxResponseBytes: config.maxResponseBytes, timeoutMs: config.requestTimeoutMs, fetchImpl: config.fetchImpl });
  const root = (doc as unknown as { documentElement: XmlNode }).documentElement;
  // TallyPrime returns the company identity as COMPANYNAME in some releases and
  // as COMPANY NAME="..." in others. Accept only an exact match in either shape.
  const companyNode = descendants(root, 'COMPANY').find((n) => n.getAttribute('NAME') || first(n, 'NAME'));
  const company = (companyNode?.getAttribute('NAME') || (companyNode ? first(companyNode, 'NAME') : '') || first(root, 'COMPANYNAME')).trim();
  if (company !== config.companyName.trim()) return null;
  const companyId = companyNode?.getAttribute('GUID') || (companyNode ? first(companyNode, 'GUID') : '') || first(root, 'COMPANYGUID', 'GUID');
  if (!companyId) return null;
  const fingerprint = sha256(`${company}\n${companyId}`);
  const readCollection = async (collection: 'ShalimarLedgers' | 'ShalimarVouchers' | 'ShalimarStockItems') => {
    const result = await readTallyXml(config.tallyUrl, request(config.companyName, period, collection), { maxResponseBytes: config.maxResponseBytes, timeoutMs: config.requestTimeoutMs, fetchImpl: config.fetchImpl });
    return (result as unknown as { documentElement: XmlNode }).documentElement;
  };
  const ledgerRoot = await readCollection('ShalimarLedgers');
  const voucherRoot = await readCollection('ShalimarVouchers');
  const stockRoot = await readCollection('ShalimarStockItems');
  const ledgers: Ledger[] = descendants(ledgerRoot, 'LEDGER').map((n, i) => ({ id: first(n, 'GUID', 'MASTERID') || `ledger-${i + 1}`, name: first(n, 'NAME', 'LEDGERNAME'), phone: first(n, 'PHONE', 'PHONENO') || undefined, address: first(n, 'ADDRESS') || undefined })).filter(x => x.name);
  const vouchers: Voucher[] = descendants(voucherRoot, 'VOUCHER').map((n, i) => ({ id: first(n, 'GUID', 'MASTERID') || `voucher-${i + 1}`, number: first(n, 'VOUCHERNUMBER', 'VOUCHERNO') || undefined, date: first(n, 'DATE'), party: first(n, 'PARTYLEDGERNAME', 'PARTYNAME') || undefined, grossValuePaise: money(first(n, 'AMOUNT', 'GROSSVALUE')), lines: descendants(n, 'INVENTORYENTRIES.LIST').map(l => ({ item: first(l, 'STOCKITEMNAME', 'ITEM'), quantity: Number(first(l, 'ACTUALQTY', 'QUANTITY')) || undefined, ratePaise: money(first(l, 'RATE')), valuePaise: money(first(l, 'AMOUNT')) })) }));
  const stock_items: StockItem[] = descendants(stockRoot, 'STOCKITEM').map((n, i) => ({ id: first(n, 'GUID', 'MASTERID') || `stock-${i + 1}`, name: first(n, 'NAME', 'STOCKITEMNAME'), group: first(n, 'PARENT', 'GROUP') || undefined, unit: first(n, 'BASEUNITS', 'UNIT') || undefined, quantity: Number(first(n, 'CLOSINGBALANCE', 'QUANTITY')) || undefined, ratePaise: money(first(n, 'RATE')), valuePaise: money(first(n, 'CLOSINGVALUE', 'VALUE')) })).filter(x => x.name);
  const payloadBase = { company_name: company, company_fingerprint: fingerprint, tally_release: config.tallyRelease, source_period_start: period.start, source_period_end: period.end, ledgers, vouchers, stock_items, counts: { ledgers: ledgers.length, vouchers: vouchers.length, stock_items: stock_items.length }, gross_value_paise: vouchers.reduce((sum, v) => sum + v.grossValuePaise, 0) };
  return { ...payloadBase, payload_sha256: sha256(JSON.stringify(payloadBase)) };
}
