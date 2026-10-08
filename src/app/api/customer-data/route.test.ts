import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth/account';
import { GET, POST } from './route';
import { POST as audience } from './audience/route';
import { POST as review } from './review/route';
vi.mock('@/lib/auth/account', async (original) => ({
  ...(await original<object>()),
  requireRole: vi.fn(),
}));
const rpc = vi.fn();
const reads: { table: string; field: string; value: unknown }[] = [];
let values: Record<string, { data: unknown; error: unknown; count?: number }>;
const bounds = vi.fn();
function from(table: string) {
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => builder,
    eq: (field: string, value: unknown) => {
      reads.push({ table, field, value });
      return builder;
    },
    neq: () => builder,
    ilike: () => builder,
    range: (low: number, high: number) => {
      bounds(low, high);
      return builder;
    },
    then: (resolve: (value: unknown) => void) =>
      resolve(values[table] ?? { data: [], error: null }),
  };
  return builder;
}
const importId = '00000000-0000-4000-8000-000000000001';
const csv =
  'source_key,name,phone,first_order,last_order,orders,lifetime_gross,gross_12m,orders_12m,source_start,source_as_of,language,is_internal\nsynthetic:1,Synthetic Buyer,6000000001,2024-04-01,2026-05-23,4,50000.11,25000.05,2,2024-04-01,2026-05-23,unknown,false\n';
const request = (body: unknown) =>
  new Request('https://example.invalid/api/customer-data', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  reads.length = 0;
  values = {
    customer_data_imports: { data: { id: importId }, error: null },
    customer_data_rows: { data: [], error: null, count: 2353 },
  };
  rpc.mockResolvedValue({ data: importId, error: null });
  vi.mocked(requireRole).mockResolvedValue({
    accountId: 'tenant-1',
    userId: 'owner-1',
    supabase: { from, rpc },
  } as never);
});
describe('private customer-data API boundaries', () => {
  it.each([new UnauthorizedError(), new ForbiddenError()])(
    'rejects import before reading a private body when authentication or role fails',
    async (error) => {
      vi.mocked(requireRole).mockRejectedValue(error);
      expect(
        (
          await POST(
            request({ action: 'import', csv, filename: 'private.csv' })
          )
        ).status
      ).toBe(error.status);
      expect(rpc).not.toHaveBeenCalled();
    }
  );
  it('requires admin, reparses CSV and never accepts a caller-supplied account or consent', async () => {
    const response = await POST(
      request({
        action: 'import',
        csv,
        filename: 'folder/private.csv',
        accountId: 'another-tenant',
        consent: 'opted_in',
      })
    );
    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith('admin');
    const [method, args] = rpc.mock.calls[0];
    expect(method).toBe('save_customer_data_import');
    expect(args).not.toHaveProperty('accountId');
    expect(args).toMatchObject({
      p_source_name: 'private.csv',
      p_source_sha256: createHash('sha256').update(csv).digest('hex'),
    });
    expect(args.p_rows[0]).toMatchObject({
      phone: '916000000001',
      language: 'unknown',
    });
    expect(args.p_rows[0]).not.toHaveProperty('consent');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each([
    csv.replace('lifetime_gross', 'missing_value'),
    csv.replace('50000.11', '-500.00'),
    csv.replace(',language,', ',consent,'),
  ])('invalid source never reaches the database', async (text) => {
    expect(
      (
        await POST(
          request({ action: 'import', csv: text, filename: 'private.csv' })
        )
      ).status
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('bounds the request stream rather than trusting Content-Length', async () => {
    const response = await POST(
      request({
        action: 'import',
        csv: 'x'.repeat(2_200_000),
        filename: 'large.csv',
      })
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('paginates 100 rows and scopes both parent and rows to the authenticated account', async () => {
    await GET(new Request('https://example.invalid/api/customer-data?page=12'));
    expect(requireRole).toHaveBeenCalledWith('viewer');
    expect(bounds).toHaveBeenCalledWith(1200, 1299);
    expect(reads.filter((read) => read.field === 'account_id')).toEqual([
      {
        table: 'customer_data_imports',
        field: 'account_id',
        value: 'tenant-1',
      },
      { table: 'customer_data_rows', field: 'account_id', value: 'tenant-1' },
    ]);
  });
  it('reads status only through the bounded account-checked RPC, without exposing evidence', async () => {
    values.customer_data_rows.data = [{ id: 'row-1', contact_id: importId }];
    rpc.mockResolvedValue({
      data: [{ contact_id: importId, status: 'opted_out' }],
      error: null,
    });
    const data = await (
      await GET(new Request('https://example.invalid/api/customer-data'))
    ).json();
    expect(rpc).toHaveBeenCalledWith('customer_data_permission_status', {
      p_contact_ids: [importId],
    });
    expect(data.rows[0].permission).toBe('opted_out');
    expect(data.rows[0]).not.toHaveProperty('evidence');
  });
  it('publishes by import ID through an admin RPC without writing any consent', async () => {
    expect(
      (await POST(request({ action: 'publish_contacts', importId }))).status
    ).toBe(200);
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(rpc).toHaveBeenCalledWith('publish_customer_data_contacts', {
      p_import_id: importId,
    });
    expect(reads).toEqual([]);
  });
  it('missing schema returns a clear setup state without SQL details or private data', async () => {
    values.customer_data_imports.error = {
      code: '42P01',
      message: 'PRIVATE SQL DETAIL',
    };
    const response = await GET(
      new Request('https://example.invalid/api/customer-data')
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain('052');
    expect(text).not.toContain('PRIVATE');
  });
  it('normalizes an English template language and checks exclusion IDs', async () => {
    await audience(
      request({
        importId,
        preset: 'all_reviewed',
        language: 'en_US',
        excludeTagIds: [importId],
      })
    );
    expect(rpc).toHaveBeenCalledWith('preview_customer_data_audience', {
      p_import_id: importId,
      p_preset: 'all_reviewed',
      p_language: 'en',
      p_exclude_tag_ids: [importId],
    });
    expect(requireRole).toHaveBeenCalledWith('viewer');
  });
  it.each([
    { preset: 'product_interest', language: 'en' },
    { preset: 'all_reviewed', language: 'fr' },
    { preset: 'all_reviewed', language: 'ml', excludeTagIds: ['bad-id'] },
  ])('unsupported audience inputs never resolve recipients', async (filter) => {
    expect((await audience(request({ importId, ...filter }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('an absent imported source gives an honest empty state rather than aggregate reach', async () => {
    values.customer_data_imports.data = null;
    expect(
      (await audience(request({ preset: 'all_reviewed', language: 'ml' })))
        .status
    ).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('review requires admin and uses only the selected row, language and supplied evidence', async () => {
    await review(
      request({ rowId: importId, language: 'ml', accountId: 'other' })
    );
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(rpc).toHaveBeenCalledWith('review_customer_data_row', {
      p_row_id: importId,
      p_language: 'ml',
      p_permission: null,
    });
  });
  it('missing evidence is an actionable input error and cannot save an opt-in', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'customer_data_permission_evidence_required' },
    });
    expect(
      (
        await review(
          request({
            rowId: importId,
            language: 'en',
            permission: { status: 'opted_in' },
          })
        )
      ).status
    ).toBe(400);
  });
});
