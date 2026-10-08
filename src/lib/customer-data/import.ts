export const CUSTOMER_IMPORT_MAX_BYTES = 2_000_000;
export const CUSTOMER_IMPORT_MAX_ROWS = 5_000;
export type CustomerLanguage = 'en' | 'ml' | 'unknown';
export type PhoneState =
  | 'ready'
  | 'missing_phone'
  | 'ambiguous_phone'
  | 'invalid_phone'
  | 'shared_phone'
  | 'duplicate_name'
  | 'internal_outlet'
  | 'existing_conflict';
export interface CustomerImportRow {
  source_key: string;
  name: string;
  raw_phone: string;
  phone: string | null;
  phone_state: PhoneState;
  first_order: string;
  last_order: string;
  orders: number;
  lifetime_gross_paise: number;
  gross_12m_paise: number;
  orders_12m: number;
  language: CustomerLanguage;
  is_internal: boolean;
}
export interface CustomerImportPreview {
  source_start: string;
  source_as_of: string;
  rows: CustomerImportRow[];
  summary: {
    total: number;
    ready: number;
    review: number;
    reasons: Partial<Record<PhoneState, number>>;
  };
}

/** India mobile syntax only; this never verifies that WhatsApp exists on a number. */
export function reviewCustomerPhone(raw: string): {
  phone: string | null;
  state: PhoneState;
} {
  const value = raw.trim();
  if (!value) return { phone: null, state: 'missing_phone' };
  if (/[,;/|]/.test(value)) return { phone: null, state: 'ambiguous_phone' };
  if (!/^\+?[\d\s()-]+$/.test(value))
    return { phone: null, state: 'invalid_phone' };
  let digits = value.replace(/\D/g, '');
  if (/^0[6-9]\d{9}$/.test(digits)) digits = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(digits)) digits = `91${digits}`;
  return /^91[6-9]\d{9}$/.test(digits)
    ? { phone: digits, state: 'ready' }
    : { phone: null, state: 'invalid_phone' };
}

export function customerNameKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Strict CSV grammar, including quoted commas, escaped quotes and CRLF. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const pushCell = () => {
    record.push(cell);
    cell = '';
    closed = false;
  };
  const pushRecord = () => {
    pushCell();
    if (record.some((v) => v.trim())) records.push(record);
    record = [];
    if (records.length > CUSTOMER_IMPORT_MAX_ROWS + 1)
      throw new Error('Use a file with at most 5,000 customer rows.');
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      if (c === ',') pushCell();
      else {
        pushRecord();
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (c === '"' && cell === '' && !closed) quoted = true;
    else if (closed || c === '"')
      throw new Error('The CSV has an invalid quote. Export it again as CSV.');
    else cell += c;
  }
  if (quoted) throw new Error('The CSV has an unfinished quoted field.');
  pushRecord();
  return records;
}

function date(value: string, label: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label} needs a valid YYYY-MM-DD date.`);
  return value;
}
function integer(value: string, label: string): number {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 1_000_000
  )
    throw new Error(`${label} needs a whole number from 0 to 1,000,000.`);
  return Number(value);
}
function paise(value: string, label: string): number {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value))
    throw new Error(
      `${label} needs a positive INR amount with at most two decimal places.`
    );
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error(`${label} is too large.`);
  return result;
}

export function parseCustomerImport(
  text: string,
  today = new Date().toISOString().slice(0, 10)
): CustomerImportPreview {
  if (new TextEncoder().encode(text).byteLength > CUSTOMER_IMPORT_MAX_BYTES)
    throw new Error('Use a CSV smaller than 2 MB.');
  const records = parseCsv(text.replace(/^\uFEFF/, ''));
  if (records.length < 2)
    throw new Error('The CSV needs a header and customer rows.');
  const headers = records[0].map((v) => v.trim().toLowerCase());
  if (new Set(headers).size !== headers.length)
    throw new Error('The CSV has duplicate column names.');
  if (headers.some((h) => /consent|opt.?in/i.test(h)))
    throw new Error(
      'Record verified marketing permission separately in CRM; it cannot be imported from sales data.'
    );
  const required = [
    'source_key',
    'name',
    'phone',
    'first_order',
    'last_order',
    'orders',
    'lifetime_gross',
    'gross_12m',
    'orders_12m',
    'source_start',
    'source_as_of',
  ];
  for (const h of required)
    if (!headers.includes(h))
      throw new Error(
        `Missing required column: ${h}. Use the customer-data import format.`
      );
  let sourceStart = '',
    sourceAsOf = '';
  const keys = new Set<string>();
  const rows = records.slice(1).map((record, i): CustomerImportRow => {
    const label = `Row ${i + 2}`;
    if (record.length !== headers.length)
      throw new Error(`${label} has the wrong number of columns.`);
    const get = (key: string) => (record[headers.indexOf(key)] ?? '').trim();
    const name = get('name');
    const key = get('source_key');
    if (!name || name.length > 200 || /[\x00-\x1f]/.test(name))
      throw new Error(
        `${label} needs a name on one line (maximum 200 characters).`
      );
    if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(key) || keys.has(key))
      throw new Error(`${label} needs a unique source key.`);
    keys.add(key);
    const start = date(get('source_start'), `${label} source start`);
    const asOf = date(get('source_as_of'), `${label} source date`);
    if (asOf < start || asOf > today)
      throw new Error(`${label} has an invalid or future source window.`);
    if (sourceStart && (start !== sourceStart || asOf !== sourceAsOf))
      throw new Error('All rows must use the same source window.');
    sourceStart = start;
    sourceAsOf = asOf;
    const first = date(get('first_order'), `${label} first order`),
      last = date(get('last_order'), `${label} last order`);
    if (first < start || last < first || last > asOf)
      throw new Error(`${label} order dates must be inside the source window.`);
    const orders = integer(get('orders'), `${label} orders`),
      orders12m = integer(get('orders_12m'), `${label} 12-month orders`);
    const gross = paise(get('lifetime_gross'), `${label} purchase value`),
      gross12m = paise(get('gross_12m'), `${label} 12-month value`);
    if (!orders || orders12m > orders || gross12m > gross)
      throw new Error(`${label} has inconsistent purchase totals.`);
    const language = get('language') || 'unknown';
    if (!['en', 'ml', 'unknown'].includes(language))
      throw new Error(`${label} language must be en, ml or unknown.`);
    const internal = get('is_internal') || 'false';
    if (!['true', 'false'].includes(internal))
      throw new Error(`${label} is_internal must be true or false.`);
    const rawPhone = get('phone');
    if (rawPhone.length > 100)
      throw new Error(`${label} phone field is too long.`);
    const phone = reviewCustomerPhone(rawPhone);
    return {
      source_key: key,
      name,
      raw_phone: rawPhone,
      phone: phone.phone,
      phone_state: internal === 'true' ? 'internal_outlet' : phone.state,
      first_order: first,
      last_order: last,
      orders,
      lifetime_gross_paise: gross,
      gross_12m_paise: gross12m,
      orders_12m: orders12m,
      language: language as CustomerLanguage,
      is_internal: internal === 'true',
    };
  });
  const phones = new Map<string, number>(),
    names = new Map<string, number>();
  for (const row of rows) {
    if (row.phone) phones.set(row.phone, (phones.get(row.phone) ?? 0) + 1);
    const name = customerNameKey(row.name);
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  const reasons: Partial<Record<PhoneState, number>> = {};
  for (const row of rows) {
    if (row.phone_state === 'ready' && row.phone && phones.get(row.phone)! > 1)
      row.phone_state = 'shared_phone';
    if (
      row.phone_state === 'ready' &&
      names.get(customerNameKey(row.name))! > 1
    )
      row.phone_state = 'duplicate_name';
    reasons[row.phone_state] = (reasons[row.phone_state] ?? 0) + 1;
  }
  const ready = reasons.ready ?? 0;
  return {
    source_start: sourceStart,
    source_as_of: sourceAsOf,
    rows,
    summary: {
      total: rows.length,
      ready,
      review: rows.length - ready,
      reasons,
    },
  };
}
