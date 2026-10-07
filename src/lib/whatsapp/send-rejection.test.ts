import { describe, expect, it } from 'vitest';
import { MetaApiError } from './meta-api';
import { explainSendRejection } from './send-rejection';

describe('explicit message rejection', () => {
  it('explains authentication without claiming the token necessarily expired', () => {
    const result = explainSendRejection(
      new MetaApiError('Authentication Error', { code: 0, httpStatus: 400 })
    );
    expect(result?.message).toContain('whatsapp_business_messaging');
    expect(result?.message).not.toContain('expired');
  });
  it.each([
    new Error('timeout'),
    new MetaApiError('bad gateway', { httpStatus: 502 }),
    new MetaApiError('unknown', { httpStatus: 400 }),
    new MetaApiError('server', { code: 190, httpStatus: 500 }),
  ])('never declares unknown delivery a definite rejection', (error) =>
    expect(explainSendRejection(error)).toBeNull()
  );
  it('never exposes arbitrary provider payloads', () => {
    const result = explainSendRejection(
      new MetaApiError('private token or recipient details', {
        code: 99999,
        httpStatus: 400,
      })
    );
    expect(result?.message).not.toContain('private');
    expect(result?.message).toContain('99999');
  });
});
