import { describe, it, expect } from 'vitest';
import { templateMatchesProvider } from './managed-provider';
import { buildManagedPayload } from './managed-payload';
import { SHALIMAR_INTRO_TEMPLATES } from './shalimar-templates';
import { validateTemplatePayload } from './template-validators';
import type { MessageTemplate } from '@/types';
import type { ManagedSnapshot } from './managed-source';
describe('reviewed image templates', () => {
  for (const starter of SHALIMAR_INTRO_TEMPLATES)
    it(`builds ${starter.payload.language} with image, phone and opt-out text`, () => {
      const p = starter.payload;
      validateTemplatePayload(p);
      const template = {
        ...p,
        id: 't',
        user_id: 'u',
        created_at: '2026-10-07',
        status: 'APPROVED',
        meta_template_id: 'mt',
      } as MessageTemplate;
      const snapshot: ManagedSnapshot = {
        source: {
          id: 'b',
          name: 'Introduction',
          template: p.name,
          language: p.language,
        },
        templates: [template],
        children: [
          { id: 'r', contact: 'c', phone: '919000000001', params: [] },
        ],
        sender: { phone: 'p', waba: 'w' },
        policy: {
          phone: 'p',
          waba: 'w',
          limit: 100000,
          reservation: 200,
          rate_valid_until: '2026-11-01',
        },
      };
      const payload = buildManagedPayload(
        snapshot,
        {
          accountId: 'a',
          kind: 'broadcast',
          sourceId: 'b',
          contactId: 'c',
          recipientId: 'r',
        },
        '919000000001'
      );
      const body = JSON.parse(payload.wire);
      expect(body.template.language.code).toBe(p.language);
      expect(body.template.components).toContainEqual({
        type: 'header',
        parameters: [{ type: 'image', image: { link: p.header_media_url } }],
      });
      expect(payload.text).toContain('STOP');
      expect(payload.text).toContain('+91 70253 20333');
      const remote = {
        id: 'mt',
        name: p.name,
        language: p.language,
        category: 'MARKETING',
        status: 'APPROVED',
        components: [
          { type: 'HEADER', format: 'IMAGE' },
          { type: 'BODY', text: p.body_text },
          { type: 'FOOTER', text: p.footer_text },
          {
            type: 'BUTTONS',
            buttons: p.buttons as unknown as Record<string, unknown>[],
          },
        ],
      };
      expect(templateMatchesProvider(template, remote)).toBe(true);
      expect(
        templateMatchesProvider(template, { ...remote, status: 'PENDING' })
      ).toBe(false);
      expect(
        templateMatchesProvider(template, {
          ...remote,
          components: remote.components.map((c) =>
            c.type === 'BODY' ? { ...c, text: 'Different message' } : c
          ),
        })
      ).toBe(false);
      expect(
        templateMatchesProvider(template, { ...remote, language: 'wrong' })
      ).toBe(false);
    });
});
