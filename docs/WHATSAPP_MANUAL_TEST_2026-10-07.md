# Restricted WhatsApp inbox test — 7 October 2026

## Current result

The single approved real test **passed according to the user's readback**: the exact test sent from CRM arrived on the personal WhatsApp, and the user's OK reply appeared in CRM Inbox. No agent-triggered outgoing message was sent. An independent Meta message ID or status event was not inspected.

The temporary test allowance is now **closed**. All three test Secrets were removed from the production project and a fresh production build completed. Authenticated Vercel readback confirms deployment `dpl_HX79FNX6CbPV8ujMMycRfL4pLpnJ` is READY / PROMOTED, `crm.shalimarfashions.com` points to it, and its runtime/build environment-name lists contain no test keys. General live delivery remains dry-run / false; customer broadcasts and automations were not enabled.

Application source commit `1aebcbf` includes the fixed-text, one-attempt test and specific error explanations. Full suite: **100 files / 1,132 passing tests**; typecheck passed; full lint had 0 errors and 37 existing warnings, with no lint issues in the later changed files. Local Webpack and production Turbopack builds passed. See [deployment and test evidence](evidence/whatsapp-manual-test-deployment-2026-10-07.json).

The initial Vercel credential failed with HTTP 403. The user completed a fresh sign-in and authorized project access was verified. The approved test was first deployed as `dpl_7v7cqpr7psPy3b9mEy6zTSC16ndb`; its planned expiry was 09:51:10 UTC, but the test settings were removed after successful user readback rather than waiting for expiry. The personal recipient and credentials are omitted from repository records.

## Implementation

- `delivery-policy.ts`: optional server-only approval for one exact recipient, sender phone-number ID, and fixed message: `Shalimar Connect test — please reply OK.` An absent, malformed, expired, or more-than-one-hour-away expiry disables the exception. Ordinary live delivery still requires both existing global flags.
- `/api/whatsapp/send`: only the authenticated manual inbox route supplies the internal manual source marker. The public API and automated senders cannot request this through their JSON payloads.
- `send-message.ts`: resolves the account-owned conversation and saved WhatsApp configuration, verifies the exact sender/recipient, rejects suppression, and requires a provider-message ID on a customer message within the previous 24 hours. No phone-number variant retry is allowed for the test.
- `manual-test-claim.ts`: derives a stable UUID from the approval's sender, recipient and expiry. Inserting a `sending` row before the provider call reserves one attempt using the existing messages primary key. Concurrent or repeated requests cannot reserve that approval twice. A successful send updates that same row with Meta's message ID.
- `meta-api.ts`: independently checks the exact text, sender, recipient and expiry at the provider boundary. All other text, template, media and interactive delivery retains the existing global gate.
- `.env.example`: documents empty test settings; no real personal recipient or token is committed.
- `.vercelignore`: excludes local credentials, evidence documents/video and generated caches from deployment uploads. Application source and public assets remain included.

No database migration is needed. The reservation uses the existing message UUID primary key and `sending` status. The unit tests model that database uniqueness guarantee; a live database test has not been performed.

## Controlled activation and readback

1. Restore authorized access to the linked Vercel project and verify the production deployment/configuration. Keep `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED=false`.
2. Privately set `MESSAGING_TEST_RECIPIENT` to the single owner-approved personal number in international digits, `MESSAGING_TEST_PHONE_NUMBER_ID` to the live-verified sender ID, and `MESSAGING_TEST_EXPIRES_AT` to an explicit UTC expiry less than one hour away. Set the expiry only when ready to test; do not commit the personal number. Re-deploy with these settings.
3. Confirm the saved CRM phone/WABA pairing, credentials and registration. The user must provide CRM readback while the current browser restriction remains in effect. Prior user reports are recorded separately from independent inspection.
4. Ensure the recipient has sent a fresh TEST if the earlier inbound is over 24 hours old. Send only the exact approved reply once from that conversation.
5. Verify Meta's message ID, CRM saved status, delivered/read webhook evidence, and receipt on the personal phone. A successful HTTP response alone is not proof of delivery.
6. Remove the three test settings and re-deploy, or allow the fixed expiry to close the exception automatically. Keep global live approval off. Broadcast approval is a separate decision.

An approval permits **at most one provider attempt**, not guaranteed delivery. A timeout or failure after reservation retains the `sending` record and blocks automatic retry because Meta may already have accepted the message. Review the recipient and provider evidence before explicitly authorizing a new approval. Do not delete a reservation or rotate expiry merely to retry an uncertain send. Deleting the containing conversation also deletes its reservation under the existing schema and must not be used to reset this control.

## Validation

- Full Vitest suite: **100 files, 1,132 tests passed**.
- TypeScript: **passed**.
- ESLint: **0 errors, 37 existing warnings**, outside the changed files.
- Webpack production build: **passed** using the same dummy Supabase/encryption/Meta settings documented in CI. Existing middleware/Edge-runtime deprecation and dependency warnings remain. This is a local build check, not verification of production credentials or a deployment.
- Tests cover exact targets/text, missing and expired approval, suppressed recipients, stale/future/missing inbound evidence, database read/reservation failures, duplicate concurrent clicks, retained reservations after an uncertain provider failure, persistence of the mocked provider receipt, and the closed public/ordinary provider paths. All provider calls were mocked.
- `git diff --check`: passed.

## Remaining limitation

Production registration and messaging health were observed in Meta earlier today, and the user reported successful incoming CRM delivery. Deployment and domain routing are verified through Vercel. The user confirmed the outbound receipt and incoming OK reply. Independent CRM configuration and provider message/status readback, plus subscription GET after the successful POST, remain incomplete. No production-readiness claim is made.

## Follow-up: generic error during the owner's test

The user reported the original delivery-disabled message again, then confirmed the attempted text was **`crm test`**. That does not match the explicitly approved sentence. The restriction therefore rejects it before the provider call or attempt reservation; this is not evidence of a failed Meta delivery.

The shared send core now gives a specific explanation for mismatched text, unavailable/expired test approval, a saved sender mismatch, the wrong conversation, or suppression. The public API retains the general disabled message and none of the restrictions were relaxed. The user was given the exact approved sentence to copy, without quotation marks.

Regression validation after this change: full suite **100 files / 1,132 tests passed**, TypeScript passed, and lint for both changed files passed with no warnings or errors. Deployment of this clearer error copy is tracked in the deployment evidence JSON.
