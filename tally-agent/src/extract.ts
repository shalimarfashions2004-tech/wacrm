import { AgentConfig, Period, SyncPayload, Ledger, Voucher, StockItem, SalesControls } from './config';
import { readTallyXml, sha256, text, descendants, XmlNode } from './tally-xml';

const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\"', '&quot;').replaceAll("'", '&apos;');
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function periodWindows(period: Period): Period[] {
  const windows: Period[] = [];
  let cursor = new Date(`${period.start}T00:00:00Z`);
  const end = new Date(`${period.end}T00:00:00Z`);
  while (cursor <= end) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const windowEnd = monthEnd < end ? monthEnd : end;
    windows.push({ start: cursor.toISOString().slice(0, 10), end: windowEnd.toISOString().slice(0, 10) });
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}
const request = (company: string, period: Period, collection: 'ShalimarCompany' | 'ShalimarLedgers' | 'ShalimarVouchers' | 'ShalimarStockItems') => {
  if (!company.trim() || /[<>]/.test(company) || !validDate(period.start) || !validDate(period.end) || period.start > period.end) throw new Error('Invalid company or period');
  const escaped = escapeXml(company);
  if (collection === 'ShalimarCompany') return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ShalimarConnectionCompany</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${escaped}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ShalimarConnectionCompany" ISMODIFY="No"><TYPE>Company</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>GUID</NATIVEMETHOD><FILTER>ShalimarRequestedCompany</FILTER></COLLECTION><SYSTEM TYPE="Formulae" NAME="ShalimarRequestedCompany">$Name = ##SVCurrentCompany</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  const type = collection === 'ShalimarLedgers' ? 'Ledger' : collection === 'ShalimarVouchers' ? 'Voucher' : 'StockItem';
  const fields = collection === 'ShalimarLedgers' ? ['GUID', 'Name', 'Phone', 'Address', 'Parent'] : collection === 'ShalimarVouchers' ? ['GUID', 'VoucherNumber', 'Date', 'PartyLedgerName', 'VoucherTypeName', 'IsSales', 'IsCancelled', 'IsOptional', 'Amount'] : ['GUID', 'Name', 'Parent', 'BaseUnits', 'ClosingBalance', 'ClosingValue'];
  const fieldXml = fields.map((field) => {
    const expression = field === 'Date'
      ? 'if $$IsEmpty:$Date then "" else $$PyrlYYYYMMDDFormat:$Date:"-"'
      // Tally renders amount values with debit/credit decorations in some
      // releases. Export a plain signed number so the CRM can reconcile it.
      : field === 'IsSales'
        ? '$$IsSales:$VoucherTypeName'
      : field === 'IsCancelled' || field === 'IsOptional'
        ? `$${field}`
      : field === 'Amount'
        ? 'if $$IsEmpty:$Amount then 0 else $$StringFindAndReplace:(if $$IsDebit:$Amount then -$$NumValue:$Amount else $$NumValue:$Amount):"(-)":"-"'
        : `$${field}`;
    return `<FIELD NAME="fld_${field}"><SET>${expression}</SET><XMLTAG>${field}</XMLTAG></FIELD>`;
  }).join('');
  const names = fields.map((field) => `fld_${field}`).join(',');
  // Inventory lines drive product reports; ledger masters are read separately.
  // Avoid fetching every ledger allocation inside each voucher because it
  // makes large closed-period responses much slower without adding CRM data.
  const fetch = collection === 'ShalimarVouchers' ? '<FETCH>AllInventoryEntries,PartyLedgerName,VoucherTypeName,IsSales,IsCancelled,IsOptional</FETCH>' : '';
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
const tallyDate = (raw: string) => {
  const value = raw.trim();
  const normalized = /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
  return validDate(normalized) ? normalized : '';
};
const tallyBoolean = (raw: string, field: string) => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) throw new Error(`Tally sales classification missing (${field})`);
  if (['yes', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  throw new Error(`Invalid Tally sales classification (${field})`);
};
function first(root: XmlNode, ...names: string[]) { for (const n of names) { const x = child(root, n); if (x) return text(x); } return ''; }
function value(root: XmlNode, ...names: string[]) { for (const n of names) { const attr = root.getAttribute(n); if (attr) return attr.trim(); const x = child(root, n); if (x) return text(x); } return ''; }

export async function extractSyncPayload(config: AgentConfig, period: Period, controlTotals?: SalesControls): Promise<SyncPayload | null> {
  const progress = (message: string) => config.onProgress?.(message);
  const label = (collection: 'ShalimarCompany' | 'ShalimarLedgers' | 'ShalimarVouchers' | 'ShalimarStockItems') => ({ ShalimarCompany: 'company identity', ShalimarLedgers: 'ledgers', ShalimarVouchers: 'vouchers', ShalimarStockItems: 'stock items' }[collection]);
  const readTallyDocument = async (collection: 'ShalimarCompany' | 'ShalimarLedgers' | 'ShalimarVouchers' | 'ShalimarStockItems', sourcePeriod: Period) => {
    progress(`Loading ${label(collection)} (${sourcePeriod.start} to ${sourcePeriod.end})...`);
    try {
      const result = await readTallyXml(config.tallyUrl, request(config.companyName, sourcePeriod, collection), { maxResponseBytes: config.maxResponseBytes, timeoutMs: config.requestTimeoutMs, fetchImpl: config.fetchImpl });
      progress(`Loaded ${label(collection)} (${sourcePeriod.start} to ${sourcePeriod.end}).`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof DOMException && error.name === 'AbortError' || /operation was aborted|aborted/i.test(message)) {
        throw new Error(`Tally ${collection} read timed out for ${sourcePeriod.start} to ${sourcePeriod.end}`);
      }
      throw error;
    }
  };
  const doc = await readTallyDocument('ShalimarCompany', period);
  const root = (doc as unknown as { documentElement: XmlNode }).documentElement;
  // TallyPrime returns the company identity as COMPANYNAME in some releases and
  // as COMPANY NAME="..." in others. Accept only an exact match in either shape.
  const companyNode = descendants(root, 'COMPANY').find((n) => n.getAttribute('NAME') || first(n, 'NAME'));
  const company = (companyNode?.getAttribute('NAME') || (companyNode ? first(companyNode, 'NAME') : '') || first(root, 'COMPANYNAME')).trim();
  if (company !== config.companyName.trim()) return null;
  const companyId = companyNode?.getAttribute('GUID') || (companyNode ? first(companyNode, 'GUID') : '') || first(root, 'COMPANYGUID', 'GUID');
  if (!companyId) return null;
  const fingerprint = sha256(`${company}\n${companyId}`);
  const readCollection = async (collection: 'ShalimarLedgers' | 'ShalimarVouchers' | 'ShalimarStockItems', sourcePeriod: Period) => {
    const result = await readTallyDocument(collection, sourcePeriod);
    return (result as unknown as { documentElement: XmlNode }).documentElement;
  };
  const splitPeriod = (sourcePeriod: Period): [Period, Period] | null => {
    const start = Date.parse(`${sourcePeriod.start}T00:00:00Z`);
    const end = Date.parse(`${sourcePeriod.end}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
    const midpoint = start + Math.floor((end - start) / 2);
    const leftEnd = new Date(midpoint).toISOString().slice(0, 10);
    const rightStart = new Date(midpoint + 86_400_000).toISOString().slice(0, 10);
    return [{ start: sourcePeriod.start, end: leftEnd }, { start: rightStart, end: sourcePeriod.end }];
  };
  const readVoucherWindow = async (sourcePeriod: Period, consume: (root: XmlNode) => void): Promise<void> => {
    try {
      consume(await readCollection('ShalimarVouchers', sourcePeriod));
    } catch (error) {
      // A busy shop can have one unusually large month. Split only that
      // window, retaining the bounded response limit and the full period.
      if (!(error instanceof Error) || !/response exceeds size limit/i.test(error.message)) throw error;
      progress(`That voucher window is large; splitting it into smaller windows.`);
      const split = splitPeriod(sourcePeriod);
      if (!split) throw error;
      const [left, right] = split;
      await readVoucherWindow(left, consume);
      await readVoucherWindow(right, consume);
    }
  };
  const rows = (root: XmlNode, fallback: string) => { const reportRows = descendants(root, 'ROW'); return reportRows.length ? reportRows : descendants(root, fallback); };
  const ledgers: Ledger[] = rows(await readCollection('ShalimarLedgers', period), 'LEDGER').map((n, i) => ({ id: value(n, 'GUID', 'MASTERID') || `ledger-${i + 1}`, name: value(n, 'NAME', 'LEDGERNAME'), phone: value(n, 'PHONE', 'PHONENO') || undefined, address: value(n, 'ADDRESS') || undefined })).filter(x => x.name);
  // Full voucher objects include inventory lines and are much heavier than
  // master reports. Read one calendar month at a time, splitting only a
  // window that exceeds the bounded XML response limit. Consume each window
  // immediately so large XML DOMs are not retained for the whole period.
  const seenVoucherIds = new Set<string>();
  const vouchers: Voucher[] = [];
  let fallbackVoucherIndex = 0;
  const consumeVouchers = (voucherRoot: XmlNode) => {
    const parsed = rows(voucherRoot, 'VOUCHER').map((n) => {
      const inventory = [...descendants(n, 'ALLINVENTORYENTRIES.LIST'), ...descendants(n, 'INVENTORYENTRIES.LIST')];
      const id = value(n, 'GUID', 'MASTERID') || `voucher-${++fallbackVoucherIndex}`;
      if (seenVoucherIds.has(id)) throw new Error(`Duplicate voucher ${id}`);
      seenVoucherIds.add(id);
      const date = tallyDate(value(n, 'DATE'));
      if (!date || date < period.start || date > period.end) throw new Error(`Voucher ${id} is outside the requested period`);
      const isSales = tallyBoolean(value(n, 'ISSALES'), 'IsSales');
      const isCancelled = tallyBoolean(value(n, 'ISCANCELLED'), 'IsCancelled');
      const isOptional = tallyBoolean(value(n, 'ISOPTIONAL'), 'IsOptional');
      return { id, number: value(n, 'VOUCHERNUMBER', 'VOUCHERNO') || undefined, date, party: value(n, 'PARTYLEDGERNAME', 'PARTYNAME') || undefined, voucherType: value(n, 'VOUCHERTYPENAME') || undefined, isSales, isCancelled, isOptional, grossValuePaise: money(value(n, 'AMOUNT', 'GROSSVALUE')), lines: inventory.map(l => ({ item: value(l, 'STOCKITEMNAME', 'ITEM'), quantity: quantity(value(l, 'ACTUALQTY', 'BILLEDQTY', 'QUANTITY')), ratePaise: money(value(l, 'RATE')), valuePaise: money(value(l, 'AMOUNT')) })) };
    }).filter((voucher) => voucher.isSales && !voucher.isCancelled && !voucher.isOptional);
    vouchers.push(...parsed);
  };
  for (const window of periodWindows(period)) await readVoucherWindow(window, consumeVouchers);
  const stock_items: StockItem[] = rows(await readCollection('ShalimarStockItems', period), 'STOCKITEM').map((n, i) => ({ id: value(n, 'GUID', 'MASTERID') || `stock-${i + 1}`, name: value(n, 'NAME', 'STOCKITEMNAME'), group: value(n, 'PARENT', 'GROUP') || undefined, unit: value(n, 'BASEUNITS', 'UNIT') || undefined, quantity: Number(value(n, 'CLOSINGBALANCE', 'QUANTITY')) || undefined, ratePaise: money(value(n, 'RATE')), valuePaise: money(value(n, 'CLOSINGVALUE', 'VALUE')) })).filter(x => x.name);
  const payloadBase = { company_name: company, company_fingerprint: fingerprint, tally_release: config.tallyRelease, source_period_start: period.start, source_period_end: period.end, ledgers, vouchers, stock_items, counts: { ledgers: ledgers.length, vouchers: vouchers.length, stock_items: stock_items.length }, gross_value_paise: vouchers.reduce((sum, v) => sum + v.grossValuePaise, 0), metric_scope: 'posted_sales_gross_v1' as const, ...(controlTotals ? { control_totals: controlTotals } : {}) };
  return { ...payloadBase, payload_sha256: sha256(JSON.stringify(payloadBase)) };
}
