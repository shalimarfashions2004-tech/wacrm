import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UnauthorizedError,
  ForbiddenError,
  requireRole,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  managedConfig,
  verifyManagedProvider,
  verifyManagedTemplates,
} from '@/lib/whatsapp/managed-provider';
import { readManagedSource } from '@/lib/whatsapp/managed-source';
import { reviewManagedAudience } from '@/lib/whatsapp/managed-review';
import { startManagedCampaign } from '@/lib/whatsapp/managed-campaign';
import { POST as settings } from './settings/route';
import { POST as approve } from './[kind]/[id]/route';
vi.mock('@/lib/auth/account', async (original) => ({
  ...(await original<object>()),
  requireRole: vi.fn(),
}));
vi.mock('@/lib/automations/admin-client', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/whatsapp/managed-provider', () => ({
  managedConfig: vi.fn(),
  verifyManagedProvider: vi.fn(),
  verifyManagedTemplates: vi.fn(),
}));
vi.mock('@/lib/whatsapp/managed-source', async (original) => ({
  ...(await original<object>()),
  readManagedSource: vi.fn(),
}));
vi.mock('@/lib/whatsapp/managed-review', () => ({
  reviewManagedAudience: vi.fn(),
}));
vi.mock('@/lib/whatsapp/managed-campaign', () => ({
  startManagedCampaign: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<object>()),
  after: vi.fn(),
}));
const req = (body: unknown) =>
  new Request('https://example.invalid/api', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const params = {
  params: Promise.resolve({ kind: 'broadcast', id: 'campaign' }),
};
const budget = {
  enabled: true,
  phoneNumberId: '123',
  wabaId: '456',
  reservationPaise: 200,
  remainingPaise: 100000,
  rateValidUntil: '2099-01-01',
  monthlyLimitPaise: 100000,
};
const rpc = vi.fn();
describe('managed route authorization and review gates', () => {
  beforeEach(() => {
    vi.stubEnv('MESSAGING_MANAGED_DELIVERY_APPROVED', 'true');
    vi.stubEnv('MESSAGING_INBOX_PHONE_NUMBER_ID', '123');
    vi.stubEnv('MESSAGING_INBOX_WABA_ID', '456');
    rpc.mockResolvedValue({ data: budget, error: null });
    vi.mocked(requireRole).mockResolvedValue({
      accountId: 'tenant',
      userId: 'owner',
      supabase: { rpc },
    } as never);
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);
    vi.mocked(readManagedSource).mockResolvedValue({
      fingerprint: 'a'.repeat(64),
      snapshot: {
        source: {
          id: 'campaign',
          name: 'Saved',
          template: 't',
          language: 'en',
          audience: { preparationComplete: true },
        },
        children: [],
        templates: [
          {
            id: 'template',
            meta_template_id: 'mt',
            name: 't',
            language: 'en',
            category: 'Marketing',
            status: 'APPROVED',
            body_text: 'Saved body',
          },
        ],
        sender: { phone: '123', waba: '456' },
        policy: {},
      },
    } as never);
    vi.mocked(reviewManagedAudience).mockResolvedValue({
      total: 1,
      eligible: 1,
      excluded: 0,
      attempted: 0,
    });
    vi.mocked(managedConfig).mockResolvedValue({} as never);
    vi.mocked(verifyManagedProvider).mockResolvedValue({
      name: 'Test',
      phone: 'synthetic',
    });
    vi.mocked(verifyManagedTemplates).mockResolvedValue(undefined);
    vi.mocked(startManagedCampaign).mockResolvedValue(async () => {});
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });
  it.each([new UnauthorizedError(), new ForbiddenError()])(
    'denies unauthorized callers before privileged access',
    async (error) => {
      vi.mocked(requireRole).mockRejectedValue(error);
      const res = await settings(req({ action: 'enable' }));
      expect(res.status).toBe(error.status);
      expect(supabaseAdmin).not.toHaveBeenCalled();
    }
  );
  it('uses server rates, tenant and authenticated actor rather than caller overrides', async () => {
    const res = await settings(
      req({
        action: 'enable',
        accountId: 'other',
        actorId: 'outsider',
        reservationPaise: 0,
      })
    );
    expect(res.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(rpc).toHaveBeenCalledWith(
      'configure_messaging_budget',
      expect.objectContaining({
        p_account_id: 'tenant',
        p_actor_id: 'owner',
        p_reservation_paise: 200,
      })
    );
  });
  it('checks Meta while delivery is off without enabling or approving anything', async () => {
    vi.stubEnv('MESSAGING_MANAGED_DELIVERY_APPROVED', 'false');
    const res = await settings(req({ action: 'verify' }));
    expect(res.status).toBe(200);
    expect(verifyManagedProvider).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
    expect(startManagedCampaign).not.toHaveBeenCalled();
  });
  it('refuses enable while deployment permission is off', async () => {
    vi.stubEnv('MESSAGING_MANAGED_DELIVERY_APPROVED', 'false');
    expect((await settings(req({ action: 'enable' }))).status).toBe(409);
    expect(verifyManagedProvider).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not enable or approve after provider verification fails', async () => {
    vi.mocked(verifyManagedProvider).mockRejectedValue(
      new Error('Synthetic provider unavailable')
    );
    expect((await settings(req({ action: 'enable' }))).status).toBe(500);
    expect(
      (
        await approve(
          req({ action: 'approve', fingerprint: 'a'.repeat(64) }),
          params
        )
      ).status
    ).toBe(500);
    expect(
      rpc.mock.calls.some(([name]) =>
        ['configure_messaging_budget', 'approve_messaging_source'].includes(
          name
        )
      )
    ).toBe(false);
    expect(startManagedCampaign).not.toHaveBeenCalled();
  });
  it('refuses a stale preview before provider or approval calls', async () => {
    expect(
      (
        await approve(
          req({ action: 'approve', fingerprint: 'b'.repeat(64) }),
          params
        )
      ).status
    ).toBe(409);
    expect(verifyManagedProvider).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('requires documented eligible recipients and enough remaining allowance', async () => {
    vi.mocked(reviewManagedAudience).mockResolvedValueOnce({
      total: 1,
      eligible: 0,
      excluded: 1,
      attempted: 0,
    });
    expect(
      (
        await approve(
          req({ action: 'approve', fingerprint: 'a'.repeat(64) }),
          params
        )
      ).status
    ).toBe(409);
    rpc.mockResolvedValue({
      data: { ...budget, remainingPaise: 100 },
      error: null,
    });
    expect(
      (
        await approve(
          req({ action: 'approve', fingerprint: 'a'.repeat(64) }),
          params
        )
      ).status
    ).toBe(409);
    expect(startManagedCampaign).not.toHaveBeenCalled();
  });
});
