# Shalimar CRM customer data sheet plan

## Purpose

Add a customer data sheet inside the CRM that can later connect to the Shalimar Excel sales registers. The first release is read-only and aggregate-only. It must support customer history, purchase-value bands, lifecycle segments, data-quality review, and a controlled import path without changing live Contacts or WhatsApp delivery.

## Evidence checked

The source files were inspected from `/Users/nabeelca/Library/CloudStorage/OneDrive-Personal/Shalimar`:

- `02_Data_and_Analysis/working/customer_master_2026-09-07.csv`: 2,353 rows, with the data actually ending on 2026-05-23 even though the filename says 2026-09-07.
- `02_Data_and_Analysis/working/sales_master_invoices.csv`: 8,087 invoice rows from 2024-04-01 through 2026-05-23.
- `02_Data_and_Analysis/sources/kada/`: 26 monthly `Sales Register` workbooks covering April 2024 through May 2026.
- `02_Data_and_Analysis/working/monthly_sales_summary.csv`: 26 monthly summary rows.
- `02_Data_and_Analysis/working/reactivation_call_list_2026-09-07.csv`: 89 high-value inactive candidates for a later, consent-controlled workflow.
- `03_Sales_and_CRM/Shalimar_Reactivation_Call_Sheet_2026-09-07.xlsx`: a 102-row workbook containing an 89-customer call list plus a call script. It is operational follow-up material, not a customer master.
- `09_Reports/2026-09-07_Sales_Analysis_FY2024-26.md`: the prepared report that reconciles the 8,087 true invoices and documents the source limitations.

The Excel files are row-level sales registers. They are not a ready-made CRM customer master. The report identifies stacked report sections and an item-wise section inside the workbooks; naive reading can double- or triple-count sales. The parser must use the first monthly invoice section, exclude `Grand Total` rows, and reconcile each month to its Tally total.

## Current segmentation

The first page should expose these reviewed dimensions:

1. **Lifecycle:** Active core (164), Active light (204), Slipping (228), Lapsed 12m (937), and Dormant (820).
2. **Lifetime purchase value:** Under ₹10k, ₹10k–49,999, ₹50k–99,999, ₹1L–2.49L, ₹2.5L–4.99L, and ₹5L+.
3. **Recent purchase value:** the same bands applied to trailing 12-month gross.
4. **Observed tenure:** first order to the verified source as-of date.
5. **Customer type:** `GST SALES (B2B)` or `GST SALES (Unreg)`.
6. **Data quality and consent:** phone present/blank, multi-number review, duplicate review, and a separate consent state.

The prepared sales report also flags an internal outlet, Freedom Feel It. That relationship should be stored as a reviewed customer classification before using the customer sheet for third-party growth decisions.

## Product and customer intelligence

The dashboard should answer four practical questions from the same reviewed source:

- **What sells most?** Rank products by pieces, gross value, invoice count, customer count, and repeat-buyer count. Keep quantity rank and value rank separate because a low-price item can lead in pieces while a higher-value item leads in revenue.
- **Who buys most?** Rank customers by lifetime gross, trailing 12-month gross, order count, quantity, and active months. Show top customers only after duplicate and internal-outlet review.
- **Who is high or low value?** Use configurable lifetime and trailing 12-month spend bands. Store the band used for an audience snapshot so a later data refresh cannot silently change a saved broadcast.
- **Who buys frequently?** Calculate orders, active months, average order value, average days between orders, recency, repeat rate, and the number of different product categories purchased. Frequency needs an explicit time window; the default should be trailing 12 months.

The current report's product mix is useful for a first visual only: it contains 33 item names and does not reconcile to a single month. The item master has no reliable size, colour, design, or supplier code. Therefore the current page labels product figures as indicative. A Tally-connected item master is required before product-specific stock or broadcast decisions are treated as authoritative.

## Tally connection plan

The preferred production design is a small local Shalimar connector, installed on the Windows machine that runs TallyPrime. It reads Tally on the local network and sends only reviewed, incremental data to a secured CRM endpoint. Tally's local HTTP/XML interface is the compatibility baseline; native JSON can be used when the installed TallyPrime version supports it, and ODBC is a read-only extraction fallback for reporting and reconciliation. The Tally port must never be opened directly to the public internet.

The connector should support:

1. A manual **Sync now** action for staff.
2. A scheduled pull, initially every 15–60 minutes, with a daily reconciliation run.
3. Incremental pulls by voucher date, last modified time, or a Tally-supported cursor, with a durable checkpoint.
4. Read-only first release for customer masters, stock items, sales vouchers, quantities, gross/taxable value, voucher type, and stock balances when available.
5. An offline queue and retry when Tally or the internet is unavailable.
6. Idempotency using company, voucher type, voucher number, voucher date, and a source hash.
7. A sync receipt containing source company, source period, row counts, totals, last checkpoint, warnings, and reconciliation status.

The first connector must not write contacts, broadcast audiences, or WhatsApp messages back into Tally. Any future write-back needs a separate field map, approval, audit trail, and rollback procedure.

## Metrics to store

Use separate voucher, item, customer profile, and aggregate snapshot tables. Store raw source values beside normalized values so a correction can be traced.

Customer metrics:

- lifetime gross, trailing 12-month gross, last 30/90/365-day gross;
- invoice count, trailing 12-month invoice count, quantity, and active months;
- average order value, average days between orders, last order date, and recency days;
- first order date, observed tenure, three-year status, repeat-buyer flag, and category count;
- lifetime and recent spend bands, lifecycle segment, customer type, internal-outlet flag, and data-quality status.

Product metrics:

- item and category key, source item name, quantity, gross value, taxable value, invoice count, and customer count;
- first/last sale date, active selling months, average selling price, repeat-buyer count, and attach rate;
- Tally item code, size, colour, design, supplier, stock on hand, and stock as-of timestamp when the item master provides them.

## Broadcast customer-list builder

The builder should create a reviewable audience snapshot, not a live query that changes while a campaign is sending. Staff choose rules such as:

- high lifetime value and frequent recent orders;
- high-value customers who are slipping or lapsed;
- customers who bought a selected product or category;
- low-value one-time buyers who have not placed a second order;
- B2B or unregistered customer type;
- town, route, or territory;
- active in a chosen season, such as August or December;
- no order in 30, 60, 90, or 120 days.

Every audience preview should show eligible count, excluded count by reason, source as-of time, Tally sync receipt, consent coverage, duplicate count, estimated Meta cost, and the exact rule values. Save the audience snapshot and rule JSON with the broadcast so the recipient list is reproducible.

Mandatory exclusions:

- no phone or invalid phone;
- unresolved duplicate or multi-number match;
- suppressed contact or STOP/UNSUBSCRIBE history;
- missing WhatsApp marketing consent;
- internal outlet or unreviewed customer classification;
- already sent within the configured frequency cap;
- data rows from a failed or unreconciled Tally sync.

The send path remains: build → preview → dry run → owner approval → approved template check → small test cohort → scheduled delivery → webhook readback. Historical purchases can guide an audience, but they cannot create consent.

## Integration rollout

1. **Define the Tally source:** confirm TallyPrime edition/version, company name, Windows host, local-network access, and whether XML/HTTP or ODBC is permitted.
2. **Build the read-only connector:** implement local authentication, checkpointing, idempotency, retries, and sync receipts.
3. **Reconcile a closed period:** compare invoice count, gross, taxable value, quantity, voucher type, customer count, and top items against Tally for one month.
4. **Load customer and product snapshots:** keep raw source rows, normalized rows, and aggregate snapshots separate.
5. **Ship analytics:** add top products, top customers, value/frequency filters, recency cohorts, and customer detail evidence.
6. **Ship audience preview:** implement saved rules, exclusions, consent preflight, cost estimate, and an immutable recipient snapshot.
7. **Dry-run broadcasts:** verify that no provider request is sent and that exclusions are explainable.
8. **Owner-approved live test:** only after Meta, webhook, CRM readback, consent evidence, and cost controls pass.

## Acceptance tests

- Repeating a Tally sync produces no duplicate vouchers or items.
- A changed Tally voucher is versioned or corrected with an audit record; it never silently overwrites the source history.
- Product quantity rank and product revenue rank can differ and are both visible.
- A high-value customer with no consent is visible in analytics but excluded from a WhatsApp audience.
- An internal outlet is excluded from third-party customer rankings after classification.
- Audience previews show the same eligible IDs when rebuilt from the same saved snapshot.
- A failed or unreconciled Tally period cannot be used for a broadcast.
- A dry-run creates an auditable plan and sends zero provider messages.
- A live test requires explicit approval and remains limited to the approved cohort.

## Three-year rule

The current source window is April 2024 to May 2026. It contains 323 customers with at least 24 months observed and zero customers with 36 months of verified history. The page must therefore label the current result as **three-year history not verifiable from the available source window**. It must not call a 24-month customer a three-year customer.

When older source files become available, `three_year_status` can become `3_year_verified` only when the first order is at least 36 calendar months before the verified source as-of date and the source coverage is continuous enough for the agreed business rule. If “three years” means three selling seasons instead, that definition needs to be recorded separately.

## Proposed data contract

The core sales profile should live in a structured, account-scoped table such as `customer_sales_profiles` or `customer_data_snapshots`, rather than being spread across free-form contact custom fields.

Required fields:

- `source_customer_key`
- `buyer_name`
- `phone_raw`
- `phone_normalized`
- `place`
- `address`
- `first_order`
- `last_order`
- `observed_tenure_months`
- `three_year_status`
- `orders`
- `quantity`
- `lifetime_gross`
- `average_order`
- `gross_12m`
- `orders_12m`
- `lifetime_spend_band`
- `recent_spend_band`
- `lifecycle_segment`
- `customer_type`
- `source_as_of`
- `source_file`
- `data_quality_status`
- `consent_status`

Every imported row should retain source file and as-of metadata so the team can explain where a number came from and re-run the import after a corrected workbook arrives.

## Page design

The new Contacts → Customer data page should provide:

- aggregate summary cards for customers, invoice rows, source window, and verified three-year customers;
- lifecycle and purchase-value summaries;
- a future customer grid with search and filters for tenure, lifecycle, lifetime spend, recent spend, customer type, data quality, and consent;
- a customer detail drawer showing source fields, purchase history, matching evidence, and consent state;
- an Excel/CSV staging flow with preview, duplicate resolution, invalid-phone review, and a before/after diff;
- export of the reviewed staging set;
- an explicit read-only or not-connected state until the staging import is approved.

The current CRM slice implements the first connected handoff while keeping the
page separate from Contacts: **Build broadcast list** opens the broadcast
wizard with `source=customer-data`, the wizard stores a selected customer-data
rule with the draft, and the send action remains disabled until the Tally
source, consent preflight, and provider checks are verified. Customer-data
audiences do not invent a reach count and the sending hook rejects them until
the reviewed audience table exists.

## Safe connection flow

1. Upload a private Excel or CSV file to staging.
2. Parse each workbook, identify the `Sales Register` sheet, use only the monthly invoice section, and drop `Grand Total` rows.
3. Normalize dates, amounts, phones, buyer names, and customer type.
4. Show row counts, missing fields, duplicate candidates, source range, and reconciliation totals.
5. Resolve duplicate names, multi-number phones, and internal outlet classifications without overwriting the original source values.
6. Approve the staging snapshot.
7. Link a matched customer to an existing CRM contact only after the match is reviewable.
8. Keep historical sales separate from WhatsApp consent. Imported sales must never set marketing opt-in.
9. Keep outbound sending disabled until Meta account checks, webhook checks, CRM readback, and an explicit live-test approval are complete.

## Delivery phases

1. **Data contract and evidence:** freeze field definitions, source as-of date, three-year rule, and reconciliation checks.
2. **Read-only page:** ship the current aggregate snapshot and an honest not-connected state.
3. **Private staging import:** add the table, parser, duplicate review, and import audit record.
4. **CRM link:** match reviewed rows to Contacts and surface customer metrics in the detail view.
5. **Consent and messaging gates:** show eligibility, but require explicit consent and the existing delivery safeguards before any WhatsApp action.
6. **Verification:** run tests, typecheck, lint, build, staging readback, and a live provider readback before describing the integration as ready.

## Acceptance criteria

- The page shows the source window and does not claim three-year coverage before 36 months is evidenced.
- The page distinguishes aggregate snapshot data from connected CRM records.
- Stacked workbooks, item-wise sections, and `Grand Total` rows do not inflate invoice or customer totals.
- A staging import can be previewed and rejected without changing Contacts.
- A historical purchase never changes `consent_status`.
- Phone, duplicate, and internal-outlet issues remain visible until resolved.
- No customer PII is committed to the repository or exposed in public logs.
- Live WhatsApp sending remains disabled until provider and CRM readback checks pass and the owner approves a live test.
