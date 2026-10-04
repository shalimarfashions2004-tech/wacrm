# Shalimar Connect engineering baseline

Updated: 2026-10-04

This baseline records the engineering controls applied while repairing the
team invitation flow and reconciling the production schema. It is a release
checklist and ownership aid, not a claim that every CRM workflow has completed
production acceptance.

## Current repair

- The live Supabase project was missing `peek_invitation(text)` and
  `redeem_invitation(text)`, even though the application routes depended on
  them. The reviewed SECURITY DEFINER functions were applied additively to the
  existing Shalimar project.
- Anonymous preview is limited to the account name, role and expiry. The
  plaintext token remains out of the database; only its SHA-256 hash is used.
- Redeem remains authenticated, atomic and data-loss guarded. It refuses a
  caller whose personal account already contains CRM data or who is already in
  a shared account.
- The API now rejects malformed token shapes before a database call and
  validates the RPC response shape before returning it to the browser.
- The live production database also lacked the quick-reply and AI knowledge
  objects that the settings pages query. Migration 049 restores those tables,
  columns, indexes, RLS policies and retrieval grants additively.
- Dashboard navigation now has a shared route-level skeleton in
  `src/app/(dashboard)/loading.tsx`, so every dashboard route displays an
  immediate loading layout while its bundle and data requests settle.

## Engineering rules

1. **One responsibility per layer.** Token generation and validation are pure
   utilities; route handlers own HTTP status and rate limiting; Postgres RPCs
   own the account move transaction; the page owns presentation and sign-in
   state.
2. **Least privilege by default.** Preview is executable by `anon`; redeem is
   executable only by `authenticated`; both functions use a fixed `public`
   search path and have public execution revoked.
3. **Fail closed.** Invalid input, missing RPCs, malformed responses and
   missing consent stop the request with a safe error instead of guessing.
4. **Idempotent database changes.** Migration 048 uses `CREATE OR REPLACE` and
   explicit grants so restores and reconciliations do not duplicate objects or
   data.
5. **Evidence before readiness.** A passing local build or unit test does not
   prove live provider, database or WhatsApp delivery readiness. Each release
   needs live readback evidence for the changed boundary.

## Verification completed

- Live preview endpoint: malformed token → `not_found`; existing Admin invite →
  account preview with expiry.
- Live Supabase SQL Editor: quick-replies and AI schema reconciliation returned
  `Success. No rows returned`; Vercel production deployment is Ready.
- Invitation unit and route contract tests: 24 passed.
- TypeScript check: passed.

## Next team-owned controls

- Run the complete test, lint and production build suite before each release.
- Replay all migrations on a disposable Supabase project, then run
  `supabase/ci/verify-schema.sql` against the intended project after approval.
- Add authenticated browser acceptance for sign-in, Accept invitation, role
  readback and cross-account RLS isolation.
- Keep WhatsApp delivery in dry-run until Meta registration, consent evidence,
  approved templates, webhook readback and the explicit single-recipient live
  approval all pass.
