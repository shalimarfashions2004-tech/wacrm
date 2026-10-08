import { createHash } from 'node:crypto';
import { requireRole } from '@/lib/auth/account';
import { parseCustomerImport } from '@/lib/customer-data/import';
import {
  customerDataError,
  customerDataId,
  customerDataJson,
  CustomerDataInputError,
  readCustomerDataBody,
} from '@/lib/customer-data/api';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const url = new URL(request.url);
    let query = ctx.supabase
      .from('customer_data_imports')
      .select('*')
      .eq('account_id', ctx.accountId);
    if (url.searchParams.get('import'))
      query = query.eq('id', customerDataId(url.searchParams.get('import')));
    const { data: run, error: runError } = await query
      .order('created_at', { ascending: false })
      .order('id')
      .limit(1)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) return customerDataJson({ run: null, rows: [], total: 0 });
    const page = Number(url.searchParams.get('page') ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 50)
      throw new CustomerDataInputError('Choose a valid page.');
    const search = (url.searchParams.get('q') ?? '').slice(0, 100).trim();
    let rowsQuery = ctx.supabase
      .from('customer_data_rows')
      .select('*', { count: 'exact' })
      .eq('account_id', ctx.accountId)
      .eq('import_id', run.id);
    if (search) {
      const phoneSearch = /^[+\d ()-]+$/.test(search);
      const text = (phoneSearch ? search.replace(/\D/g, '') : search).replace(
        /[\\%_]/g,
        '\\$&'
      );
      rowsQuery = rowsQuery.ilike(phoneSearch ? 'phone' : 'name', `%${text}%`);
    }
    if (url.searchParams.get('review') === 'true')
      rowsQuery = rowsQuery.neq('phone_state', 'ready');
    const {
      data: rows,
      error,
      count,
    } = await rowsQuery
      .order('lifetime_gross_paise', { ascending: false })
      .order('id')
      .range(page * 100, page * 100 + 99);
    if (error) throw error;
    const ids = [
      ...new Set((rows ?? []).map((r) => r.contact_id).filter(Boolean)),
    ];
    const permissions = new Map<string, string>();
    if (ids.length) {
      const { data: statuses, error: statusError } = await ctx.supabase.rpc(
        'customer_data_permission_status',
        { p_contact_ids: ids }
      );
      if (statusError) throw statusError;
      for (const row of statuses ?? [])
        permissions.set(row.contact_id, row.status);
    }
    return customerDataJson({
      run,
      rows: (rows ?? []).map((r) => ({
        ...r,
        permission: permissions.get(r.contact_id) ?? 'unknown',
      })),
      total: count ?? 0,
      page,
    });
  } catch (error) {
    return customerDataError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = await readCustomerDataBody(request);
    if (body.action === 'publish_contacts') {
      const { data, error } = await ctx.supabase.rpc(
        'publish_customer_data_contacts',
        { p_import_id: customerDataId(body.importId) }
      );
      if (error) throw error;
      return customerDataJson({ result: data });
    }
    if (
      body.action !== 'import' ||
      typeof body.csv !== 'string' ||
      typeof body.filename !== 'string'
    )
      throw new CustomerDataInputError(
        'Select the prepared customer-data CSV.'
      );
    let preview;
    try {
      preview = parseCustomerImport(body.csv);
    } catch (e) {
      throw new CustomerDataInputError((e as Error).message);
    }
    const name =
      body.filename.split(/[\\/]/).pop()?.slice(0, 200) || 'customer-data.csv';
    const { data, error } = await ctx.supabase.rpc(
      'save_customer_data_import',
      {
        p_source_name: name,
        p_source_sha256: createHash('sha256').update(body.csv).digest('hex'),
        p_source_start: preview.source_start,
        p_source_as_of: preview.source_as_of,
        p_rows: preview.rows,
      }
    );
    if (error) throw error;
    return customerDataJson({ importId: data, summary: preview.summary });
  } catch (error) {
    return customerDataError(error);
  }
}
