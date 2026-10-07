import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(async () => ({
    userId: 'user-1',
    accountId: 'account-1',
  })),
  toErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  RATE_LIMITS: { broadcast: {} },
  rateLimitResponse: vi.fn(),
}));

describe('legacy bulk-send boundary', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const request = () =>
    new Request('https://example.com/api/whatsapp/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: [{ phone: '15551234567' }],
        template_name: 'promo',
      }),
    });

  it('cannot send an unchecked phone list even with global live approval', async () => {
    vi.stubEnv('MESSAGING_DELIVERY_MODE', 'live');
    vi.stubEnv('MESSAGING_LIVE_APPROVED', 'true');
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'campaign_controls_required',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps explicitly labelled dry-run results available without provider requests', async () => {
    vi.stubEnv('MESSAGING_DELIVERY_MODE', 'dry-run');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: 'dry-run',
      dry_run: true,
      sent: 1,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
