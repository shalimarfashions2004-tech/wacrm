import { requireRole } from '@/lib/auth/account';
import {
  customerDataError,
  customerDataId,
  customerDataJson,
  CustomerDataInputError,
  readCustomerDataBody,
} from '@/lib/customer-data/api';
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const body = await readCustomerDataBody(request);
    if (
      typeof body.preset !== 'string' ||
      ![
        'all_reviewed',
        'high_value_frequent',
        'high_value_at_risk',
        'low_value_one_time',
      ].includes(body.preset)
    )
      throw new CustomerDataInputError(
        'Choose a supported customer segment. Product-specific audiences need reconciled item data first.'
      );
    const language =
      typeof body.language === 'string'
        ? body.language.split(/[_-]/)[0].toLowerCase()
        : '';
    if (!['en', 'ml'].includes(language))
      throw new CustomerDataInputError(
        'Choose an English or Malayalam template for this customer list.'
      );
    const excludes = body.excludeTagIds ?? [];
    if (!Array.isArray(excludes) || excludes.length > 100)
      throw new CustomerDataInputError('Use at most 100 exclusion tags.');
    const tags = excludes.map(customerDataId);
    let importId: string;
    if (body.importId) importId = customerDataId(body.importId);
    else {
      const { data, error } = await ctx.supabase
        .from('customer_data_imports')
        .select('id')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .order('id')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return customerDataJson(
          {
            error:
              'Import and review customer data before building this audience.',
          },
          409
        );
      importId = data.id;
    }
    const { data, error } = await ctx.supabase.rpc(
      'preview_customer_data_audience',
      {
        p_import_id: importId,
        p_preset: body.preset,
        p_language: language,
        p_exclude_tag_ids: tags,
      }
    );
    if (error) throw error;
    return customerDataJson(data);
  } catch (error) {
    return customerDataError(error);
  }
}
