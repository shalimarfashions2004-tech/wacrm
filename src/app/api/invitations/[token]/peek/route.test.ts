import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ success: true })),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { invitationPeek: 20 },
}));

import { GET } from "./route";

const validToken = "A".repeat(43);

function request(token: string): Request {
  return new Request(`https://crm.example/join/${token}/peek`);
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
});

describe("GET /api/invitations/[token]/peek", () => {
  it("rejects malformed tokens before touching the database", async () => {
    const response = await GET(request("short"), {
      params: Promise.resolve({ token: "short" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns the fixed public preview contract", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        account_name: "Shalimar Fashions",
        role: "admin",
        expires_at: "2026-10-11T00:00:00Z",
        internal_column: "never expose",
      },
      error: null,
    });

    const response = await GET(request(validToken), {
      params: Promise.resolve({ token: validToken }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      account_name: "Shalimar Fashions",
      role: "admin",
      expires_at: "2026-10-11T00:00:00Z",
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("returns not_found from the RPC without leaking database fields", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: false, reason: "not_found", token_hash: "secret" },
      error: null,
    });

    const response = await GET(request(validToken), {
      params: Promise.resolve({ token: validToken }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, reason: "not_found" });
  });

  it("converts an invalid RPC shape to a server error", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });

    const response = await GET(request(validToken), {
      params: Promise.resolve({ token: validToken }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "server_error",
    });
  });
});
