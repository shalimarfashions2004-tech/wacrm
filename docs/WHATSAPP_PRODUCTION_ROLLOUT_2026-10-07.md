# WhatsApp production rollout — 7 October 2026

## Evidence and scope

- Owner requests normal production operation following the completed two-way personal-number test (see `WHATSAPP_MANUAL_TEST_2026-10-07.md`). That temporary test approval is closed.
- Current sender: **+91 70253 20333**, Phone Number ID **1391671597361924**, WABA **28787952197487898**. These IDs were reconfirmed by the owner in CRM, with Meta showing registered.
- Latest owner-provided CRM readback: **“Number is fully wired — Meta is delivering events.”** This is user readback, not an independently inspected authenticated response in this release.
- Owner specified **1000 per month** in response to a spending-ceiling question. Interpreted as **INR 1,000/month for broadcasts**. This is a requested ceiling, not proof of enforcement, a prepaid balance, or approval to send a specific campaign. No daily ceiling has been confirmed.

## Changes in this release

1. Separate server-only Inbox reply approval, bound to the exact Phone Number ID and WABA. General delivery remains `dry-run` / unapproved, so public API sends, campaigns, AI and flow sends remain blocked.
2. The authenticated agent Inbox can send text, images, video, documents, audio, buttons and lists after checking the account-owned contact, suppression, service opt-out records and a provider-backed customer message strictly within the last 24 hours. Template sends do not use this allowance.
3. Missing safety columns/tables, query errors, a mismatched sender and an expired window all prevent sending. A latest STOP message also blocks sending if suppression persistence failed.
4. The provider boundary requires a short-lived in-process capability tied to the checked sender and recipient. A copied JSON object cannot create that capability. Production replies do not try alternate phone numbers.
5. A message row is saved before delivery. Provider calls time out after 15 seconds; an uncertain attempt remains recorded and the user is told to reconcile before retrying. Ordinary replies are not guaranteed exactly-once across separate user requests; they do not automatically retry.
6. Settings → WhatsApp reports the Inbox delivery setting and checks safety-table availability without returning customer rows. The per-contact checks still run on every reply.
7. The legacy dashboard bulk-send endpoint no longer accepts live phone-list fan-out, even if global flags are changed. Dry-run simulations remain available and labelled. Its previous live path had no server-side consent check, budget reservation or durable claim.

## Validation

- 102 test files / **1,156 tests passed**.
- Typecheck passed.
- Lint: **0 errors, 37 existing warnings**.
- Local production Webpack build passed with non-production placeholder credentials; not deployed as a prebuilt artifact.
- No real messages sent by the agent in this release.
- See `evidence/whatsapp-inbox-production-deployment-2026-10-07.json` for deployment/readback results when available.

## Remaining gates — do not mark the whole CRM production-ready

- Obtain the fresh production Settings Inbox status and confirm a normal user-initiated reply after this release. The previous test proves the connection, not every newly added branch.
- Live safety-schema availability and authenticated behaviour must be confirmed. No migration was applied in this release. Missing migration 043 makes replies fail closed.
- Campaigns still require durable server-side approval and budget reservations, an approved price basis/rate source, recipient claims and uncertain-outcome reconciliation, fresh consent checks during dispatch, approved/synced templates, and a named campaign/audience approval. INR 1,000 is **not yet an enforced budget**.
- API and resume broadcast paths remain behind the disabled global gate. Do not activate those flags until the managed campaign delivery path is complete and database/provider checks pass.
- WhatsApp wordmark upload and any official badge approval are separate, incomplete tasks. No badge is promised.

## Rollback

Set `MESSAGING_INBOX_REPLIES_APPROVED=false` in production and redeploy. Keep `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED=false`. Retain message rows and Meta receipts for reconciliation; do not delete attempts after a timeout. Previous stable deployment: `dpl_HX79FNX6CbPV8ujMMycRfL4pLpnJ` (temporary test already closed).

The 24-hour reply rule was checked against the current official WhatsApp policy/pricing pages on 7 October 2026: https://whatsappbusiness.com/policy/ and https://whatsappbusiness.com/products/platform-pricing/. This release does not calculate provider charges or guarantee a free rate.
