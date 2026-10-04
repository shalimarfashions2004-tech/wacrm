// ============================================================
// GET /api/invitations/[token]/peek
//
// Public — no auth required. Lets the /join/<token> page render
// "You're being invited to <Account> as <Role>" before the
// visitor signs up or signs in.
//
// Security model
//   - Token is in the URL path, not the query, so it doesn't
//     show up in standard access-log "referer" fields the way a
//     `?token=` would.
//   - The plaintext token never crosses the DB boundary — we
//     hash it in TS first and look up by `token_hash`.
//   - The peek RPC is SECURITY DEFINER so it bypasses the RLS
//     that would otherwise block an anonymous SELECT on
//     `account_invitations`. It returns a fixed-shape JSON
//     payload that never leaks columns beyond what the join
//     page renders.
//   - Per-IP rate limit pinches brute-force enumeration of
//     tokens. With 256 bits of entropy the enumeration risk is
//     theoretical, but rate limiting is cheap insurance.
// ============================================================

import { NextResponse } from "next/server";

import {
  hashInviteToken,
  isValidInviteToken,
} from "@/lib/auth/invitations";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort client IP. The `x-forwarded-for` header is what
 * every reverse proxy (Vercel, Hostinger, Cloudflare) sets when
 * forwarding a request; we take the leftmost entry, which is
 * the original client.
 *
 * Falls back to a constant when no proxy is in front (e.g.
 * `localhost` during development) so rate-limit keys still
 * exist — the limit then effectively applies "globally," which
 * is fine for dev.
 */
function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  // Rate-limit by IP first. Returns 429 to a serial bruteforcer
  // before we ever touch the DB.
  const ip = getClientIp(request);
  const limit = checkRateLimit(`peek:${ip}`, RATE_LIMITS.invitationPeek);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  if (!isValidInviteToken(token)) {
    return NextResponse.json(
      { ok: false, reason: "not_found" },
      { status: 404 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("peek_invitation", {
    p_token_hash: hashInviteToken(token),
  });

  if (error) {
    console.error("[peek] rpc error:", error);
    return NextResponse.json(
      { ok: false, reason: "server_error" },
      { status: 500 },
    );
  }

  // Keep the public response contract narrow even if a future SQL change
  // adds columns to the RPC result.
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.error("[peek] invalid RPC response shape");
    return NextResponse.json(
      { ok: false, reason: "server_error" },
      { status: 500 },
    );
  }
  const result = data as Record<string, unknown>;
  if (result.ok === true) {
    if (
      typeof result.account_name !== "string" ||
      !["admin", "agent", "viewer"].includes(String(result.role)) ||
      typeof result.expires_at !== "string"
    ) {
      console.error("[peek] invalid successful RPC response");
      return NextResponse.json(
        { ok: false, reason: "server_error" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      account_name: result.account_name,
      role: result.role,
      expires_at: result.expires_at,
    });
  }
  if (["not_found", "used", "expired"].includes(String(result.reason))) {
    return NextResponse.json({ ok: false, reason: result.reason });
  }
  console.error("[peek] invalid failure RPC response");
  return NextResponse.json(
    { ok: false, reason: "server_error" },
    { status: 500 },
  );
}
