# Shalimar Tally access handoff — 8 October 2026

## Owner-friendly implementation plan

**Tally → small bridge on the shop PC → CRM customer data → reviewed broadcast list.**

1. Tomorrow, open the correct company in TallyPrime Gold and note its exact company name and release from F1 Help. Gold identifies the licence/edition; it does not identify the release or the company.
2. Run the prepared local check on that PC, with the shop technician if necessary. It reads company identity only and uploads nothing. Review its short result with the owner.
3. Read one closed month’s sales and compare the numbers against Tally’s own report before building the import.
4. Connect reviewed customers and sales history to CRM. Show spending, purchase frequency, last purchase and source dates. Add three years only if those records are available.
5. Keep customer purchase history, language preference and WhatsApp marketing permission separate. Clean duplicate/shared/missing phone numbers before choosing recipients.
6. Review the English or Malayalam image template, verify Meta approval and one approved image delivery test, then approve a specific campaign with its audience and estimated cost. Preserve the ₹1,000/month managed allowance.

The kit is a first access check, not the complete sync connector. No remote-control account or unattended access has been set up. No source upload or customer message is authorized by a diagnostic success.

## Files prepared

- `public/downloads/SHALIMAR_TALLY_ACCESS_KIT.zip` — code, printable instructions and SHA-256 manifest only.
- `public/downloads/SHALIMAR_TALLY_START_HERE.html` — shop staff guide.
- `public/downloads/SHALIMAR_TALLY_CHECK.ps1` — Windows PowerShell 5.1 / PowerShell 7 compatible source; actual Windows/Tally execution still required.
- `src/components/customer-data/tally-access-setup.tsx` — preparation card on `/contacts/data-sheet`, with kit/template links and explicit waiting status. This is not persisted connection status.
- `docs/ADR_004_TALLY_READ_ONLY_SHOP_BRIDGE.md` — architecture decision and acceptance gates.

Regenerate the public kit after changing its two source files with `python3 scripts/tally/package-access-kit.py`. Do not add customer exports, credential files, local receipts or production settings to the ZIP or public repository.

## Existing message preparation

The two introduction starters already exist in `src/lib/whatsapp/shalimar-templates.ts`: `shalimar_store_introduction_en` (`en`) and `shalimar_store_introduction_ml` (`ml`). Both are Marketing image drafts, with store contacts, a call button and STOP wording. The image is `public/brand/shalimar-store-introduction.png`. On 8 October, the public image URL returned HTTP 200, `image/png`, Content-Length 250,892 bytes; the local image was visually inspected. Existing regression tests passed template validation, image-header payload construction and rejection of mismatched provider status/content/language using synthetic provider fixtures. This does not prove a Meta media fetch, approval of the exact names or image delivery to a recipient.

Current customer-data audience resolution continues to reject sends because real Tally data is not connected. Existing Contacts-based consent and managed-delivery controls are preserved. No new database migration is needed for this preparation card and local access check. The final import schema/upload endpoint must follow a verified source field map, tested migration and owner installation/readback.

## Evidence and blockers

Confirmed this session: repository `shalimarfashions2004-tech/wacrm`, branch `feature/shalimar-connect-platform`; owner uses TallyPrime Gold. The supplied About-screen readback shows TallyPrime release 7.1 (Latest), Gold edition, LAN connectivity enabled, and Client/Server with ODBC on local port 9000. The owner confirmed the exact Tally company name is `SHALIMAR FASHIONS`. Serial number, licence email, computer name and private LAN address are deliberately excluded from this document.

Not yet confirmed: one local read-only Export check from this computer, the Tally company identifier returned by that check, sales field mapping/reconciliation, current Meta template approval/image rendering and authenticated CRM import/save/readback. The local Tally service is shown on port 9000, but the prepared diagnostic still needs to run on the shop computer. No production change or remote-access grant was performed in this preparation.

Validation on 8 October: 27 PowerShell logic/security checks and 8 loopback HTTP fixture cases passed with an isolated official PowerShell 7.6.6 runtime. The runtime archive SHA-256 matched the official GitHub release digest. Tests covered exact company selection, escaped input, missing/ambiguous identity, Tally errors, unsafe XML, bounded responses and redirect rejection. The fixture server received one Export request per case; no CRM/Meta call or customer export occurred.

Repository checks: 113 test files / 1,281 tests passed; typecheck passed; lint had 0 errors and 36 pre-existing warnings; Webpack production build passed with non-production placeholder Supabase settings. The initial build without local Supabase settings failed on auth-page prerendering; the configured rerun verified compilation only. Existing Next.js middleware/Edge-runtime and Supabase Edge warnings remain. ZIP file allowlist and SHA-256 manifest were verified. Diff whitespace check passed.

These changes are local preparation, not a production deployment. No authenticated browser or database readback, Windows PowerShell 5.1 execution, live Tally field-map test or Meta image delivery was performed. Local fixtures prove bounded behavior against synthetic responses, not compatibility with the live Tally company.
