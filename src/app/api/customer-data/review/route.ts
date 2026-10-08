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
    const ctx = await requireRole('admin');
    const body = await readCustomerDataBody(request);
    if (
      typeof body.language !== 'string' ||
      !['en', 'ml', 'unknown'].includes(body.language)
    )
      throw new CustomerDataInputError(
        'Choose English, Malayalam or unknown language.'
      );
    const permission = body.permission ?? null;
    if (
      permission !== null &&
      (typeof permission !== 'object' || Array.isArray(permission))
    )
      throw new CustomerDataInputError(
        'Enter the verified permission details.'
      );
    const { error } = await ctx.supabase.rpc('review_customer_data_row', {
      p_row_id: customerDataId(body.rowId),
      p_language: body.language,
      p_permission: permission,
    });
    if (error) throw error;
    return customerDataJson({ saved: true });
  } catch (error) {
    return customerDataError(error);
  }
}
