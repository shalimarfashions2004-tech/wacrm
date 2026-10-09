# Shalimar TallyPrime export checklist

## Recommended format

Use **Excel Spreadsheet (`.xlsx`)** for the first export. It is readable, can be checked by the shop team, and supports item-wise and party-wise pivot tables. TallyPrime also supports XML and JSON, but those are better for a later machine import after the actual fields have been reconciled. Do not use PDF as the source for customer or product data; keep PDF only as a human control copy if needed.

Keep every file in a private folder on the shop computer, for example:

`C:\Users\SHALIMAR\Documents\SHALIMAR_TALLY_EXPORT_2026-10-09\`

Do not save exports in the public CRM repository, the public Downloads folder, or a shared link. Do not export licence numbers, passwords or PINs.

## First test: one closed month

Start with the most recent **fully closed month**, then repeat the same process for the full available period after the totals match. If a full-period export is too large, export one financial year at a time.

1. Open TallyPrime and confirm the company is **SHALIMAR FASHIONS**.
2. Set the period with **F2 (Period)** to the selected closed month.
3. Press **Alt+G**, search for **Sales Register**, and open it.
4. Select the month and press **Enter** to open its voucher register.
5. Press **F12 (Configure)** and enable the available inventory and party details, including inventory-wise extract, party name, voucher number/date, item, quantity, rate, discount, tax and amount. The exact labels can vary with the company configuration.
6. Press **Alt+E (Export)** → **Current** → **C (Configure)**.
7. Set **File Format** to **Excel (Spreadsheet)**, set the private folder above as the location, choose a clear file name such as `sales_register_YYYY-MM.xlsx`, and set **Export for Pivot Table** to **Yes** when the option is shown.
8. Press **Ctrl+A** to save the export settings, then **E (Export)**. Close Excel after checking that the file was created.

Tally’s Sales Register export can be used to create item-wise, party-wise, godown-wise and batch-wise pivot views. It only includes vouchers with inventory allocation when the pivot option is used, so note whether every sales voucher has inventory lines.

## Exports needed for the complete business picture

Repeat the same **Alt+E → Current → Excel** process for each report below. Use the same date range and keep the original files unchanged.

| Purpose | TallyPrime report/export | Important fields or settings |
| --- | --- | --- |
| Customer purchase history | Sales Register, voucher register | Party, phone/address if shown, voucher date/type/number, item, quantity, rate, discount, tax, total |
| Best-selling products | Sales Register with inventory-wise extract and Pivot Table | Row: Stock Item; values: quantity and net sales; filters: period, voucher type, group/brand |
| Best customers | Sales Register with Pivot Table | Row: Party; values: invoice count, net sales and quantity; keep shared-phone customers flagged for review |
| Purchase frequency and recency | Sales Register voucher-level file | Preserve unique voucher number and date; CRM calculates first purchase, last purchase, order count and average order value |
| Returns and corrections | Day Book or the company’s Credit Note/Debit Note register | Include voucher type, original reference if present, party, item, quantity and amount |
| Margin and stock context | Purchase Register and Stock Summary | Item, quantity, purchase value/cost, closing quantity, valuation method and period |
| Customer and product master data | **Alt+E → Masters** | Export Accounting Masters and Inventory Masters separately; include dependent masters when offered |
| Financial control totals | Sales Register, Stock Summary and Profit & Loss | Keep a control copy for the same period; do not replace the voucher-level files with it |

For customer and product masters, use **Excel** for review. For a later engineering connector, an additional **XML or JSON** transaction export can be prepared after the one-month Excel totals reconcile; that file must remain private.

## What the CRM will calculate

From the reconciled files, CRM can calculate:

- total spend and net spend after returns;
- number of purchases and average order value;
- first purchase, last purchase and recency;
- high-value, low-value, frequent and lapsed customers;
- best-selling products by quantity and sales value;
- customer-to-product patterns and category interest;
- three-year coverage, with missing periods shown honestly.

The CRM will keep customer identity, invoices, product lines and WhatsApp permission as separate records. Language and marketing permission are **not** inferred from a purchase, a phone number or a Tally ledger. Shared, missing or ambiguous phone numbers stay in review.

## Control check before any import

Before sending any file to CRM, compare the exported Sales Register with Tally’s on-screen report for the same period:

1. invoice/voucher count;
2. gross sales total;
3. tax total;
4. returns/credit-note total;
5. net sales total;
6. quantity for the largest-selling items.

If any total differs, stop and keep the files private until the voucher types, cancellations, amendments, opening balances and inventory allocation are mapped. This export is read-only and does not connect Tally to CRM.

## After the control check

The next CRM steps are:

1. verify Supabase migration 052 and its result row;
2. import the private customer file in review mode;
3. resolve duplicate, shared and missing phone numbers;
4. add independently recorded language and WhatsApp marketing permission;
5. build English and Malayalam audiences from permitted contacts;
6. preview the image template and estimated Meta cost;
7. keep delivery disabled until the owner approves one specific campaign and one controlled test.

The ₹1,000 monthly managed limit remains a ceiling. It is not permission to send a campaign.

Official references: [Export Data in TallyPrime](https://help.tallysolutions.com/data-management/export-data-in-tally/), [Sales Register](https://help.tallysolutions.com/how-to-work-with-sales-register-in-tallyprime/) and [Sales Register Pivot Table export](https://help.tallysolutions.com/extracting-data-through-pivot-table-tally/).
