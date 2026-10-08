import { describe, expect, it } from 'vitest';
import { parseCustomerImport, reviewCustomerPhone } from './import';
const header =
  'source_key,name,phone,first_order,last_order,orders,lifetime_gross,gross_12m,orders_12m,source_start,source_as_of,language,is_internal';
const row =
  'k1,Sample Buyer,9876543210,2024-04-01,2026-05-23,4,50000.11,25000.05,2,2024-04-01,2026-05-23,unknown,false';
const csv = (rows = [row]) => `${header}\r\n${rows.join('\r\n')}\r\n`;
describe('customer-data import boundary', () => {
  it.each(['9876543210', '+91 98765 43210', '09876543210', '(91) 9876543210'])(
    'normalizes only an unambiguous India mobile: %s',
    (phone) =>
      expect(reviewCustomerPhone(phone)).toEqual({
        phone: '919876543210',
        state: 'ready',
      })
  );
  it.each([
    '9876543210/8765432109',
    '9876543210,8765432109',
    '9876543210;8765432109',
  ])('does not choose a number from %s', (phone) =>
    expect(reviewCustomerPhone(phone).state).toBe('ambiguous_phone')
  );
  it.each([
    'abc9876543210',
    '+44 7700 900123',
    '1234567890',
    '919876543210999',
    '9876543210+',
  ])('quarantines unsupported or malformed input: %s', (phone) =>
    expect(reviewCustomerPhone(phone).state).toBe('invalid_phone')
  );
  it('parses BOM, quoted commas/quotes, exact paise and unknown language', () => {
    const parsed = parseCustomerImport(
      `\uFEFF${csv([row.replace('Sample Buyer', '"Sample, ""Buyer"""')])}`,
      '2026-10-08'
    );
    expect(parsed.rows[0]).toMatchObject({
      name: 'Sample, "Buyer"',
      lifetime_gross_paise: 5000011,
      gross_12m_paise: 2500005,
      language: 'unknown',
    });
    expect(parsed.summary).toMatchObject({ total: 1, ready: 1 });
  });
  it('quarantines every shared-phone row and does not merge them', () => {
    const p = parseCustomerImport(
      csv([row, row.replace('k1,Sample Buyer', 'k2,Other Buyer')]),
      '2026-10-08'
    );
    expect(p.rows.map((r) => r.phone_state)).toEqual([
      'shared_phone',
      'shared_phone',
    ]);
  });
  it('quarantines name variants without inferring a business identity', () => {
    const p = parseCustomerImport(
      csv([
        row,
        row.replace('k1,Sample Buyer,9876543210', 'k2,SAMPLE-BUYER,8765432109'),
      ]),
      '2026-10-08'
    );
    expect(p.summary.reasons.duplicate_name).toBe(2);
  });
  it('keeps internal outlets out of Contacts candidates', () =>
    expect(
      parseCustomerImport(
        csv([row.replace(',unknown,false', ',unknown,true')]),
        '2026-10-08'
      ).summary.ready
    ).toBe(0));
  it.each([
    [row.replace(',2026-05-23,4,', ',2026-02-30,4,'), /valid/],
    [row.replaceAll('2026-05-23', '2026-10-09'), /future/],
    [row.replace('25000.05', '50000.12'), /inconsistent/],
    [row.replace('50000.11', '50000.111'), /decimal/],
    [row.replace('Sample Buyer', '"unfinished'), /unfinished/],
  ])('rejects invalid dates/totals/CSV before writes', (input, error) =>
    expect(() =>
      parseCustomerImport(csv([input as string]), '2026-10-08')
    ).toThrow(error as RegExp)
  );
  it('rejects duplicate source IDs and mixed source windows', () => {
    expect(() => parseCustomerImport(csv([row, row]), '2026-10-08')).toThrow(
      /unique source/
    );
    expect(() =>
      parseCustomerImport(
        csv([
          row,
          row
            .replace('k1,', 'k2,')
            .replace(
              '2024-04-01,2026-05-23,unknown',
              '2024-03-01,2026-05-23,unknown'
            ),
        ]),
        '2026-10-08'
      )
    ).toThrow(/same source window/);
  });
  it('rejects attempts to import marketing permission', () =>
    expect(() =>
      parseCustomerImport(`${header},consent\n${row},opted_in`, '2026-10-08')
    ).toThrow(/separately/));
  it('handles more than a Supabase page of customers without truncation', () => {
    const rows = Array.from({ length: 1505 }, (_, i) =>
      row.replace(
        'k1,Sample Buyer,9876543210',
        `k${i},Sample ${i},${9000000000 + i}`
      )
    );
    expect(parseCustomerImport(csv(rows), '2026-10-08').summary.total).toBe(
      1505
    );
  });
});
