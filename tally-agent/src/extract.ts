import { AgentConfig, Period, SyncPayload, Ledger, Voucher, StockItem } from './config';
import { readTallyXml, sha256, text, descendants, XmlNode } from './tally-xml';

const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\"', '&quot;').replaceAll("'", '&apos;');
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const request = (company: string, period: Period, collection: 'ShalimarCompany' | 'ShalimarLedgers' | 'ShalimarVouchers' | 'ShalimarStockItems') => {
  if (!company.trim() || /[<>]/.test(company) || !validDate(period.start) || !validDate(period.end) || period.start > period.end) throw new Error('Invalid company or period');
  const escaped = escapeXml(company);
  if (collection === 'ShalimarCompany') return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ShalimarConnectionCompany</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${escaped}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ShalimarConnectionCompany" ISMODIFY="No"><TYPE>Company</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>GUID</NATIVEMETHOD><FILTER>ShalimarRequestedCompany</FILTER></COLLECTION><SYSTEM TYPE="Formulae" NAME="ShalimarRequestedCompany">$Name = ##SVCurrentCompany</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  const type = collection === 'ShalimarLedgers' ? 'Ledger' : collection === 'ShalimarVouchers' ? 'Voucher' : 'StockItem';
  const fields = collection === 'ShalimarLedgers' ? ['GUID', 'Name', 'Phone', 'Address', 'Parent'] : collection === 'ShalimarVouchers' ? ['GUID', 'VoucherNumber', 'Date', 'PartyLedgerName', 'Amount'] : ['GUID', 'Name', 'Parent', 'BaseUnits', 'ClosingBalance', 'ClosingValue'];
  const fieldXml = fields.map((field) => {
    const expression = field === 'Date'
      ? 'if $$IsEmpty:$Date then "" else $$PyrlYYYYMMDDFormat:$Date:"-"'
      // Tally renders amount values with debit/credit decorations in some
      // releases. Export a plain signed number so the CRM can reconcile it.
      : field === 'Amount'
        ? 'if $$IsEmpty:$Amount then 0 else $$StringFindAndReplace:(if $$IsDebit:$Amount then -$$NumValue:$Amount else $$NumValue:$Amount):"(-)":"-"'
        : `$${field}`;
    return `<FIELD NAME="fld_${field}"><SET>${expression}</SET><XMLTAG>${field}</XMLTAG></FIELD>`;
  }).join('');
  const names = fields.map((field) => `fld_${field}`).join(',');
  const fetch = collection === 'ShalimarVouchers' ? '<FETCH>AllInventoryEntries,AllLedgerEntries,PartyLedgerName</FETCH>' : '';
  const fullObject = collection === 'ShalimarVouchers' ? '<FULLOBJECT>Yes</FULLOBJECT>' : '';
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>ShalimarLiveReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${escaped}</SVCURRENTCOMPANY><SVFROMDATE>${period.start.replaceAll('-', '')}</SVFROMDATE><SVTODATE>${period.end.replaceAll('-', '')}</SVTODATE></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="ShalimarLiveReport"><FORMS>ShalimarForm</FORMS></REPORT><FORM NAME="ShalimarForm"><PARTS>ShalimarPart</PARTS><XMLTAG>DATA</XMLTAG></FORM><PART NAME="ShalimarPart"><LINES>ShalimarLine</LINES><REPEAT>ShalimarLine : ShalimarCollection</REPEAT><SCROLLED>Vertical</SCROLLED></PART><LINE NAME="ShalimarLine"><FIELDS>${names}</FIELDS><XMLTAG>ROW</XMLTAG>${fullObject}</LINE>${fieldXml}<COLLECTION NAME="ShalimarCollection"><TYPE>${type}</TYPE>${fetch}</COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
};
const child = (n: XmlNode, name: string) => n.getElementsByTagName(name)[0];
const money = (s: string) => {
  const raw = s.trim().replaceAll(',', '').replace(/[₹$]/g, '');
  const suffix = raw.match(/\s+(Dr|Cr)\.?$/i)?.[1]?.toLowerCase();
  const numeric = raw.replace(/\s+(Dr|Cr)\.?$/i, '').trim();
  const n = Number((numeric.replace(/^\((.*)\)$/, '-$1').match(/-?\d+(?:\.\d+)?/) ?? [])[0]);
  if (!Number.isFinite(n)) return 0;
  const signed = suffix === 'dr' ? -Math.abs(n) : suffix === 'cr' ? Math.abs(n) : n;
  return Math.round(signed * 100);
};
const quantity = (s: string) => {
  const n = Number((s.trim().replaceAll(',', '').match(/-?\d+(?:\.\d+)?/) ?? [])[0]);
  return Number.isFinite(n) ? n : undefined;
};
function first(root: XmlNode, ...names: string[]) { for (const n of names) { const x = child(root, n); if (x) return text(x); } return ''; }
function value(root: XmlNode, ...names: string[]) { for (const n of names) { const attr = root.getAttribute(n); if (attr) return attr.trim(); const x = child(root, n); if (x) return text(x); } return ''; }

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
  const rows = (root: XmlNode, fallback: string) => { const reportRows = descendants(root, 'ROW'); return reportRows.length ? reportRows : descendants(root, fallback); };
  const ledgers: Ledger[] = rows(ledgerRoot, 'LEDGER').map((n, i) => ({ id: value(n, 'GUID', 'MASTERID') || `ledger-${i + 1}`, name: value(n, 'NAME', 'LEDGERNAME'), phone: value(n, 'PHONE', 'PHONENO') || undefined, address: value(n, 'ADDRESS') || undefined })).filter(x => x.name);
  const vouchers: Voucher[] = rows(voucherRoot, 'VOUCHER').map((n, i) => {
    const inventory = [...descendants(n, 'ALLINVENTORYENTRIES.LIST'), ...descendants(n, 'INVENTORYENTRIES.LIST')];
    return { id: value(n, 'GUID', 'MASTERID') || `voucher-${i + 1}`, number: value(n, 'VOUCHERNUMBER', 'VOUCHERNO') || undefined, date: value(n, 'DATE'), party: value(n, 'PARTYLEDGERNAME', 'PARTYNAME') || undefined, grossValuePaise: money(value(n, 'AMOUNT', 'GROSSVALUE')), lines: inventory.map(l => ({ item: value(l, 'STOCKITEMNAME', 'ITEM'), quantity: quantity(value(l, 'ACTUALQTY', 'BILLEDQTY', 'QUANTITY')), ratePaise: money(value(l, 'RATE')), valuePaise: money(value(l, 'AMOUNT')) })) };
  });
  const stock_items: StockItem[] = rows(stockRoot, 'STOCKITEM').map((n, i) => ({ id: value(n, 'GUID', 'MASTERID') || `stock-${i + 1}`, name: value(n, 'NAME', 'STOCKITEMNAME'), group: value(n, 'PARENT', 'GROUP') || undefined, unit: value(n, 'BASEUNITS', 'UNIT') || undefined, quantity: Number(value(n, 'CLOSINGBALANCE', 'QUANTITY')) || undefined, ratePaise: money(value(n, 'RATE')), valuePaise: money(value(n, 'CLOSINGVALUE', 'VALUE')) })).filter(x => x.name);
  const payloadBase = { company_name: company, company_fingerprint: fingerprint, tally_release: config.tallyRelease, source_period_start: period.start, source_period_end: period.end, ledgers, vouchers, stock_items, counts: { ledgers: ledgers.length, vouchers: vouchers.length, stock_items: stock_items.length }, gross_value_paise: vouchers.reduce((sum, v) => sum + v.grossValuePaise, 0) };
  return { ...payloadBase, payload_sha256: sha256(JSON.stringify(payloadBase)) };
}
