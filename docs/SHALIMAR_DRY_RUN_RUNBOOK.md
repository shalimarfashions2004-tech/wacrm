# Shalimar Connect dry-run runbook

Updated: 2026-10-02
Branch: `feature/shalimar-connect-platform`  
Backend: Supabase  
Messaging provider: Meta WhatsApp Cloud API

This is the team handoff for the first safe end-to-end check. It explains what
each person does, what evidence proves it worked, and what must remain stopped.

## Current checkpoint

| Area | Status | Evidence or blocker | Owner |
|---|---|---|---|
| Code safety gate | Ready | `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED=false` are the safe defaults. | Developer |
| Consent and suppression code | Ready for database verification | Campaigns fail closed when migration 043 is unavailable or consent is missing. | Developer + compliance |
| Automated checks | Passed | Typecheck passed; lint exits cleanly; 96 Vitest files and 1,096 tests passed. Broadcast subset: 8 files and 65 tests covering audience parsing, consent/dry-run gates, idempotency, retry/resume and rate limits. | Tester |
| Meta business assets | Connected; test-number registration banner remains | Hosted Settings → WhatsApp validates the permanent token, confirms WABA `3105529616452879` is subscribed to the app, and reads phone `1228692947003388`. The Meta test number has no PIN, so CRM intentionally keeps local registration empty. Template sync succeeded. | Owner + developer |
| Supabase target project | Confirmed | Shalimar project `shalimar` (`houjlpiyafcanxsabmsk`) is healthy; Vercel Production and Preview have the project URL and protected keys. Schema migration remains pending. | Owner + developer |
| Shalimar test user | Invitation sent | `shalimarfashions2004@gmail.com` appears in Supabase Auth Users; complete the invitation from the Shalimar mailbox before dashboard acceptance testing. | Owner + tester |
| Migration 043 | Ready to replay, not applied | Must be tested on a disposable Supabase project before the intended project. | Developer + database owner |
| Real message sending | Stopped | The approved single-recipient live attempt was rejected by Meta because the recipient was not on the allowed list. Production remains `dry-run`; the current broadcast test was saved as Draft and no broadcast was sent. | Owner |

“Ready” in this table means the work can proceed to its verification step. It
does not mean production messaging is enabled.

## Team roles

| Role | Responsibility | Must not do |
|---|---|---|
| Owner | Log in to Meta, confirm the business assets, choose the Supabase project, supply secrets through the secret store, and give the final live-send approval. | Do not paste tokens into chat or Git. |
| Developer | Replay migration 043, keep the provider gate enabled, fix reversible defects, and record evidence. | Do not switch live mode or send a message. |
| Tester | Run the automated checks, database verification queries and dry-run campaign, then record pass/fail evidence. | Do not use a real recipient for the dry run. |
| Compliance reviewer | Confirm consent source, wording version, opt-out handling and approved template category. | Do not infer marketing consent from an import or previous purchase. |
| Operator | Review the audience, template, estimated cost and result report. | Do not approve a live campaign without the owner’s explicit sign-off. |

## Gate 1 — Meta readback

The owner logs in to Meta Business and records these values in the team’s
private handoff, never in Git:

1. Business Portfolio name and ID.
2. WhatsApp Business Account (WABA) name and ID.
3. Phone Number ID, display number and quality status.
4. Meta App name and ID.
5. The app is connected to the WABA and has the WhatsApp management and
   messaging permissions required for the intended test.
6. The webhook callback URL is the deployed HTTPS URL ending in
   `/api/whatsapp/webhook`, and the `messages` field is subscribed.

The developer then uses Settings → WhatsApp connection → **Test API
Connection** and records the result. A pass requires the phone metadata check,
WABA ownership check and WABA subscription check to succeed.

The current readback passes the token, WABA ownership and subscription checks.
The test phone still shows a separate “Not registered” banner because Meta's
test number has no two-step PIN; this is expected for the test flow and is not
a reason to paste a fake PIN. A production number needs its real 6-digit PIN
before relying on registration-dependent behavior.

## Gate 2 — Supabase migration replay

Use a disposable Supabase project first. Do not run this against the intended
project until the disposable check passes.

Migration 043 must prove all of the following:

- `contact_consents` exists with account-scoped RLS.
- `contacts.suppressed_at` and `contacts.suppression_reason` exist.
- Broadcast recipient idempotency and provider/cost fields exist.
- Broadcast delivery mode, approval status, provider and budget fields exist.
- The unique idempotency index exists.
- The broadcast creation function creates one stable key per broadcast/contact
  pair and does not duplicate rows on a retry.

The database owner records the migration version and the results of the schema
checks. If the migration cannot be replayed locally because no Supabase
project is available, record that as **pending verification**; do not claim it
passed based only on reading the SQL file.

## Gate 3 — Safe environment setup

Configure secrets only in the local/deployment secret store:

```text
NEXT_PUBLIC_SUPABASE_URL=<intended project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public project key>
SUPABASE_SERVICE_ROLE_KEY=<server-only key>
ENCRYPTION_KEY=<32-byte hex key>
META_APP_SECRET=<Meta app secret>
MESSAGING_DELIVERY_MODE=dry-run
MESSAGING_LIVE_APPROVED=false
MESSAGING_PROVIDER=meta-cloud
DEFAULT_COUNTRY_CODE=91
```

The two delivery settings must stay exactly as shown for the dry run. The
service-role key and Meta secret must never appear in a browser bundle, issue,
commit or chat message.

## Gate 4 — Consent and dry-run campaign

Before the campaign is planned:

1. Import a small staging audience only.
2. Record the source, wording version, channel, category and date for each
   consent record.
3. Keep missing consent as `unknown`.
4. Add a suppression record for any opt-out or complaint.
5. Review the audience preview contact by contact.

Run a dry-run campaign using an approved template. The expected result is:

- the campaign shows how many contacts were eligible and suppressed;
- missing marketing consent is excluded;
- no request reaches Meta’s send endpoint;
- each recipient has a stable idempotency key;
- a second attempt does not create a duplicate recipient row;
- the campaign result is auditable in Supabase.

The automated dry-run provider and broadcast logic pass locally. The hosted
wizard has now been exercised safely: Meta templates synced, `hello_world` was
selected with an All Contacts audience estimated at 2, and the campaign was
saved as `Shalimar dry-run broadcast test 2026-10-02` with status **Draft**.
No send action was taken. The synced templates are Meta/Jasper's Market sample
templates, so the draft is test evidence only and must not be sent to
customers. The audited campaign remains pending until migration 043, consent
rows and a Shalimar-approved template are verified in the intended Supabase
project.

If migration 043 is missing, the campaign must stop with the migration error.
That is a safe failure, not a test failure to work around.

## Gate 5 — One real test (only after explicit approval)

This gate is intentionally separate from the dry run. The owner must approve a
single named test recipient and a specific template after Gates 1–4 pass. The
team then records sent, delivered, read, failed and opt-out webhook evidence.

Live mode requires both settings:

```text
MESSAGING_DELIVERY_MODE=live
MESSAGING_LIVE_APPROVED=true
```

After the test, return the settings to dry-run unless the owner has approved a
specific pilot. Never leave live mode enabled as a convenience default.

## Evidence record

For each gate, record only the minimum evidence needed:

| Field | Example |
|---|---|
| Date/time | `2026-10-01T12:00:00Z` |
| Gate | `Supabase migration replay` |
| Owner | Person responsible for the result |
| Environment | `disposable Supabase project` or `local dry-run` |
| Result | `pass`, `fail`, or `pending verification` |
| Evidence | Screenshot, query output, test run or Meta readback reference kept privately |
| Next action | One concrete fix or approval needed |

| Date/time | Gate | Owner | Environment | Result | Evidence | Next action |
|---|---|---|---|---|---|---|
| 2026-10-02T15:00:00Z | Hosted broadcast wizard dry-run setup | QA + operations | hosted Shalimar CRM | pass (draft only) | Meta templates synced; `hello_world` + All Contacts estimated 2; draft `Shalimar dry-run broadcast test 2026-10-02` saved; no external send | Verify migration 043 and consent, then replace sample template with Shalimar-approved copy |

Do not attach tokens, phonebooks, customer exports or private customer
messages to the repository issue or chat.

## Stop conditions

### Credential paste mistakes (2026-10-02)

An access token belongs in **Permanent Access Token**. The **WhatsApp Business
Account ID** field accepts only the numeric WABA ID. If an error mentions
`ByteString` and a character such as an arrow, the token input contains copied
instructions or another invalid character; it is not evidence of a network
outage. Re-copy only the token from Meta, replace the whole token field, save,
and then test the saved connection. Keep all credentials out of chat and Git.

The client and configuration API reject malformed bearer-token input. The phone
verification helper also rejects it before making a network request, including
when checking previously saved credentials. The error identifies the token
field without echoing its contents. Verification: 96 test files / 1,096 tests,
typecheck and changed-file lint passed. Hosted credential validity still needs
an actual successful Meta connection result; local tests do not establish it.

Meta readback evidence on 2026-10-02 confirms the Shalimar test WABA and phone
IDs in Business Settings (`3105529616452879` and `1228692947003388`). The new
permanent token now validates in CRM and the WABA is subscribed to the app.
The Meta test number has no two-step PIN, so CRM intentionally leaves local
`registered_at` empty and shows a separate “Not registered” banner. For a
production number, configure its 6-digit PIN and save it before relying on
inbound webhook delivery. Do not paste tokens into chat.

Stop and report the issue if any of these occurs:

- Meta assets cannot be read back or the phone is under a different WABA.
- The webhook signature, verify token or HTTPS callback is not confirmed.
- Migration 043 fails, RLS is unverified, or the intended Supabase project is
  uncertain.
- A contact has no consent evidence for a marketing template.
- A suppressed contact appears in the eligible audience.
- A retry would create a second idempotency key for the same broadcast/contact.
- Any code path attempts a live send while either delivery setting is not
  explicitly approved.

## Handoff after the dry run

When all dry-run gates pass, update `docs/SHALIMAR_EXECUTION_PLAN.md` with the
evidence references and move only the verified items to complete. Keep live
mode disabled until the owner signs the one-recipient test approval.
