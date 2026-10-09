# Shalimar CRM readiness implementation plan

**Approved:** owner approved the plan in this chat on 9 October 2026.
**Spec:** `../specs/2026-10-09-shalimar-tally-analytics-design.md` plus the readiness audit in this chat.
**Execution:** implement in the existing feature checkout; preserve unrelated files. No Tally writes, WhatsApp sends, permission expansion or invented consent.

## Acceptance and decisions

1. Independent controls: a separately observed Tally Sales Register count and gross amount for the exact source period and company are required. Operator-entered controls are labelled as such; they are not an automatic independent audit. New metrics use posted sales only, excluding cancelled/optional vouchers and non-sales. Gross includes taxes and excludes returns; net sales/margin need a later mapped return/tax/cost path.
2. Reconciliation: legacy self-consistency snapshots stay retained, but are no longer accepted by the new report/AI gate. Missing controls, wrong company/period, non-sales rows, zero item coverage for positive retail sales, mismatched counts or amounts block snapshot creation. Schema change is additive.
3. Reports: aggregate on the server/database across the full dataset, avoiding PostgREST's default row truncation. Filter and page in the database. Bundle overview, product, customer and stock sections into one read. Always show period, currency, source, and blocked/empty state.
4. AI: accept only a snapshot ID and report filters; resolve the account through auth; load verified source facts on the server. Never accept browser-supplied revenue, reconciliation, consent or knowledge. English/Malayalam drafts remain review-only. No automatic model spending during verification.
5. Identity: expose an admin review queue for staged customer ledgers; no silent contact creation or consent changes. Shared/missing phones stay blocked. Avoid grouping financial ledgers into customers.
6. Sync operations: ship a deterministic versioned kit with progress, specific failure stage and bounded retry. Full-history source reads still need a shop run; persistent scheduling and incremental corrections cannot be verified on this Mac.
7. Historical data: migration 052 is actually missing in the hosted project, as verified 9 October. Install the reviewed, tested schema before importing the private CSV. Keep historical and new-shop sources separate. Do not infer any marketing permission.
8. Live acceptance: kit receipt + Sales Register control evidence + database counts/amount/line readback + report reconciliation/readback + AI preview. Only after those pass consider separate consent/template/campaign approval and ₹1,000/month enforcement. No campaign sends in this plan execution.

## Tasks and tests

- [x] A. Sales-scope extraction and kit controls: test custom Sales voucher types, non-sales exclusion, optional/cancelled exclusion, missing classification, month bounds, stable source IDs, control checksums, positive amounts and inventory-line coverage.
- [x] B. Migration 057: test actual PostgreSQL ingest/reconcile functions against missing/mismatched controls, cross-account roles, zero-line imports, exact matches and idempotency. Preserve all old runs and snapshots.
- [ ] C. Server report RPC: test >1,000 invoices, empty/blocked status, source selection, role/account filtering, full counts, product/customer filters, inactive customers outside a selected recent period, exact INR paise and bounded pagination.
- [x] D. AI boundary and UI: test forged browser snapshots, wrong-account snapshot IDs, unavailable/blocked sources, filters and deterministic bilingual fallback. Connect the existing preview panel to Reports.
- [ ] E. Identity queue: test missing/shared/conflicting phones and admin-only resolution. No marketing permission writes.
- [ ] F. Deployment and database readback: run full tests, typecheck, lint, build, review changes and retain receipts. Verify schema and run metadata with the connected Shalimar Supabase project; production/browser checks are separate from local proof.
- [ ] G. Shop verification/scheduling: requires owner to run the kit and provide exact register controls; no guessed totals. Install recurring local worker only after three observed successful runs.

## Live findings and limits

- Supabase project `houjlpiyafcanxsabmsk` matches repository deployment documentation.
- Latest run `5b3b765c-c393-4407-b439-a4ce0ed613ff`: 6,351 ledgers, 3,519 vouchers, 142 stock items, gross 0 paise, item lines 0, status reconciled. This must not support sales or AI claims.
- Historical import table is absent. A migration file in the repository was not proof of installation.
- No actual Tally v16 receipt or source controls have yet been supplied. All automatic sync reliability claims remain pending.

## Execution evidence, 9 October 2026

- Local Vitest: 129 files, 1,389 tests passed; TypeScript and ESLint passed.
- Isolated PGlite replay: 23 tests passed, including a legacy run blocked for
  missing controls and an exact `tally-v2` match producing a snapshot.
- Hosted Supabase project `houjlpiyafcanxsabmsk`: migration 052, control totals,
  and legacy gate are installed. The prior 6,351-ledger/3,519-voucher run is
  now `blocked` with `missing_control_totals`; its rows and old `tally-v1`
  snapshot remain retained.
- The version 18 kit is packaged at `/downloads/SHALIMAR_TALLY_SYNC_KIT.zip`.
  It requires the operator's Sales Register voucher count and gross INR amount
  for the exact period. Oversized month reads split into bounded date windows;
  a shop run and exact controls are still required before a report snapshot can
  be created.
