# Task 2 report — CRM intake and staging schema

## Delivered

- Added migration `053_tally_readonly_sync_staging.sql` with account-scoped run, ledger, voucher, voucher-line, and stock-item staging tables, strict checks, indexes, authenticated-member read RLS, and no authenticated/anonymous write grants.
- Added `tally:sync` API-key scope and description.
- Added `POST /api/v1/tally/sync`. It requires the scope, caps request bodies at 2 MiB, validates fingerprints, dates, counts, row limits, text fields, and numeric bounds, detects account-scoped duplicate payload checksums, and persists child records under the resolved API-key account.
- The response includes `{ data: { run, delivery_enabled: false } }`; the route performs no Tally calls, consent writes, audience changes, or broadcast delivery.
- Added route tests for authentication/scope failures, oversized bodies, invalid fingerprint/date, and duplicate checksum behavior.

## Validation

- `npm test -- --run src/app/api/v1/tally/sync/route.test.ts` — passed (4 tests).
- `git diff --check` — passed.
- `npm run typecheck` reaches only the pre-existing `tally-agent/tests/queue.test.ts` UUID fixture error (`"a"` is not a UUID); the new route and migration introduce no typecheck errors.

## Concerns / follow-up

- The intake route writes the run and child tables through separate Supabase calls. A later hardening task could move this into a single database RPC for all-or-nothing persistence if production operational requirements demand transactional ingestion.
- Migration parser/lint tooling was not available in this checkout; the SQL is written as an idempotent Supabase migration and should be applied in the normal migration CI/environment.
