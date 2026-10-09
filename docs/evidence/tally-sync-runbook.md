# Shalimar Tally sync operator runbook

**Status:** Prepared for controlled evidence collection; production rollout is not approved
**Owner:** Shalimar owner/admin (assign before first staged cycle)
**Source:** `SHALIMAR FASHIONS` in TallyPrime Gold 7.1
**Tally endpoint:** `http://127.0.0.1:9000/` on the shop Windows computer
**CRM endpoint:** the deployed Shalimar CRM intake, over HTTPS only

This runbook is for a one-way, read-only Tally path. The local agent uses Tally's
`Export` operation and read-only collections; it must never use `Import` or
`Execute`. It does not send WhatsApp messages. A local fixture, a staged receipt,
or a successful application build is not proof that the live Tally company,
hosted Supabase project, or Meta provider is ready.

## 1. Preflight and stop conditions

Before touching a live company, assign an owner and record the date, operator,
shop computer, worker host, selected closed month, and intended CRM account.
Keep the Tally company backup and all exports in a private folder outside this
repository. Do not put API keys, passwords, Meta tokens, customer exports, or
serial numbers in this evidence file.

On the shop computer:

1. Open TallyPrime and select exactly `SHALIMAR FASHIONS`.
2. Confirm TallyPrime release `7.1` and the HTTP/ODBC service on local port
   `9000` in **F1 Help → Settings → Connectivity → Client/Server
   Configuration**.
3. Confirm the service is bound to loopback or the private network required by
   the worker. Do not port-forward 9000 or enable branch synchronisation.
4. Select the most recent fully closed month. Record the Tally Sales Register
   voucher count and gross value for that exact period.

Stop immediately if the company, release, period, endpoint, response type, or
worker account differs from the expected values. Also stop on malformed XML,
an unexpected Tally error, a reconciliation mismatch, a shared or conflicting
identity that has not been reviewed, an unavailable CRM endpoint for 24 hours,
or any request to bypass consent or delivery approval.

## 2. Migration order and hosted database receipt

Apply migrations in repository order in the intended Shalimar Supabase project.
Do not skip or reorder them. The historical customer-data migration is separate
from live Tally sync:

| Order | Migration | Purpose | Required evidence |
|---|---|---|---|
| 1 | `052_customer_data_imports.sql` | Controlled historical import path, if the owner is using it | Supabase result row and source receipt; this does not prove live Tally sync |
| 2 | `053_tally_readonly_sync_staging.sql` | Account-scoped run, ledger, voucher, voucher-line, and stock staging plus API-only ingest RPC | Hosted migration success and an authenticated schema/readback check |
| 3 | `054_tally_reconciliation.sql` | Reconciliation status/reason codes and immutable `tally_report_snapshots` | A reconciled run with snapshot id, checksum, period, and coverage |
| 4 | `055_tally_identity_mapping.sql` | Ledger-to-contact review queue and evidence fields | Admin review queue readback; unresolved rows remain blocked |
| 5 | `056_tally_report_views.sql` | Account-scoped report views/queries | Report response with source period, INR currency, coverage, last sync, and reconciliation state |

The intake route is `POST /api/v1/tally/sync`. It requires an API key with
`tally:sync`, limits the JSON body to 2 MiB and 50,000 rows per collection, and
accepts only the bounded `SyncPayload` produced by the agent. A repeated
`payload_sha256` returns a `duplicate` receipt and does not add a second run.
Keep the scoped key in the worker's protected secret store; never paste it into
chat, a spreadsheet, a public issue, or a committed `.env` file.

## 3. Closed-month local read (no upload)

Run the agent on the shop computer with Tally open and the closed period selected.
Use the repository's `tally-agent` package and its `runOnce`/`extractSyncPayload`
entry point in local verification mode. The first run must only read
`http://127.0.0.1:9000/` and write a local receipt; do not configure the CRM
intake URL or a sync key for this step.

Record in the receipt, without recording secrets:

- exact company name and Tally release;
- period start/end;
- ledger, voucher, and stock-item counts;
- declared gross value in INR paise;
- deterministic payload checksum;
- local timestamp and agent version;
- `upload: false` / equivalent local-only result.

Compare voucher count and gross value with the Tally Sales Register control copy.
Keep the Tally report and the local receipt together in the private evidence
folder. A passing local identity check alone does not authorise upload.

## 4. Three staged CRM cycles and reconciliation

After the owner accepts the local receipt and hosted migrations have a database
receipt, configure the worker with the private CRM HTTPS intake and a dedicated,
revocable `tally:sync` key. Run one closed month first. For each of three
distinct 15-minute cycles:

1. Capture the agent run receipt and payload checksum.
2. Confirm the intake response has a run id, row counts, received time, and
   `delivery_enabled: false`.
3. As an authenticated admin, call
   `POST /api/tally/reconcile?run_id=<run-id>` once. The function compares the
   staged voucher count and gross value with the declared payload. Keep the
   returned status, differences, reason codes, and snapshot id.
4. If status is `blocked`, stop. Do not edit staged rows to force a match;
   correct the source mapping or period and submit a new checksum.
5. As an authenticated viewer/admin, call
   `GET /api/tally/reconcile?run_id=<run-id>` and the Tally report/sync-status
   views. Verify account scope, period, currency `INR`, coverage, source
   checksum, last sync time, and reconciliation state.
6. Repeat with the next scheduled cycle. A duplicate checksum is useful
   idempotency evidence, but it does not count as a distinct successful cycle.

The three-cycle evidence is complete only when all three runs are distinct,
reconciled, and have CRM readback. Save the run ids and checksums in the private
receipt, not in a public repository file.

## 5. Identity and report verification

Review the identity mapping queue before publishing any contact facts. Phone is
the strongest match; name-only matches, shared phones, missing phones, and
conflicting CRM contacts remain `manual_review` or `blocked`. Mapping a ledger
does not create consent, remove suppression, or infer language.

Open CRM Reports → Tally and confirm each result shows its source period,
currency, coverage, last sync, and reconciliation state. A pending or blocked
latest required period must leave reports blocked while the last valid snapshot
remains identifiable. Historical `customer_data_imports` rows must remain
labelled as historical imports, not live Tally data.

## 6. Broadcast safety gate

Do not approve or send a campaign during sync verification. The sync API,
reconciliation route, report APIs, and AI report preview have no send side
effect. Keep `MESSAGING_DELIVERY_MODE=dry-run` and
`MESSAGING_LIVE_APPROVED` unset/false.

Before a future campaign can be considered, an owner must separately verify:

- the audience contains only resolved Contacts with explicit, current
  WhatsApp marketing permission;
- unknown, opted-out, globally suppressed, stale, unreconciled, shared-phone,
  and unresolved contacts are excluded with counts and reasons;
- the exact Meta WABA, template name/language/category, media, and approval
  status are read back from the current provider;
- the campaign audience, template, budget, owner, and delivery mode are
  reviewed and approved for that specific campaign;
- any controlled test has its own written approval and recipient scope.

A reconciled Tally snapshot is a data-quality gate only. It is never an implied
consent record or sending approval.

## 7. Production-readiness checklist

Mark an item **verified** only with current evidence from the named live system.
Use **pending** when evidence has not been collected; do not infer it from
local tests or code review.

| Gate | Required evidence | Status |
|---|---|---|
| Tally identity | Owner-observed `SHALIMAR FASHIONS`, release 7.1, port 9000 receipt | Pending live closed-month run |
| Local read | Closed-month control totals match local agent receipt; upload false | Pending |
| Private network | Port 9000 is not publicly reachable; worker uses private route | Pending network check |
| Database schema | Hosted Supabase receipts for migrations 053–056 (and 052 if used) | Pending hosted readback |
| Three cycles | Three distinct intake receipts with counts/checksums | Pending |
| Reconciliation | Three exact count/gross matches and snapshot ids | Pending |
| CRM reports | Authenticated readback of period, INR, coverage, sync time, and state | Pending |
| Identity review | Admin resolution/evidence for shared, missing, and conflicting phones | Pending |
| Consent | Independent permission ledger evidence and suppression check | Pending |
| Meta provider | Current WABA/template/media status and any controlled-test receipt | Pending provider readback |
| Broadcast controls | Dry-run remains active; owner approval recorded before any change | Verified locally; live flag readback pending |
| Operations | Owner, rollback contact, stale/error alert path, and 24-hour failure stop | Pending |

The rollout is **not production-ready** while any required row is pending. Do
not enable a broadcast workflow, change delivery flags, or describe the CRM as
live until the owner signs the completed checklist and retains the underlying
Tally, Supabase, CRM, and Meta receipts.

## Evidence register

Store receipts in a private, access-controlled folder with this naming pattern:

```text
TALLY_SYNC_<YYYY-MM-DD>_<cycle-or-local-read>_<run-id>.json
TALLY_CONTROL_<YYYY-MM-DD>_<period>.pdf-or-xlsx
CRM_READBACK_<YYYY-MM-DD>_<run-id>.json
```

Record the operator, timestamp, source period, run id, checksum, status,
snapshot id, and system that produced each receipt. Redact credentials,
personal exports, serial numbers, and private network addresses before sharing
an evidence summary.
