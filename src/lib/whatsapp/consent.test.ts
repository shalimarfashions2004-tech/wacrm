import { describe, expect, it } from 'vitest';
import { applyOptOut, createConsentEvent, isOptOutMessage, isSuppressedForCategory } from './consent';

describe('Shalimar consent guard', () => {
  it('recognises English and Malayalam opt-out tokens', () => {
    expect(isOptOutMessage('STOP')).toBe(true);
    expect(isOptOutMessage('ഒഴിവാക്കുക')).toBe(true);
    expect(isOptOutMessage('new stock')).toBe(false);
  });
  it('does not infer marketing consent from an imported contact', () => {
    expect(isSuppressedForCategory({ consent: [], suppressed_at: null, suppression_reason: null }, 'marketing')).toBe(true);
  });
  it('records explicit opt-in evidence and applies opt-out suppression', () => {
    const row = createConsentEvent({ contact_id: 'c1', account_id: 'a1', channel: 'whatsapp', category: 'marketing', status: 'opted_in', source: 'paper_form', wording_version: '2026-09-v1' });
    const contact = { id: 'c1', user_id: 'u1', account_id: 'a1', phone: '+919876543210', created_at: '', updated_at: '', consent: [row] };
    expect(isSuppressedForCategory(contact, 'marketing')).toBe(false);
    expect(isSuppressedForCategory(applyOptOut(contact), 'marketing')).toBe(true);
  });
});
