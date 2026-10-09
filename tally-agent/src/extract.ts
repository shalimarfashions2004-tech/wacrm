import { AgentConfig, Period, SyncPayload, Ledger, Voucher, StockItem } from './config';
import { readTallyXml, sha256, text, descendants, XmlNode } from './tally-xml';

const request = (company: string, period: Period) => `<ENVELOPE><HEADER><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ShalimarReadOnly</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY><SVFROMDATE>${period.start.replaceAll('-', '')}</SVFROMDATE><SVTODATE>${period.end.replaceAll('-', '')}</SVTODATE></STATICVARIABLES></DESC></BODY></ENVELOPE>`;
const child = (n: XmlNode, name: string) => n.getElementsByTagName(name)[0];
const money = (s: string) => { const n = Number(s.replaceAll(',', '').replace(/[₹$]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
function first(root: XmlNode, ...names: string[]) { for (const n of names) { const x = child(root, n); if (x) return text(x); } return ''; }

export async function extractSyncPayload(config: AgentConfig, period: Period): Promise<SyncPayload | null> {
  const doc = await readTallyXml(config.tallyUrl, request(config.companyName, period), { maxResponseBytes: config.maxResponseBytes, timeoutMs: config.requestTimeoutMs, fetchImpl: config.fetchImpl });
  const root = (doc as unknown as { documentElement: XmlNode }).documentElement;
  const company = first(root, 'COMPANYNAME', 'NAME', 'SVCURRENTCOMPANY'); if (company !== config.companyName) return null;
  const fingerprint = sha256(`${company}\n${first(root, 'COMPANYGUID', 'GUID')}`);
  const ledgers: Ledger[] = descendants(root, 'LEDGER').map((n, i) => ({ id: first(n, 'GUID', 'MASTERID') || `ledger-${i + 1}`, name: first(n, 'NAME', 'LEDGERNAME'), phone: first(n, 'PHONE', 'PHONENO') || undefined, address: first(n, 'ADDRESS') || undefined })).filter(x => x.name);
  const vouchers: Voucher[] = descendants(root, 'VOUCHER').map((n, i) => ({ id: first(n, 'GUID', 'MASTERID') || `voucher-${i + 1}`, number: first(n, 'VOUCHERNUMBER', 'VOUCHERNO') || undefined, date: first(n, 'DATE'), party: first(n, 'PARTYLEDGERNAME', 'PARTYNAME') || undefined, grossValuePaise: money(first(n, 'AMOUNT', 'GROSSVALUE')), lines: descendants(n, 'INVENTORYENTRIES.LIST').map(l => ({ item: first(l, 'STOCKITEMNAME', 'ITEM'), quantity: Number(first(l, 'ACTUALQTY', 'QUANTITY')) || undefined, ratePaise: money(first(l, 'RATE')), valuePaise: money(first(l, 'AMOUNT')) })) }));
  const stock_items: StockItem[] = descendants(root, 'STOCKITEM').map((n, i) => ({ id: first(n, 'GUID', 'MASTERID') || `stock-${i + 1}`, name: first(n, 'NAME', 'STOCKITEMNAME'), group: first(n, 'PARENT', 'GROUP') || undefined, unit: first(n, 'BASEUNITS', 'UNIT') || undefined, quantity: Number(first(n, 'CLOSINGBALANCE', 'QUANTITY')) || undefined, ratePaise: money(first(n, 'RATE')), valuePaise: money(first(n, 'CLOSINGVALUE', 'VALUE')) })).filter(x => x.name);
  const payloadBase = { company_name: company, company_fingerprint: fingerprint, tally_release: config.tallyRelease, source_period_start: period.start, source_period_end: period.end, ledgers, vouchers, stock_items, counts: { ledgers: ledgers.length, vouchers: vouchers.length, stock_items: stock_items.length }, gross_value_paise: vouchers.reduce((sum, v) => sum + v.grossValuePaise, 0) };
  return { ...payloadBase, payload_sha256: sha256(JSON.stringify(payloadBase)) };
}
