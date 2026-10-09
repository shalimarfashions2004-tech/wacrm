# Shalimar customer import and image broadcast setup

Status: implementation and private import preparation. Production database import, current Meta template approval and image delivery require separate evidence.

## What changed

Contacts → Customer Data now has an authenticated, account-scoped CSV preview/import, 100-row paginated search, phone/identity review queue, safe Contacts linking, and per-customer language and explicit permission evidence. Repeated imports use a source hash; publishing again creates no duplicate Contacts. Existing names must match, including legacy ten-digit number matches. Conflicting identities and shared numbers are held; no existing names, numbers or global opt-outs are overwritten.

Historical purchase records stay in separate tables. Consent columns cannot be imported from sales files. Staff enter language and dated permission evidence separately. Recording opt-in does not remove global suppression; older evidence cannot replace a newer permission event. Viewers can read status without access to the underlying permission evidence. Administrators perform imports, Contacts linking and reviews.

Customer-data broadcast audiences now resolve actual linked Contacts and show excluded counts/reasons, source window, source hash and purchase thresholds. English and Malayalam templates select only the corresponding reviewed language. Preparing a campaign freezes the import receipt and recipient IDs in the existing approval fingerprint; managed delivery rechecks current permission and opt-outs. A changed Contact identity or non-canonical existing number is excluded until reviewed. Product-specific audiences stay unavailable because complete reconciled item data is missing.

Image starter templates already available in Settings → Templates:

- `shalimar_store_introduction_en` — English marketing introduction.
- `shalimar_store_introduction_ml` — Malayalam marketing introduction.

Both include the image header, Ernakulam/Kochi store details, public shop/WhatsApp contact, a call button and STOP instructions. Selecting a starter opens the review form. A starter or local payload test does not establish live Meta approval or delivery.

## Private source receipt

The reviewed customer CSV and quality reports are saved in the private Shalimar working folder `CRM_Import_2026-10-08`, outside this public repository. Never commit or publicly share these files.

| Check | Observed result |
| --- | --- |
| Customer rows | 2,353 |
| Invoice rows | 8,087 |
| Historical source window | 1 April 2024–23 May 2026 |
| Single, usable, unshared India mobile rows | 1,968 |
| Missing phone rows | 70 |
| Ambiguous multi-phone rows | 55 |
| Shared normalized phone rows | 259 |
| Confirmed internal outlet rows | 1 |
| Total review rows | 385 |
| Per-buyer invoice counts / purchase totals | Reconciled to the current invoice CSV |
| Customer-master amounts recalculated | 7 differences above INR 0.01 |
| Language / marketing permission from sources | Unknown |
| WhatsApp-account lookup | Not performed |
| Tally identity check | Verified: SHALIMAR FASHIONS, TallyPrime 7.1, local port 9000 |
| Live Tally sync | Not connected |
| Production CRM import | Not yet verified |
| Customer messages sent during this setup | 0 |

Counts refer to customer rows, not verified WhatsApp accounts, current phone ownership or independent live Tally controls. The date window does not establish a complete three-year history. The original source files are unchanged. The exact prepared CSV also passed the same parser used by the CRM API with matching counts.

## Owner steps

1. The read-only Tally check has passed for **SHALIMAR FASHIONS** in **TallyPrime Gold 7.1** on local port 9000. It only verified the local company identity; it did not connect CRM, upload customer data or activate broadcasts.
2. In the **Shalimar** Supabase SQL Editor, run the entire `docs/sql/SHALIMAR_RUN_THIS_052.sql` in a new query. The bundle checks the expected existing sender/policy and rolls back in a different database. It installs tables/functions only; it inserts no customers, enables no delivery, and does not alter credentials or the INR 1,000 policy. Keep the result row as the schema receipt.
3. Open CRM → Contacts → Customer Data. Select the private `SHALIMAR_CUSTOMER_DATA_REVIEWED_2026-10-08.csv`, check counts/source dates and choose **Save reviewed data privately**. Keep the returned source window and count as import evidence.
4. Choose **Add / link reviewed Contacts**. Record created, linked and conflict counts, then refresh and check a few records. No message is sent. Resolve phone conflicts in the source and upload a newly reviewed version; never guess the first number from a multi-number cell.
5. Record each customer’s actual preferred language and independent WhatsApp marketing permission in **Review**. A purchase, stored number, tag, invoice or staff assumption is not opt-in. Permission records require source, observed date, exact wording and evidence/reference. Existing opt-outs remain blocked.
6. In Settings → Templates, review the English/Malayalam introductions, confirm the store contact/address/image, submit if absent and sync Meta status. Avoid creating a second copy of an existing approved name/language. Capture exact Meta template status/content/media readback.
7. Build separate English and Malayalam customer-data campaigns. Start with **All reviewed customers with permission** for the general introduction. Check the actual eligible contacts and exclusions. Save and review the exact campaign before approving its managed delivery. Obtain separate approval for a controlled image delivery test; do not reuse expired personal-test authorization.

The shared INR 1,000 calendar-month managed reservation policy and live delivery flags are unchanged. INR 2 per attempt is a conservative reservation, not Meta’s actual invoice. Failed/uncertain attempts are not automatically retried. Importing or preparing a draft grants no sending approval.

## Validation and deployment boundaries

- 115 Vitest files / 1,323 tests passed, including CSV boundaries and customer API authorization/input regressions.
- 22 customer-data PostgreSQL test results passed with isolated synthetic data. Actual prerequisite migrations replayed, RPCs executed, cross-account and role denials checked, 1,505 rows tested without truncation, and the whole SQL Editor bundle replayed twice after a wrong-database rollback test.
- Existing managed messaging PostgreSQL suite: 29 results passed.
- Five synthetic export-preparation checks passed: exact purchase totals/year boundary, invoice-count mismatch, duplicate vouchers, shared/internal exclusions and refusing output inside the public repository.
- Typecheck passed; lint: 0 errors / 36 existing warnings.
- Webpack production build passed with harmless local Supabase placeholders. Existing Next.js middleware/Edge warnings remain. This verifies compilation, not production configuration.
- Source parser read the actual private CSV; no private rows were added to the repository or logs.

Authenticated CRM browser inspection was rejected by automatic approval review earlier in this conversation. No cookies, private token extraction, service-role queries or alternate browser route were used to bypass that decision. Owner import/readback remains required. Live Meta approval/image rendering and Tally sales field compatibility remain unverified in this release.

## Release and rollback

Use the existing `shalimar-connect` Vercel project and canonical Shalimar GitHub remote. Publish only reviewed code and public assets. Never upload the private customer folder. A separate release receipt records the commit, deployment/provider status and public readback; this document alone does not establish deployment.

Until migration 052 is installed the new API returns an honest setup-required error; Inbox, existing Contacts and credential settings continue using their existing paths. Roll back to the previous known-good Vercel deployment if authentication, Inbox or template review regresses. Leave additive import tables intact to preserve any saved records. Disable managed delivery if any audience, opt-out, budget or uncertain-delivery guard fails; never delete customer history as a rollback shortcut.
