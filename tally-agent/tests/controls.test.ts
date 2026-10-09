import { describe, expect, it } from 'vitest';
import { parseSalesControls } from '../src/controls';

describe('independent operator Sales Register controls', () => {
  it('parses INR exactly and binds controls to the chosen period', () => {
    expect(parseSalesControls('3', '₹1,234.05', { start: '2026-09-01', end: '2026-09-30' })).toMatchObject({
      source: 'tally_sales_register', collection_method: 'operator_readback',
      metric_scope: 'posted_sales_gross_v1', voucher_count: 3, gross_value_paise: 123405,
      period_start: '2026-09-01', period_end: '2026-09-30',
    });
  });
  it('rejects missing, negative, malformed or unsafe controls', () => {
    for (const [count, amount] of [['', '1'], ['1', ''], ['-1', '1'], ['1', '1.005'], ['1', '9e10'], ['50001', '1']]) {
      expect(() => parseSalesControls(count, amount, { start: '2026-09-01', end: '2026-09-30' })).toThrow();
    }
  });
});
