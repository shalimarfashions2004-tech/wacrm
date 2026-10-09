# Task 3 report — reconciliation and snapshot builder

## Delivered

- Added migration `054_tally_reconciliation.sql` with account-scoped reconciliation state on staged runs and a `tally_report_snapshots` table protected by member-read RLS.
- Added the `tally_reconcile_run` security-definer RPC. It compares declared voucher count and gross value with staged vouchers, records deterministic reason codes, and inserts an idempotent snapshot only for an exact, valid match. Snapshots retain the source checksum, period coverage, INR currency, and `tally-v1` metric version.
- Added `reconcileRun` and an admin-only `GET /api/tally/reconcile?run_id=...` route. Responses contain reconciliation metrics and reason codes only; staged payload rows are not returned.
- Added tests covering exact match, count mismatch, gross mismatch, missing period, invalid negative totals, and idempotent reruns.

## Validation

- `npm test -- --run src/lib/tally/reconcile.test.ts` — passed (6 tests).
- `git diff --check` — passed.
- `npm run typecheck` reaches the pre-existing `tally-agent/tests/queue.test.ts` UUID fixture error (`"a"` is not a UUID); Task 3 files introduce no reported type errors.

## Concerns / follow-up

- The staging migration currently requires source period fields and non-negative declared gross at intake, so missing-period and negative-total reason paths are defensive reconciliation handling for legacy or directly inserted rows.
- SQL parser/lint tooling was not available in this checkout; migration should be applied through normal Supabase migration CI.

## Review fix

- Restricted the security-definer reconciliation RPC to account owners/admins while retaining authenticated execution for the admin route.
- Changed voucher gross aggregation to numeric before converting to bigint, returning a blocked `observed_gross_overflow` reason instead of allowing a bigint overflow exception.

- Split the admin route into a read-only GET status endpoint and an explicit POST reconciliation/snapshot action, with route regression coverage proving GET does not invoke reconciliation.
