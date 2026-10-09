# Shalimar Tally → CRM read-only sync plan

**Status:** Local implementation and documentation prepared; live rollout pending evidence
**Business:** SHALIMAR FASHIONS  
**Tally:** TallyPrime Gold 7.1 on the shop Windows 11 computer  
**Current endpoint:** local Tally HTTP/ODBC service on port 9000  

## Decision

Use a one-way, read-only extractor from TallyPrime into a private sync worker, then write only derived records to the CRM data warehouse. Do not use Tally branch synchronisation for this connection: branch synchronisation is designed to replicate Tally companies and can send data in both directions. The extractor must never write XML back to Tally.

The sync worker runs every 15 minutes while the shop computer and Tally are available. It records a run receipt, source period, row counts, totals, checksum, and errors. A reconciliation failure blocks audience generation and outbound campaigns. The current implementation is additive and staged: the API stores a receipt and child rows, the admin reconciliation function compares voucher count and gross value, and only an exact match creates a `tally_report_snapshots` row. A duplicate payload checksum returns a duplicate receipt and does not create a second run.

## Network and security

- Keep Tally port 9000 private. Tally's XML endpoint is an HTTP service and must not be exposed on the public internet.
- Put the shop computer and the sync worker on a private network such as the existing tailnet. Do not port-forward 9000.
- Use a dedicated read-only worker identity. No Tally password, Meta token, or CRM service key goes into the Windows desktop or a spreadsheet.
- Keep the existing local company check as a first-stage identity check. It is not a sync client.
- Back up the Tally company before enabling any new integration configuration.

## Data flow

```text
TallyPrime (SHALIMAR FASHIONS)
  -> private HTTP/XML or ODBC read
  -> sync worker (every 15 minutes)
  -> staging tables and reconciliation
  -> customer identity mapping
  -> CRM contacts / sales analytics
  -> consent-filtered audience preview
  -> human approval before any WhatsApp broadcast
```

## Source ownership

| Data | Authoritative source | CRM behaviour |
|---|---|---|
| Invoices, amounts, GST, ledger balances | TallyPrime | Read and derive; never edit Tally |
| Contact name, assignment, notes, consent | CRM | Never overwrite from Tally without a reviewed mapping |
| Segments and rankings | Derived warehouse tables | Rebuilt after each successful sync |

## Implemented staging and report tables

Migrations `053_tally_readonly_sync_staging.sql` through `056_tally_report_views.sql` prepare the following account-scoped tables. Applying a migration locally or passing application tests is not evidence that the hosted Shalimar Supabase project has applied them.

- `tally_sync_runs`: start/end time, status, company fingerprint, source period, counts, totals, checksum, error
- `tally_ledgers`: stable Tally identifier, ledger name, parsed phone, address, source timestamps
- `tally_stock_items`: stable item identifier, item name, group, unit, quantity, rate, value
- `tally_vouchers`: voucher identifier/number, date, party, item, quantity, rate, taxable/gross value
- `tally_identity_map`: Tally ledger identifier to CRM contact, with review status and evidence
- `tally_report_snapshots`: immutable report source/checksum, period, coverage, currency, and metric version for reconciled runs

The current `customer_data_imports` tables remain the controlled historical-import path. They do not prove that live Tally sync is active.

### Completeness guard

The local agent exports voucher amounts as plain signed numbers and requests the full voucher object so inventory entries are retained. The parser accepts TallyPrime's `ALLINVENTORYENTRIES.LIST` and `INVENTORYENTRIES.LIST` forms, including quantities with units and amounts with `Dr`/`Cr` decorations. A received run is not treated as report-ready until reconciliation confirms its declared voucher count and gross value; a run with missing amounts or lines must remain pending/blocked and be replaced by a corrected read.

## Operator rollout order

Follow [`docs/evidence/tally-sync-runbook.md`](./evidence/tally-sync-runbook.md) for the concrete operator procedure and evidence register. The order is:

1. **Identity:** confirm the exact company `SHALIMAR FASHIONS`, TallyPrime release 7.1, and local port 9000. Stop on any mismatch.
2. **Local read:** run one closed-month read with `tally-agent` and keep the local receipt. This first pass must not upload data.
3. **Private reachability:** keep port 9000 on loopback/private network only; never port-forward it. Confirm the worker can reach CRM only over HTTPS.
4. **Staging:** apply and verify migrations 053–056 in the intended Shalimar Supabase project, then send one closed month to `/api/v1/tally/sync` with a scoped `tally:sync` key.
5. **Reconciliation:** call the admin reconciliation route for the returned `run_id`. Voucher count and gross value must match the declared Tally period; a blocked run creates no report snapshot.
6. **Three-cycle proof:** complete three distinct scheduled cycles, capture each receipt, and verify account-scoped CRM readback for counts, checksum, status, and snapshot.
7. **Identity review:** map phone/name collisions manually; the worker may not invent customers. Keep consent unknown unless separate evidence is recorded.
8. **Broadcast preview:** only opted-in, non-suppressed, resolved contacts may enter an audience. Saved campaigns still require template, audience, budget, owner, and delivery approval.
9. **Operations:** monitor last successful run, next expected run, stale age, error count, reconciliation state, and the identity review queue.

The API contract is `POST /api/v1/tally/sync` with the `tally:sync` scope and a maximum 2 MiB JSON payload. It returns `delivery_enabled: false` for both new and duplicate receipts. Reconciliation is an authenticated admin operation at `POST /api/tally/reconcile?run_id=...`; `GET` reads status and snapshot metadata without mutating it.

## Shop-computer setup required

On the shop computer, staff must keep TallyPrime running with `SHALIMAR FASHIONS` loaded. In TallyPrime open **F1 Help → Settings → Connectivity → Client/Server Configuration** and confirm the HTTP/ODBC service and port 9000. Do not change the company, enable public access, or configure two-way branch synchronisation.

The next technical handoff is the private-network address of the shop computer and a worker host. No password or token is needed in chat.

## Broadcast boundary

The sync can update customer and sales data all day. It must not send WhatsApp messages automatically. Existing customer files have no marketing-consent evidence, so broadcasts remain disabled until consent is recorded and a campaign is separately approved.

The local agent, intake API, reconciliation function, report APIs, and AI report layer do not send WhatsApp messages. A reconciled snapshot is a data-quality prerequisite; it is not campaign approval. Keep `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED` unset/false until the production-readiness checklist has current provider and database evidence.

## Evidence status and acceptance checklist

### Locally verified in this repository

- Read-only agent boundaries and bounded XML parsing are covered by `tally-agent/tests` fixtures; no fixture is a live Tally compatibility check.
- Intake validation, API-key scope, 2 MiB limit, account isolation, idempotent checksum handling, and transactional staging are covered by repository tests and migrations 053–056.
- Reconciliation logic creates a snapshot only on an exact voucher-count/gross-value match; blocked runs carry reason codes.
- Reports and CRM tab contracts preserve source period, INR currency, reconciliation state, stale/missing data, and consent safety. The AI report route is preview-only.
- Existing repository receipts record local typecheck/lint/build/test results for earlier work; they do not prove this rollout is installed in the hosted project.

### Still required before production readiness

- One owner-observed closed-month read from the real Tally company, with Tally report control totals and the agent receipt retained.
- Three distinct staged cycles through the real CRM intake, each with authenticated Supabase readback of run counts, checksum, reconciliation result, and snapshot.
- Confirmation that port 9000 is not publicly reachable and that the worker uses a dedicated, revocable key over HTTPS.
- Manual resolution evidence for shared, missing, or conflicting phones and a separate consent ledger readback.
- Current Meta WABA/template/media status and a separately approved controlled test, if delivery is later authorized.
- A production checklist owner/date, rollback contact, stale/error alert path, and explicit approval before changing delivery flags.

No item in the pending list is implied by a local build, synthetic test, migration file, staged receipt, or public route check.
