# Managed WhatsApp runtime and cost reporting — 8 October 2026

## Scope and acceptance

The owner asked to complete protected broadcasts/workflows, image introductions in English and Malayalam, store contacts, costing inside CRM, and a customer-data/AI plan. Implemented acceptance criteria: prepare saved recipients without sending; review saved content and audience; admin-only approval; live sender/template read-only checks; permanent attempt before one POST; shared budget/consent checks; retained uncertain results; source-bound workflow runs; usable cost estimates and error states. No real message was sent by the agent.

## Changes

- Migration **051** adds a matching snapshot/hash read API, exact budget aggregates, guarded admin enable/pause and immutable workflow-run fingerprints. It preserves the installed 050 policy. The SQL Editor installer is additive, transactional, sender-specific and replay-safe. It does not enable sending.
- New managed settings and source routes enforce authenticated roles and tenant IDs. Server rates and approval actors cannot be supplied by callers. The provider verifies the saved phone/WABA/app subscription and template name/language/category/body/header/footer/buttons. Quality RED and read failures block delivery.
- Read-only Meta checks remain available while delivery permission is off; enabling still requires the server permission. The hosting configuration now includes the intended SF Meta app ID and explicitly keeps managed permission false.
- Campaign preparation resolves paginated Contacts, tags, custom fields and consent; inserts saved recipient parameters in batches; validates the exact saved count. No browser fan-out occurs. Approval includes image/text/footer/call buttons, samples, eligibility, exclusions and reservations. A bounded server pass can continue only unattempted recipients.
- The sole managed message path builds from the protected source, claims budget/operation identity, posts the same hashed wire string once, then records the receipt. Accepted, failed or uncertain operations cannot automatically retry. Failed/uncertain reservations are retained. Provider acceptance is not proof of recipient delivery.
- Workflow steps use source/run/step identity. An edited and reapproved workflow cannot silently replace a waiting run's original snapshot. Wait workflows are blocked from approval until `MESSAGING_WORKFLOW_SCHEDULER_VERIFIED=true` has independent live evidence. General API, Flows and AI auto-reply paths retain the disabled general-delivery flags.
- Added Shalimar English (`en`) and Malayalam (`ml`) image introduction starters, shop/CRM numbers, address, call button and STOP wording. Selection opens a review form; it does not create a Meta approval or send. Added an unmodified owner brand image and downloadable contact vCard. Image/file upload uses existing account storage and format/size limits.
- WhatsApp settings now explain actual Meta billing versus the ₹1,000 allowance / ₹2 reservation, and provide marketing and service reply calculators. AI usage now shows current-rate estimates from recorded input/output tokens, explicitly excludes unknown model rates and includes an editable INR planning assumption. Cost estimates are not invoices or provider balances; no AI-provider spending cap is implemented by these displays.
- AI usage reads are paginated with an explicit 10,000-row partial-window signal. Draft usage logging is awaited before returning to avoid loss at serverless shutdown. Logging remains best effort; embeddings, tests and calls outside CRM are excluded.
- Customer import/Tally, consent and AI draft acceptance are documented in `SHALIMAR_CUSTOMERS_BROADCAST_AI_PLAN_2026-10-08.md`; a small business knowledge starter is prepared for owner review.

## Configuration and staged activation

Keep `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED=false`.
Existing human Inbox approvals remain separate. Managed deployment permission starts false and does not affect manual Inbox replies.

1. **Owner receipt received on 8 October:** 051 installed, monthly limit ₹1,000, reserved ₹0, managed OFF, existing credentials and Inbox replies unchanged. This confirms the installer result reported by the owner; the agent has not independently queried the authenticated hosted database.
2. Verify hosted schema/permissions, current provider registration/subscription and concurrent-worker claims. PGlite's single connection does not prove hosted contention behavior. No PostgreSQL server/Docker runtime was available on this host for a multi-connection check.
3. Only after those checks, set the server-only `MESSAGING_MANAGED_DELIVERY_APPROVED=true` with the existing exact Inbox sender IDs. Owner reviews/enables the budget in CRM; each campaign/workflow still requires a separate explicit approval.
4. Create/review/submit introduction templates to Meta, sync their actual approval and check hosted asset retrieval. Require separate owner permission for one image test on the owner-controlled phone; verify recipient image, delivery and reply receipts. No such image test has been performed or approved here.
5. Waiting automation needs a configured scheduler and successful live drain receipt. AI auto-replies need separate budget and approval work. Do not activate them based on this rollout.

## Provider and badge evidence

Latest owner readback after token rotation: valid, subscribed, registered; fresh Inbox test arrived. Native Shalimar Chrome Meta read on 7 October showed the existing WABA 28787952197487898 and phone 1391671597361924 / +91 70253 20333 Connected, Shalimar Fashions display name Approved. “Official business account” described a blue checkmark but **Submit request was disabled**. No badge request, payment or new account was submitted. Display-name approval does not establish badge approval. Do not bypass Meta eligibility/confirmation.

## Pricing basis

Marketing India ₹0.8631 per delivered message from Meta's public calculator, checked 7 October. Service India ₹0.115 for paid service messages from that calculator, checked 8 October. Meta FAQ says first 1,000 service messages per phone/month free from October 2026; main pricing-page prose still says service replies free. Show the discrepancy; account invoices settle actual costs. Taxes are excluded from the estimates.

AI standard text rates checked 7 October: GPT-5.4 mini $0.75 input / $4.50 output per million tokens; Claude Haiku 4.5 $1 / $5. For 1,000 replies of 1,000 input + 200 output tokens, examples are $1.65 / $2 respectively. INR conversion defaults to an editable illustrative ₹90/US$, not a live exchange-rate claim. Full sources are in the customer/AI plan and linked in CRM.

## Validation

Final integrated checks: **109 files / 1,206 tests passed**, typecheck passed, lint **0 errors / 37 pre-existing warnings**, local production Webpack build passed with placeholder credentials and live sending disabled. New boundary coverage tests unauthorized callers, caller rate/actor overrides, stale approvals, missing consent/insufficient allowance, exact image payloads/remote template mismatch, permanent duplicate claims and retained uncertain results. Further regression tests cover read-only provider verification with sending off, refusal to enable through a disabled deployment, awaited AI usage accounting and preservation of older-schema non-messaging workflows. Isolated SQL test output: **29 passing results**, including actual prerequisite migration replay and both exact installers run twice.

The final checks include the draft-log await and progress-display corrections. A missing `handoff` field in the new draft test fixture was fixed before the successful typecheck and build. GitHub CI and authenticated production UI/save-readback were not executed by the agent. Earlier automatic approval review rejected authenticated CRM browser access; no extracted browser session or private database credential was used to bypass it. Owner CRM readback is still needed.

## Operational limitations and rollback

The budget caps managed reservations in this CRM, not manual Inbox use, AI-provider usage, taxes, external senders or the entire Meta invoice. Do not label it actual billed spend. Approved media should use controlled immutable URLs; replacing the bytes behind the same URL requires a new review. Generic external media URLs are not content-addressed by the current ledger, so their immutability is a remaining activation check.

Pause the protected budget through the admin API and switch managed deployment permission off if needed. Preserve ledger and approvals; never delete attempts or reset reservations to obtain retries. Retain the known-working Inbox path and previous Vercel deployment for rollback. Customer contacts, original documents and unrelated working files were preserved. No public GitHub push was made.

## Production release receipt

Committed source **3eec14eaee22410703f94b8362605273ce61f540** was deployed from an isolated archive containing committed files only. Vercel deployment **dpl_p65FZYWmYnDsSHz5ZpgCHNgJivxf** reported **READY**; a fresh provider API read confirmed its production target and the `crm.shalimarfashions.com` alias points to this exact deployment. Hosted Turbopack compilation and TypeScript completed successfully. No placeholder local build was promoted.

Public readback: `/login` 200; brand PNG 200 / image/png / 250,892 bytes, SHA-256 matching the committed source; vCard 200 / text/x-vcard / 331 bytes, matching the committed CRLF source. Unauthenticated managed settings, WhatsApp config and AI usage API calls each returned 401. These checks verify deployment, public asset retrieval and authentication boundaries; they do not prove authenticated screen rendering or Meta image delivery.

The owner has been asked to refresh WhatsApp settings and click **Check with Meta** for an authenticated, read-only provider receipt. Managed sending remains OFF, AI auto-replies remain unactivated, introduction templates still need Meta approval, and customer campaigns need separate owner review. Machine-readable sanitized evidence is in `docs/evidence/shalimar-managed-runtime-20261008.json`.
