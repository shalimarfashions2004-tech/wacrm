import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { ManagedDeliveryError } from './managed-policy';

export function managedResponseError(error: unknown) {
  if (error instanceof ManagedDeliveryError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  return toErrorResponse(error);
}
