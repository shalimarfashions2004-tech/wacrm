# Task 1 implementation report — local Tally read-only agent

## Delivered

- Added `tally-agent/src/config.ts` with the agent, period, record, and `SyncPayload` contracts.
- Added `tally-agent/src/tally-xml.ts`: localhost-only POSTs, bounded response reads, timeout aborts, XML content-type checks, malformed XML detection, and DTD/entity/external-resolution rejection. It exposes a minimal document tree so the agent has no new runtime dependency.
- Added `tally-agent/src/extract.ts`: read-only collection request, exact company identity gate, ledger/customer, voucher/header/line, stock item extraction, INR paise conversion, company fingerprint, and deterministic payload SHA-256.
- Added `tally-agent/src/queue.ts` and `runner.ts`: bounded local queue with exponential retry metadata and one-shot extraction; queue metadata stores no credentials.
- Added operator documentation and rollback guidance in `tally-agent/README.md` and `public/downloads/SHALIMAR_TALLY_START_HERE.html`.
- Added focused tests for localhost restrictions, malformed XML, DTD rejection, non-XML responses, size limits, wrong company, extraction, and deterministic hashes.
- Extended the existing Vitest include list so the required `npm test -- --run tally-agent/tests` command discovers the new tests.

## Validation

- `npm test -- --run tally-agent/tests` — passed: 2 test files, 6 tests.
- `npm exec tsc -- --noEmit` — currently blocked by a pre-existing generated `.next/types/validator.ts` import for the Task 2 route (`src/app/api/v1/tally/sync/route.ts`), which is intentionally not part of Task 1.
- No Tally connection was used.

## Safety boundaries

The agent accepts only localhost HTTP endpoints, sends only an Export request, rejects DTD/external entities, bounds response memory, requires exact company identity, and produces no CRM upload or messaging side effect. Tally port 9000 remains private.

## Review fixes (follow-up)

- XML now rejects non-whitespace before or after the single root and rejects localhost URLs containing userinfo credentials.
- Company and period values are validated before request construction; company text is XML-escaped and dates must be valid ordered ISO dates.
- Company identity is read only from the dedicated `COMPANYNAME` field; generic `NAME` descendants cannot satisfy the identity gate.
- The Export request now embeds explicit read-only TDL collection definitions for ledgers, vouchers, and stock items, with bounded fetched fields; no Import or Execute operation is used.
- Queue retry metadata stores a fixed safe error marker instead of arbitrary exception text. Added queue and regression coverage.

Follow-up validation: `npm test -- --run tally-agent/tests` — passed, 3 files and 10 tests.

## Review fixes (follow-up 2)

- XML tokenization now rejects any skipped non-whitespace between tokens, including malformed `<<ROOT/>` and `<ROOT/>< ` boundaries.
- ISO dates are calendar-validated after parsing, preventing rollover dates such as 2026-04-31.
- The Export request now uses a company identity collection followed by direct `ShalimarLedgers`, `ShalimarVouchers`, and `ShalimarStockItems` collection requests; each request references the collection it defines.

Validation: `npm test -- --run tally-agent/tests` passed, 3 files and 13 tests.
