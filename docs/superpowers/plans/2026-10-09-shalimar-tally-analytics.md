# Shalimar Tally analytics, proactive CRM, and AI reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only TallyPrime sync pipeline and an interactive CRM analytics workspace that explains customer, product, stock, and year-over-year opportunities, then produces bilingual AI drafts without bypassing consent or approval controls.

**Architecture:** A Windows agent reads Tally locally over XML/ODBC and sends idempotent HTTPS receipts to a scoped CRM intake. Supabase stores raw/staged data and immutable reconciled snapshots; report APIs aggregate from snapshots. Settings shows sync health, Reports shows drill-down analytics and staff queues, and AI drafts are grounded in a selected snapshot.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/Postgres migrations and RPCs, Vitest, existing WACRM API-key auth, Windows PowerShell/agent packaging, existing AI provider abstraction.

**Spec:** `docs/superpowers/specs/2026-10-09-shalimar-tally-analytics-design.md`

## Global Constraints

- TallyPrime remains the financial source of truth; the agent never writes back to Tally.
- Keep port 9000 private and read through the local Tally service.
- Historical imports and live Tally periods remain separately labelled until reconciled.
- Consent remains unknown unless evidence is recorded; unknown, opted-out, suppressed, and unresolved contacts cannot enter broadcast audiences.
- AI cannot create consent, change prices, approve campaigns, or send WhatsApp messages.
- Every report shows source period, INR currency, coverage, last sync, and reconciliation state.
- Broadcasts remain disabled until consent, template, budget, audience, and owner approval checks pass.
- Do not add production dependencies when existing repository patterns are sufficient.

## Review Focus

- Duplicate/replayed Tally payloads: one checksum/source identity must create one staged run. Test in Task 2.
- Wrong company or malformed XML: the agent must stop before upload. Test in Task 1.
- Partial or mismatched closed-month totals: reports and action queues must remain blocked. Test in Task 3.
- Shared, missing, and conflicting phones: identity mapping must quarantine rows and never invent contacts. Test in Task 4.
- AI prompt injection or unsupported claims: report drafts must cite snapshot metrics and return review-needed when data is incomplete. Test in Task 7.

### Task 1: Local Tally read-only agent

**Files:**
- Create: `tally-agent/README.md`
- Create: `tally-agent/src/config.ts`
- Create: `tally-agent/src/tally-xml.ts`
- Create: `tally-agent/src/extract.ts`
- Create: `tally-agent/src/queue.ts`
- Create: `tally-agent/src/runner.ts`
- Create: `tally-agent/tests/tally-xml.test.ts`
- Create: `tally-agent/tests/extract.test.ts`
- Modify: `public/downloads/SHALIMAR_TALLY_START_HERE.html` with the verified install/rollback steps

**Interfaces:**
- Produces `SyncPayload { company_name, company_fingerprint, tally_release, source_period_start, source_period_end, ledgers, vouchers, stock_items, counts, gross_value_paise, payload_sha256 }`.
- `readTallyXml(url: string, requestXml: string): Promise<Document>` accepts only localhost URLs, caps response size, disables DTD/external resolution, and rejects non-XML responses.
- `extractSyncPayload(config: AgentConfig, period: Period): Promise<SyncPayload>` requires exact company name and returns no payload when identity differs.

- [ ] Write failing tests for localhost-only URLs, malformed XML, wrong company, response-size limits, and deterministic payload hashes.
- [ ] Implement XML request/response parsing for company identity, ledger/customer records, voucher headers/lines, and stock items using read-only export collections.
- [ ] Read full voucher objects in calendar-month windows and combine them into one closed-period payload so multi-month periods stay within Tally's local response limits.
- [ ] Add a bounded local queue with retry metadata and no credential logging.
- [ ] Run `npm test -- --run tally-agent/tests` and verify all agent tests pass without a Tally connection.

### Task 2: CRM intake and staging schema

**Files:**
- Create: `supabase/migrations/053_tally_readonly_sync_staging.sql`
- Create: `src/app/api/v1/tally/sync/route.ts`
- Modify: `src/lib/api-keys/scopes.ts`
- Create: `src/app/api/v1/tally/sync/route.test.ts`

**Interfaces:**
- `POST /api/v1/tally/sync` requires the `tally:sync` scope and accepts gzip-compressed `SyncPayload` up to 2 MB on the wire and 8 MB after decompression (identity JSON remains supported).
- Response: `{ data: { run: { id, status, received_at, counts }, delivery_enabled: false } }`.
- Tables: `tally_sync_runs`, `tally_sync_ledgers`, `tally_sync_vouchers`, `tally_sync_voucher_lines`, `tally_sync_stock_items`.

- [ ] Test missing/invalid key, wrong scope, oversized body, invalid fingerprint, invalid dates, and duplicate checksum.
- [ ] Implement account-scoped inserts/upserts with strict row and numeric bounds.
- [ ] Add RLS read access for authenticated workspace members; keep intake writes API-key-only.
- [ ] Run the route tests and SQL parser/lint checks available in CI.

### Task 3: Reconciliation and snapshot builder

**Files:**
- Create: `supabase/migrations/054_tally_reconciliation.sql`
- Create: `src/lib/tally/reconcile.ts`
- Create: `src/lib/tally/reconcile.test.ts`
- Create: `src/app/api/tally/reconcile/route.ts`

**Interfaces:**
- `reconcileRun(runId: string): Promise<ReconciliationResult>` compares voucher count and gross value to the declared Tally period totals.
- `ReconciliationResult` contains `status: 'reconciled'|'blocked'`, expected/observed counts and values, differences, and reason codes.
- Only `reconciled` runs may create `tally_report_snapshots`.

- [ ] Test exact match, count mismatch, gross mismatch, missing period, negative/invalid totals, and rerun idempotency.
- [ ] Implement snapshot creation with source checksum, coverage, currency, and metric version.
- [ ] Expose an admin-readable reconciliation route; do not expose raw payloads to clients unnecessarily.

### Task 4: Identity mapping and contact safety

**Files:**
- Create: `supabase/migrations/055_tally_identity_mapping.sql`
- Create: `src/lib/tally/identity.ts`
- Create: `src/lib/tally/identity.test.ts`
- Modify: existing customer-data review/publish code only where an explicit mapping hook is required

**Interfaces:**
- `matchTallyLedger(input): MatchResult` returns `auto_matched`, `manual_review`, or `blocked` with evidence.
- Phone is the strongest key; name-only matches remain manual review.
- Publishing a contact never creates a consent row and never clears suppression.

- [ ] Test normalized phone matches, shared phones, missing phones, name variants, and conflicts with existing CRM contacts.
- [ ] Add a review queue with owner/admin-only resolution.
- [ ] Reconcile the historical 2,353-customer import separately from new-shop Tally data.

### Task 5: Report query layer and APIs

**Files:**
- Create: `supabase/migrations/056_tally_report_views.sql`
- Create: `src/lib/tally/reports.ts`
- Create: `src/lib/tally/reports.test.ts`
- Create: `src/app/api/tally/reports/route.ts`
- Create: `src/app/api/tally/actions/route.ts`

**Interfaces:**
- `getSalesOverview(filters): Promise<SalesOverview>`.
- `getCustomerSegments(filters): Promise<CustomerSegmentReport>`.
- `getProductPerformance(filters): Promise<ProductPerformanceReport>`.
- `getStockOpportunities(filters): Promise<StockOpportunityReport>`.
- All results carry `source_period`, `currency: 'INR'`, `coverage`, `last_sync_at`, and `reconciliation_status`.

- [ ] Test top products, top customers, high-value/frequent/recent segments, inactive threshold, prior-year comparison, no-sale products, and negative stock.
- [ ] Add stable pagination and bounded date/filter inputs.
- [ ] Block report results when the latest required period is unreconciled, while still showing the last valid snapshot.

### Task 6: Interactive CRM reports and sync status

**Files:**
- Create: `src/components/tally/tally-sync-status.tsx`
- Create: `src/components/tally/report-filters.tsx`
- Create: `src/components/tally/customer-action-queue.tsx`
- Create: `src/components/tally/product-opportunity-card.tsx`
- Create: `src/app/(dashboard)/reports/tally/page.tsx`
- Create: `src/app/(dashboard)/reports/tally/loading.tsx`
- Modify: settings navigation to add `Settings → Tally Sync`
- Create: `src/app/api/tally/sync-status/route.ts`

**Interfaces:**
- Settings page displays last run, next expected run, stale/error state, counts, checksum, and reconciliation.
- Reports page supports period, customer, product, category, staff, and language filters.
- Every chart/table row drills into its underlying customer, voucher, or stock item.
- Action queue rows include owner, evidence, consent state, language, status, and completion note.

- [ ] Add loading, empty, stale, blocked, error, and accessible table states.
- [ ] Test URL filter persistence, pagination, role visibility, and no-data states.
- [ ] Confirm reports never show historical imports as live syncs.

### Task 6A: Existing CRM tab integration

**Files:**
- Modify: `src/lib/dashboard/queries.ts` to add reconciled Tally KPI blocks without removing existing WhatsApp/pipeline/activity metrics
- Modify: `src/app/(dashboard)/contacts` and contact detail components to show linked Tally facts and data-quality state
- Modify: `src/app/(dashboard)/inbox` conversation context to show purchase context without sending side effects
- Modify: broadcast audience/report loaders to consume the same consent-filtered audience preview
- Modify: automations and notifications loaders to accept internal sync/action events only
- Create: `src/lib/tally/tab-contracts.ts`
- Create: `src/lib/tally/tab-contracts.test.ts`

**Interfaces:**
- `TallyTabContext` carries account-scoped `contactId`, source snapshot, source period, reconciliation state, consent state, and evidence links.
- Every existing tab must use the canonical CRM contact and consent rows; no tab may create a second customer record from Tally.
- Tally-derived UI must visibly distinguish live reconciled data, historical imported data, and missing/stale data.

- [ ] Test that a Tally ledger maps to one existing contact, a missing mapping remains review-only, and a shared phone never creates a duplicate.
- [ ] Test dashboard, Contacts, Inbox, Broadcasts, Automations, AI, Notifications, and Settings all preserve their current permissions and safety gates.
- [ ] Test a stale or unreconciled snapshot blocks promotional audience generation but leaves ordinary Inbox replies working.
- [ ] Verify cross-tab readback in the browser after a staged fixture is loaded.

### Task 7: Grounded bilingual AI report layer

**Files:**
- Create: `src/lib/tally/ai-report.ts`
- Create: `src/lib/tally/ai-report.test.ts`
- Create: `src/app/api/ai/tally-report/route.ts`
- Create: `src/components/tally/ai-report-panel.tsx`

**Interfaces:**
- `buildTallyAiReport(snapshot, context, language): Promise<AiReport>`.
- `AiReport` includes summary, evidence metrics, source period, confidence/data-quality notes, recommended human action, English draft, Malayalam draft, and `needs_review`.
- AI input is limited to reconciled snapshot data and approved CRM context; raw prompt instructions from Tally/customer text are treated as data, not commands.

- [ ] Test deterministic fallback when AI is disabled, unsupported claims, incomplete period coverage, Malayalam selection, and prompt-injection text in customer/product names.
- [ ] Require evidence references for every recommendation.
- [ ] Keep drafts preview-only; no send or approval side effect.

### Task 8: End-to-end rollout and documentation

**Files:**
- Modify: `docs/SHALIMAR_TALLY_READONLY_SYNC_PLAN.md`
- Modify: `README.md` or Shalimar setup documentation with operator steps
- Create: `docs/evidence/tally-sync-runbook.md`

- [ ] Run one closed-month local agent read with no upload.
- [ ] Run three staged CRM sync cycles and reconcile the receipt.
- [ ] Verify CRM readback for run counts, checksum, and report snapshot.
- [ ] Verify broadcasts remain blocked for unknown consent and unapproved campaigns.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` (record any environment-only build failure separately).
- [ ] Complete a production-readiness checklist with live Tally and CRM evidence before enabling any broadcast workflow.
