# Shalimar Tally → CRM read-only sync plan

**Status:** Proposed; local preparation only  
**Business:** SHALIMAR FASHIONS  
**Tally:** TallyPrime Gold 7.1 on the shop Windows 11 computer  
**Current endpoint:** local Tally HTTP/ODBC service on port 9000  

## Decision

Use a one-way, read-only extractor from TallyPrime into a private sync worker, then write only derived records to the CRM data warehouse. Do not use Tally branch synchronisation for this connection: branch synchronisation is designed to replicate Tally companies and can send data in both directions. The extractor must never write XML back to Tally.

The sync worker runs every 15 minutes while the shop computer and Tally are available. It records a run receipt, source period, row counts, totals, checksum, and errors. A reconciliation failure blocks audience generation and outbound campaigns.

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

## Required staging tables

Prepare these in a separate migration before any live import:

- `tally_sync_runs`: start/end time, status, company fingerprint, source period, counts, totals, checksum, error
- `tally_ledgers`: stable Tally identifier, ledger name, parsed phone, address, source timestamps
- `tally_stock_items`: stable item identifier, item name, group, unit, quantity, rate, value
- `tally_vouchers`: voucher identifier/number, date, party, item, quantity, rate, taxable/gross value
- `tally_identity_map`: Tally ledger identifier to CRM contact, with review status and evidence

The current `customer_data_imports` tables remain the controlled historical-import path. They do not prove that live Tally sync is active.

## Rollout gates

1. **Identity:** confirm the exact company `SHALIMAR FASHIONS` and release 7.1.
2. **Local read:** read one closed month and compare invoice count and gross total with a Tally report.
3. **Private reachability:** connect the worker through the private network; never open port 9000 publicly.
4. **Staging:** load one closed month into staging only.
5. **Reconciliation:** invoice count and gross total must match Tally; otherwise stop.
6. **Identity review:** map phone/name collisions manually; the worker may not invent customers.
7. **CRM publish:** publish contacts only after the staging receipt is accepted. Keep consent unknown unless evidence is recorded.
8. **Broadcast preview:** only opted-in, non-suppressed contacts can enter an audience. Saved campaigns still require approval.
9. **Operations:** monitor last successful run, stale data age, error count, and reconciliation status.

## Shop-computer setup required

On the shop computer, staff must keep TallyPrime running with `SHALIMAR FASHIONS` loaded. In TallyPrime open **F1 Help → Settings → Connectivity → Client/Server Configuration** and confirm the HTTP/ODBC service and port 9000. Do not change the company, enable public access, or configure two-way branch synchronisation.

The next technical handoff is the private-network address of the shop computer and a worker host. No password or token is needed in chat.

## Broadcast boundary

The sync can update customer and sales data all day. It must not send WhatsApp messages automatically. Existing customer files have no marketing-consent evidence, so broadcasts remain disabled until consent is recorded and a campaign is separately approved.

## Acceptance evidence

- 3 consecutive successful 15-minute runs
- Closed-month invoice count and gross total reconciled to Tally
- No public exposure of port 9000
- Identity review queue visible for shared/missing phones
- CRM readback confirms imported row counts and source checksum
- Broadcast preview excludes unknown, opted-out, suppressed, and unresolved contacts

