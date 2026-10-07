# Campaign budget and approval database handoff — 7 October 2026

## Current status

The owner asked to complete campaign approval, consent checks and a **₹1,000/month** ceiling, then confirmed that the Shalimar Supabase SQL Editor is available and requested a prepared migration. Migration 050 and the exact SQL Editor installer are prepared and locally tested. **They have not been applied to production in this turn. The CRM delivery workers and approval interface are not yet connected to these new functions.** This is a database handoff, not a production-readiness claim.

The most recent owner readback confirms working Inbox replies, valid credentials and webhook subscription. That remains the latest authenticated evidence. This work does not alter that deployed Inbox path, provider credentials, the number registration, or Vercel settings. No real messages were sent.

## Apply this file

1. Open the **Shalimar** Supabase project → **SQL Editor** → **New query**, using the database `postgres` role.
2. Paste the **entire** contents of [`sql/SHALIMAR_RUN_THIS_050.sql`](sql/SHALIMAR_RUN_THIS_050.sql) and run it once. The file wraps the migration and account setup in one transaction.
3. Expect a result row showing `050 installed`, `monthly_limit_inr = 1000`, `managed_delivery = OFF`, and `rate_review = Required before activation`. A first installation should show `reserved_this_month_inr = 0`.
4. Share that result row, or the exact error if it fails. Do not share tokens, connection strings or passwords. Do not enable global messaging flags.

The installer matches only the existing saved Phone Number ID **1391671597361924** and WABA **28787952197487898**. Zero or multiple matches stop and roll back the transaction. A conflicting existing budget policy also stops without overwriting it. It neither creates a WhatsApp account nor reads or changes any token. Re-running a successful installation preserves recorded approvals and delivery attempts.

Canonical sources are `supabase/migrations/050_managed_messaging_budget.sql` and `supabase/setup/shalimar-budget-policy.sql`. Regenerate the copy-paste file with `node scripts/prepare-messaging-sql-editor.mjs`; do not independently edit the generated copy. The generic migration creates no account policy; the Shalimar setup selects the existing connection and seeds a disabled policy.

## Database controls added

- **Protected policy:** integer paise; ₹1,000 maximum, one shared ceiling for managed campaigns and automatic messages. Month boundaries use Asia/Kolkata. The seed has no enabled delivery and no unreviewed price assumption.
- **Protected approval:** signed-in owner/admin approval of a fingerprint containing saved content, audience/recipient parameters, templates, sender IDs and budget terms. Editing those terms makes a prior approval unusable. Demoting/removing the approver also blocks new claims. Approvals expire after 30 days and can be revoked.
- **Permanent attempt ledger:** the database derives the key from campaign/contact or automation run/step. Replacing a campaign recipient row cannot reset a previous claim. A duplicate request returns `claimed: false`; changing its payload hash is rejected. Historical attempted recipients require review.
- **Atomic spending reservation:** the claim locks the account policy row before reading accumulated reservations and inserting a new one. Both campaign and automation attempts draw from the same ledger. A failed/uncertain result retains its reservation. A month change does not reset duplicate protection.
- **Consent at claim time:** account ownership, global suppression, category/service opt-outs, documented opt-in for marketing/utility, and latest inbound STOP checks. Unknown consent, whitespace-only evidence, revoked consent and future dates are rejected. Non-template automation messages require a provider-backed customer message within the preceding 24 hours.
- **Constrained rollout:** only India mobile recipients; marketing and utility templates with locally synced `APPROVED` status and a Meta template ID; service automation steps supported within the window. Authentication templates and other countries are blocked until their pricing and requirements are separately reviewed.
- **Permissions:** account members can read their own policy/approval/ledger rows. Browser roles and the application's service role cannot directly insert, update, delete or truncate them. Approval RPCs use the authenticated actor; claim/result RPCs are service-role only. No mutable `broadcasts.approval_status` field is trusted as the authority.

## Required application integration before activation

The SQL claim is a trusted-server contract, not an HTTP sending endpoint. Keep `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED=false` throughout this work.

1. Replace browser-driven live campaign fan-out with preparation of saved campaign/recipient rows. Show the actual template, audience, exclusions and reservation estimate in the approval screen. Use the authenticated user's RPC client to approve that exact fingerprint after an explicit action. Do not automatically approve existing drafts or active workflows.
2. A server worker loads the saved account-owned source, builds the exact provider payload, hashes it, and calls `claim_messaging_delivery`. It must check `claimed === true` before issuing any provider request. It must not accept client-provided phones, rates, approval actors or operation keys. Bind a short-lived, single-use provider permit to the resulting payload and sender.
3. Persist the claim before provider I/O. Refresh consent/window immediately before dispatch if work was delayed. No alternate-number retries. Record Meta acceptance and `wamid` through `finish_messaging_delivery` and existing message/recipient records; provider acceptance does not prove delivery. If a network response or result write is uncertain, stop and retain the claim/reservation. Do not delete the ledger or invent a new operation key to retry.
4. Route campaign resume and automation steps through the same protocol. A workflow needs its own approval; preserve run/step identity on resume. Review trigger deduplication separately: creating a new run ID creates a different operation. AI, Flows and public API routes must remain blocked unless separately adapted.
5. Save a reviewed conservative reservation with source/date/expiry, then renew source approvals because policy terms are part of their fingerprints. Check live template/provider status before activation. Display reserved spend separately from actual Meta charges/prepaid balance.
6. After the owner supplies the database receipt, verify the live schema and authenticated CRM readback through the permitted workflow, deploy the completed integration, and inspect the actual production deployment. Only then enable the managed path. Approval of the spending ceiling is not approval to send a specific campaign.

## Pricing evidence and limitations

The [official WhatsApp pricing page](https://whatsappbusiness.com/products/platform-pricing/) was read on 7 October 2026. Its public calculator returned India/INR quotes of `0.8631` for Marketing, `0.115` for Utility, `0.115` for Service, and `2.4971` for Authentication International. The page prose describes service-window replies as free while the calculator returns a Service quote; this discrepancy is not resolved here. Public endpoint: `https://whatsappbusiness.com/wp-json/wab/v1/pricing`, with the market/currency/category selectors published by that page. No private account data or token was used.

No quote is seeded automatically. Reservations are a conservative application spending allowance, not a Meta invoice total. Provider price changes, taxes, delivery dates crossing a month boundary, other senders/tools and manual Inbox use are outside this ledger unless explicitly incorporated. Avoid promising that this alone caps every charge on the Meta account. Failed or unconfirmed attempts stay reserved, so the application can intentionally stop below the nominal monthly ceiling.

## Validation and evidence

- **24 database scenarios passed** (25 Node test results including the parent suite), executed in PGlite 0.5.8/PostgreSQL with actual prerequisite repository migrations. Tests use only synthetic accounts/contacts and no network delivery. They cover permissions/tenant isolation, approval changes, consent/STOP, service windows, retained uncertain claims, repeat attempts, shared limits, month rollover, template/country restrictions, migration replay and the exact SQL Editor bundle.
- The exact generated bundle was executed twice successfully against an isolated matching fixture. The wrong-sender case rolled back. The ambiguous legacy-schema case was rejected. Existing token placeholder and contacts were preserved.
- **1,156 application tests / 102 files passed**. Typecheck passed. Lint: **0 errors, 37 existing warnings**. Local production Webpack build passed with placeholder credentials and live delivery disabled.
- The migration workflow now includes RPC execution tests in addition to clean Supabase schema replay. **GitHub CI was not executed in this turn.** PGlite is single-process; these tests do not constitute a multi-connection race/load test or a full hosted Supabase/PostgREST test. Production acceptance still needs those provider/schema readbacks and concurrent-worker verification before live activation.

## Rollback and preservation

The installer is additive and starts disabled. If the later managed rollout misbehaves, disable `messaging_budget_policies.enabled` for the confirmed account and keep global live flags off. Preserve the three new tables and all attempt records. Do not drop tables, delete claims or reset reservations to restore sending. Retain the currently working Inbox release until the managed integration passes its checks.
