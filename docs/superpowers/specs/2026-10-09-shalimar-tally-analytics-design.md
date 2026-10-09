# Shalimar Tally analytics, proactive CRM, and AI report design

**Status:** Proposed for review  
**Date:** 2026-10-09  
**Business:** SHALIMAR FASHIONS, Ernakulam/Kochi  
**Scope:** TallyPrime read-only sync, sales/customer/product analytics, staff work queues, grounded AI reports, and consent-gated WhatsApp follow-up

## Shared understanding

The goal is to make Shalimar Connect useful for daily decisions, not merely to copy Tally data. Owners need to see what is selling, who is valuable, who has gone quiet, which products are stuck, and what action to take. Staff need a clear customer list and a ready-to-review English or Malayalam message. The system must preserve Tally as the financial source of truth, preserve CRM consent and conversation history, and keep WhatsApp broadcasts disabled until the audience and campaign are approved.

Existing evidence includes historical customer/invoice files, a current stock summary, and a verified TallyPrime 7.1 Gold company. Historical customer files cover 1-Apr-2024 to 23-May-2026; the new Tally sales workbook is a monthly summary from 1-Jun-2026 to 9-Oct-2026. These periods must remain labelled separately until detailed transactions reconcile.

## Goals

- Read Tally continuously without daily manual export after installation.
- Show sync health and reconciliation evidence in CRM.
- Produce owner and staff reports for customers, sales, products, and stock.
- Generate actionable, source-grounded AI explanations and draft messages in English and Malayalam.
- Let staff review, edit, assign, and mark an action complete without allowing AI to send or approve a campaign.
- Preserve unknown consent as unknown and exclude it from broadcast audiences.

## Non-goals

- Writing invoices, ledgers, stock, prices, or any other data back into Tally.
- Automatically discounting products or changing prices.
- Automatically sending promotional WhatsApp messages.
- Treating a phone number found in an invoice as proof of marketing consent.
- Claiming a “best customer” or “best product” without naming the period, metric, currency, and data coverage.

## Recommended architecture

```text
TallyPrime on shop Windows PC
  -> local XML/ODBC read at 127.0.0.1:9000
  -> Shalimar Sync Agent (Windows scheduled service, read-only)
  -> HTTPS intake with a scoped, revocable key
  -> Supabase raw staging + reconciliation
  -> normalized sales/customer/product/stock facts
  -> CRM report APIs and interactive pages
  -> grounded AI report drafts
  -> human review, consent check, campaign approval
  -> WhatsApp only when explicitly approved
```

The local agent is preferred to a central pull worker because it avoids inbound access to the shop computer. It must keep a local cursor and retry queue. The CRM intake is idempotent by source company fingerprint, source period, voucher identifier, and payload checksum.

## Data model

### Raw and control tables

- `tally_sync_runs`: company, release, source period, received time, status, counts, gross total, checksum, and error.
- `tally_sync_vouchers`: source voucher ID/number, date, party, type, gross/taxable value, and raw source reference.
- `tally_sync_voucher_lines`: voucher-to-product lines, quantity, rate, discount, and amount.
- `tally_sync_ledgers`: Tally ledger identity, name, parsed phone, address, and review state.
- `tally_sync_stock_items`: Tally item identity, name, group, unit, quantity, rate, and value.
- `tally_identity_map`: Tally ledger identity to CRM contact with `auto_matched`, `manual_review`, or `blocked` state.
- `tally_report_snapshots`: immutable aggregate results with source period and input checksum.

The existing historical `customer_data_imports` and `customer_data_rows` path remains separate. It may be reconciled into the live identity layer, but it must not be silently overwritten by a new Tally run.

## Reports and metrics

Every report displays source period, last successful sync, currency (INR), invoice coverage, and reconciliation status.

### Owner overview

- Revenue, invoice count, units, average order value, and active customers.
- Current period versus previous period and same period last year where coverage exists.
- Top products by units and gross value.
- Top customers by gross value, frequency, recency, and contribution share.
- Stale stock value and negative stock count.
- Sync freshness and unresolved identity count.

### Customer intelligence

- **High-value:** highest lifetime or selected-period gross value.
- **Frequent:** most invoices/orders in the selected period.
- **Recent:** purchased within the selected recency window.
- **At risk/inactive:** no purchase for a configured number of days, with the threshold shown.
- **One-time:** exactly one purchase in the selected coverage.
- **Product affinity:** customers who bought a selected item/group.
- **Not recently purchased:** valid customer history but no purchase in the selected period.
- **Consent state:** opted in, opted out, unknown, or evidence missing.

RFM-style scoring may rank customers, but the UI must show the underlying recency, frequency, and monetary values so staff can understand why someone is included.

### Product and stock intelligence

- Best-selling products by units, gross value, and number of invoices.
- Products selling slower than the prior period or same period last year.
- Products with no sales for a selected number of days.
- Stock remaining, stock value, negative stock, and stock-age warning when stock-entry dates are available.
- “Last year sold, this year not yet sold” comparison with explicit coverage and data-quality caveat.
- Product-to-customer affinity for follow-up lists.

No automatic price or discount recommendation is executed. The system may suggest “review price/promotion” and show the evidence; an owner decides.

## Interactive UI

### Existing CRM tab integration

The new Tally layer is a shared data source for the existing CRM tabs, not a separate mini-CRM. Each tab keeps its current role and reads the same account-scoped identity and consent records:

- **Dashboard:** adds reconciled Tally KPIs and a sync-freshness card while preserving WhatsApp, pipeline, and activity metrics.
- **Contacts:** shows Tally lifetime value, order frequency, last purchase, product affinity, consent state, and data-quality warnings on the existing contact record.
- **Inbox:** can show purchase context and approved staff action prompts beside a conversation; it does not send automatically.
- **Broadcasts:** uses only consent-filtered report audiences and preserves the existing template, budget, opt-out, and owner-approval gates.
- **Automations:** can trigger internal review tasks from reconciled events; it cannot trigger promotional delivery without the existing managed-messaging approval path.
- **AI:** uses reconciled Tally snapshots plus permitted CRM context and keeps drafts preview-only.
- **Notifications:** receives sync failures, stale-data alerts, reconciliation blocks, and assigned customer/product tasks.
- **Settings:** owns Tally connection, sync health, API-key scope, report defaults, inactivity thresholds, and language preferences.

Existing contacts, conversations, consent rows, tags, assignments, and audit history remain authoritative in their current tables. Tally facts are linked by stable identity mappings and must never create parallel contact records or overwrite relationship fields silently.

### Settings → Tally Sync

Shows connection health, last run, next expected run, source period, counts, gross total, checksum, reconciliation result, error history, and a link to the report snapshot. Empty state says that no live sync has arrived; it does not present historical imports as live.

### Reports → Sales Intelligence

Uses filter chips for date period, customer, product, category, staff owner, and language. Every chart supports click-through to the underlying customer, invoice, or item rows. Exports are read-only and include the source receipt.

### Reports → Customer Actions

Shows queues for new collection, inactive customer, high-value follow-up, product-interest follow-up, and unresolved contact. Each row has owner, reason, evidence, suggested next action, language, consent state, and completion status.

### Reports → Stock Opportunities

Shows slow-moving, no-sale, low-stock, negative-stock, and year-over-year product opportunities. Each card links to the product evidence and suggested staff action.

## AI behaviour

The AI receives only reconciled report snapshots and approved CRM context. It must return:

- a plain-language explanation;
- the source period and metrics used;
- confidence/data-quality notes;
- a recommended human action;
- an English draft and Malayalam draft when the language is known or selected;
- a “needs review” state when coverage, identity, or consent is incomplete.

Example drafts:

- Re-engagement: “We have not seen you for a while. Shalimar Fashions has new collections in store. Would you like us to share them?”
- Slow stock: “This product has remained in stock while sales are slower than the comparison period. Please review display, price, and promotion.”
- Year-over-year: “This product sold X units in the comparison period last year and Y units this period. The data covers [dates]. Please review before acting.”

The drafts are visible to staff and owner only. AI cannot create consent, change a price, approve a broadcast, or send a message.

## Sync and reconciliation

- Default interval: 15 minutes.
- First load: one closed month only.
- Subsequent loads: incremental vouchers plus refreshed ledger and stock snapshots.
- Local queue survives internet interruption.
- Duplicate payloads are ignored by checksum and source identity.
- A mismatch in invoice count or gross value blocks new report snapshots and customer-action queues until reviewed.
- A stale sync alert appears after 24 hours without a successful run.

Acceptance requires three consecutive successful runs, one closed-month reconciliation, a CRM readback of the receipt, and confirmation that no broadcast audience changed.

## Permissions and safeguards

- Viewer: read reports and sync health.
- Agent: view assigned action queues and draft messages; cannot approve campaigns.
- Admin/owner: manage mappings, resolve data-quality rows, and approve report-driven campaigns.
- Sync agent: scoped intake only; no WhatsApp send permission.
- Broadcasts remain off unless consent, template, budget, audience, and owner approval checks all pass.

## Research notes

The current WACRM baseline already provides shared inbox, contacts, tags, pipelines, broadcasts, automations, and AI reply support.[WACRM overview](https://github.com/athulat/whatsapp-CRM) Comparable analytics projects use validated transaction facts, SQL aggregates, interactive product/customer pages, and RFM-style segmentation rather than opaque AI rankings.[CRM analytics example](https://github.com/mekyto/CRM_analysis), [retail RFM example](https://github.com/altamash-analyst/Retail-Customer-Sales-Segmentation) Local Tally bridge projects reinforce the need for a read-only local connector, incremental cursor, and disabled writes by default.[tally-api](https://github.com/NienHQ/tally)

## Phased implementation

1. **Spec and schema:** agree this design, add staging/fact/report tables, and keep all writes disabled.
2. **Agent spike:** read one closed month locally and produce a signed receipt without CRM upload.
3. **Intake:** send the receipt and staged rows to CRM using a dedicated `tally:sync` key.
4. **Reconciliation:** compare counts and totals; show status in Settings → Tally Sync.
5. **Reports and tab integration:** add owner, customer, product, stock, and action-queue pages, then wire shared metrics into existing CRM tabs.
6. **AI:** generate grounded report explanations and bilingual drafts from snapshots.
7. **Historical merge:** reconcile the existing CSV customer history with new-shop Tally data.
8. **Broadcast readiness:** require consent evidence and separate campaign approval.

## Open decisions for implementation

- Exact Tally voucher and stock collections to use for the first closed-month spike.
- Whether the owner wants the sync agent installed as a Windows Scheduled Task or Windows service.
- Which AI provider is enabled for Shalimar; the report layer must work with AI disabled and show a useful deterministic summary.
- The exact inactivity window (recommended default: 90 days, adjustable per report).
