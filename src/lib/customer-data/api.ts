import { NextResponse } from 'next/server';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/account';
import { CUSTOMER_IMPORT_MAX_BYTES } from './import';

export class CustomerDataInputError extends Error {}
export async function readCustomerDataBody(
  request: Request
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new CustomerDataInputError('A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > CUSTOMER_IMPORT_MAX_BYTES + 100_000) {
        await reader.cancel();
        throw new CustomerDataInputError('Use a CSV smaller than 2 MB.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new CustomerDataInputError('Send a valid JSON request.');
  }
}
export function customerDataJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export function customerDataError(error: unknown) {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
    return customerDataJson({ error: error.message }, error.status);
  if (error instanceof CustomerDataInputError)
    return customerDataJson({ error: error.message }, 400);
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? '';
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code ?? ''))
    return customerDataJson(
      {
        error:
          'Install customer-data migration 052 before importing. Your existing Contacts and WhatsApp connection are unchanged.',
        setup_required: true,
      },
      503
    );
  if (
    message === 'customer_data_import_not_found' ||
    message === 'customer_data_row_not_found'
  )
    return customerDataJson(
      { error: 'This customer-data record was not found in your workspace.' },
      404
    );
  if (
    message === 'customer_data_permission_evidence_required' ||
    message === 'customer_data_contact_not_linked'
  )
    return customerDataJson(
      {
        error:
          'Link the reviewed contact and enter the date, source, exact permission wording and evidence.',
      },
      400
    );
  if (
    ['42501'].includes(code ?? '') ||
    ['customer_data_admin_required', 'customer_data_member_required'].includes(
      message
    )
  )
    return customerDataJson(
      { error: 'This action requires the appropriate workspace role.' },
      403
    );
  if (
    ['22P02', '22007', '22008', '23514', '23502', '23505'].includes(
      code ?? ''
    ) ||
    message.startsWith('customer_data_invalid_') ||
    message === 'customer_data_unsupported_preset'
  )
    return customerDataJson(
      {
        error:
          'The customer data or filter is invalid. Review the file, dates, language and permission evidence.',
      },
      400
    );
  // Never log raw rows or database details containing private customer records.
  return customerDataJson(
    {
      error:
        'Customer data could not be saved or read. No message was sent. Please check the setup and try again.',
    },
    500
  );
}
export function customerDataId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value
    )
  )
    throw new CustomerDataInputError('Select a valid customer-data record.');
  return value;
}
