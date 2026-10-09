# Task 5 report — report query layer and APIs

## Delivered

- Added account-scoped report queries for sales overview, customer segments, product performance, and stock opportunities.
- Reports read the latest valid reconciled snapshot and raw rows for that snapshot; a newer pending/blocked run changes the report metadata to `blocked` while retaining the last valid metrics.
- Applied bounded product, category, and customer filters; sales comparison is explicitly marked unavailable until a second reconciled period exists.
- Added bounded date ranges (maximum 366 days), page size (maximum 100), page index, and inactivity threshold inputs with deterministic ordering and stable pagination.
- Added read-only `/api/tally/reports` and `/api/tally/actions` routes. Routes require viewer access and never create consent, tasks, or messages.
- Added reconciled SQL views for vouchers, lines, and stock with security-invoker semantics and account/reconciliation joins.
- Added tests covering overview totals, top products/customers, no-sale products, negative stock, date bounds, and pagination.

## Validation

- `npm test -- --run src/lib/tally/reports.test.ts` — passed (3 tests).
- `npm run typecheck` — reaches the pre-existing `tally-agent/tests/queue.test.ts` UUID fixture error (`"a"` is not a UUID); Task 5 files introduce no reported type errors.
- No provider, broadcast, or live send path was enabled.
