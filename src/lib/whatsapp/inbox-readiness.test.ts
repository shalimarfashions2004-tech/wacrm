import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readInboxReadiness } from './inbox-readiness';

const config = { phone_number_id: '12345678', waba_id: '98765432' };
beforeEach(() => {
  vi.stubEnv('MESSAGING_INBOX_REPLIES_APPROVED', 'true');
  vi.stubEnv('MESSAGING_INBOX_PHONE_NUMBER_ID', config.phone_number_id);
  vi.stubEnv('MESSAGING_INBOX_WABA_ID', config.waba_id);
  vi.stubEnv('MESSAGING_DELIVERY_MODE', 'dry-run');
});
afterEach(() => vi.unstubAllEnvs());

it.each([true, false])(
  'reports missing safety schema without reading customer rows: %s',
  async (missing) => {
    const queries: unknown[][] = [];
    const db = {
      from: (table: string) => {
        const builder = {
          select: (columns: string) => {
            queries.push([table, columns]);
            return builder;
          },
          eq: (field: string, value: string) => {
            expect([field, value]).toEqual(['account_id', 'acct']);
            return builder;
          },
          limit: async (count: number) => {
            expect(count).toBe(0);
            return {
              data: [],
              error:
                missing && table === 'contact_consents'
                  ? { code: 'PGRST205' }
                  : null,
            };
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;
    const status = await readInboxReadiness(db, 'acct', config);
    expect(status.enabled).toBe(!missing);
    expect(status.generalDeliveryEnabled).toBe(false);
    expect(queries).toHaveLength(2);
  }
);

it('rejects another sender and malformed or disabled approval without querying data', async () => {
  const db = { from: vi.fn() } as unknown as SupabaseClient;
  expect(
    (await readInboxReadiness(db, 'acct', { ...config, waba_id: '1' })).enabled
  ).toBe(false);
  vi.stubEnv('MESSAGING_INBOX_PHONE_NUMBER_ID', '*');
  expect((await readInboxReadiness(db, 'acct', config)).enabled).toBe(false);
  vi.stubEnv('MESSAGING_INBOX_PHONE_NUMBER_ID', config.phone_number_id);
  vi.stubEnv('MESSAGING_INBOX_REPLIES_APPROVED', 'false');
  expect((await readInboxReadiness(db, 'acct', config)).enabled).toBe(false);
  expect(db.from).not.toHaveBeenCalled();
});
