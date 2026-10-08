import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireRole } from '@/lib/auth/account';
import { generateReply } from '@/lib/ai/generate';
import { logAiUsage } from '@/lib/ai/usage';
import { POST } from './route';

vi.mock('@/lib/auth/account', async (original) => ({
  ...(await original<object>()),
  requireRole: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { aiDraft: {}, aiDraftAccount: {} },
}));
vi.mock('@/lib/ai/config', () => ({
  loadAiConfig: async () => ({ provider: 'openai', model: 'gpt-5.4-mini' }),
}));
vi.mock('@/lib/ai/context', () => ({
  buildConversationContext: async () => [{ role: 'user', content: 'Hello' }],
}));
vi.mock('@/lib/ai/knowledge', () => ({ retrieveKnowledge: async () => [] }));
vi.mock('@/lib/ai/defaults', () => ({
  buildSystemPrompt: () => 'Test prompt',
}));
vi.mock('@/lib/ai/generate', () => ({ generateReply: vi.fn() }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: () => ({}) }));

const request = () =>
  new Request('https://example.invalid/api/ai/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: 'conversation' }),
  });

describe('AI draft usage persistence', () => {
  beforeEach(() => {
    const lookup = {
      select: () => lookup,
      eq: () => lookup,
      maybeSingle: async () => ({ data: { id: 'conversation' }, error: null }),
    };
    vi.mocked(requireRole).mockResolvedValue({
      accountId: 'tenant',
      userId: 'agent',
      supabase: { from: () => lookup },
    } as never);
    vi.mocked(generateReply).mockResolvedValue({
      text: 'Hello from the draft',
      handoff: false,
      usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
    });
    vi.mocked(logAiUsage).mockResolvedValue(undefined);
  });
  afterEach(() => vi.resetAllMocks());

  it('waits for recorded usage before the response can end the serverless request', async () => {
    let completeLog!: () => void;
    vi.mocked(logAiUsage).mockReturnValue(
      new Promise<void>((resolve) => {
        completeLog = resolve;
      })
    );
    let responded = false;
    const pending = POST(request()).then((response) => {
      responded = true;
      return response;
    });
    await vi.waitFor(() => expect(logAiUsage).toHaveBeenCalledOnce());
    expect(responded).toBe(false);
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: 'tenant',
        conversationId: 'conversation',
        mode: 'draft',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
      })
    );
    completeLog();
    expect(await (await pending).json()).toEqual({
      draft: 'Hello from the draft',
    });
  });

  it('returns the draft if accounting fails instead of making another provider call', async () => {
    vi.mocked(logAiUsage).mockRejectedValue(
      new Error('Synthetic logging failure')
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ draft: 'Hello from the draft' });
      expect(generateReply).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('does not call the paid provider for a conversation outside the caller account', async () => {
    const lookup = {
      select: () => lookup,
      eq: () => lookup,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    vi.mocked(requireRole).mockResolvedValue({
      accountId: 'tenant',
      userId: 'agent',
      supabase: { from: () => lookup },
    } as never);
    expect((await POST(request())).status).toBe(404);
    expect(generateReply).not.toHaveBeenCalled();
    expect(logAiUsage).not.toHaveBeenCalled();
  });
});
