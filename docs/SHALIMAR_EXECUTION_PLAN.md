# Shalimar Connect Execution Plan

Updated: 2026-10-01
Repository branch: `feature/shalimar-connect-platform`
Backend decision: Supabase is the Shalimar backend. Firebase belongs to a different dashboard and is out of scope.

Project board: [PROJECT_STATUS.md](./PROJECT_STATUS.md) — owners, acceptance checks, risks and immediate actions.

## Plain-English goal

Give Shalimar one safe workspace for contacts, WhatsApp conversations, broadcasts, consent, follow-up work and later AI assistance.

A message must never be sent just because a phone number exists. It must pass the consent, template, budget, approval and delivery checks.

## Why this order

1. Protect people and the business first.
2. Make the database trustworthy before importing or messaging contacts.
3. Connect Meta and verify the webhook before enabling outbound messages.
4. Test with a small approved group.
5. Only then consider live campaigns, automation and AI assistance.

## Phase 0 — Safety baseline (complete)

- [x] Locate and inspect the existing WhatsApp CRM repository.
- [x] Create the Shalimar feature branch.
- [x] Add the consent and suppression migration.
- [x] Add dry-run provider and outbound approval gate.
- [x] Add recipient idempotency keys.
- [x] Add documentation and environment examples.
- [x] Pass tests, typecheck and Webpack production build.

Exit condition: code is committed and live sending remains disabled by default.

## Phase 1 — Accounts and database (next)

Purpose: connect the right Meta business assets and prepare the real database without sending messages.

- [x] Read back the Meta Business Portfolio and identify the production WABA (`1686023546421842`) and number (`+91 70256 48555`).
- [ ] Complete Meta phone verification/coexistence onboarding; the number is currently shown as **Unverified** because it is already used by the WhatsApp Business app.
- [ ] Confirm the Meta app has the required WhatsApp permissions and webhook settings.
- [x] Select the intended Supabase project for Shalimar (`shalimar`, ref `houjlpiyafcanxsabmsk`).
- [ ] Apply migration 043 first to a disposable Supabase project.
- [ ] Verify consent tables, suppression fields, idempotency index and row-level security.
- [ ] Apply the migration to the intended project after the disposable check.
- [x] Store the Supabase URL and keys only in the Vercel deployment secret store; keep Meta/encryption placeholders until the owner supplies the correct production values.

Exit condition: Meta connection is readback-verified and Supabase migration 043 is applied and verified.

## Phase 2 — Contact and consent readiness

Purpose: ensure imported customers can be contacted lawfully and correctly.

- [ ] Decide the source file/system for Shalimar contacts.
- [ ] Normalize Indian phone numbers to international format.
- [ ] Import contacts into a staging area first.
- [ ] Record consent source, wording version, date and channel.
- [ ] Mark missing consent as unknown; do not treat imports or purchases as marketing consent.
- [ ] Add hard suppression for opt-outs and complaints.
- [ ] Review a sample of imported contacts before any campaign.

Exit condition: an approved audience can be explained contact by contact.

## Phase 3 — Messaging verification

Purpose: prove messages can travel safely in both directions.

- [x] Keep the existing provider boundary and dry-run gate in place.
- [ ] Configure the production WABA through the correct Meta flow. Standard “Add phone number” registration must not be repeated for the app-linked number; use Embedded Signup coexistence through an eligible Tech Provider/Solution Partner.
- [ ] Verify webhook signature and inbound message readback.
- [ ] Use the dry-run provider to verify campaign planning and idempotency.
- [ ] Use one approved test recipient for a real Meta test only after explicit approval.
- [ ] Confirm sent, delivered, read, failed and opt-out events update the CRM.
- [ ] Confirm duplicate retries do not create duplicate sends.

Exit condition: one test conversation works end to end and can be audited.

## Phase 4 — CRM and campaign workflow

Purpose: give staff a simple daily operating flow.

- [ ] Contacts and tags.
- [ ] Shared inbox and assignment.
- [ ] Consent and suppression review.
- [ ] Template selection and audience preview.
- [ ] Campaign cost estimate and budget check.
- [ ] Queue, retry and idempotency handling.
- [ ] Campaign result and failure report.

Exit condition: a staff member can import, review, approve, send and audit one small campaign.

## Phase 5 — AI assistance (after messaging is stable)

Purpose: reduce staff effort while keeping humans responsible.

- [ ] Keep AI replies as drafts until approved by a staff member.
- [ ] Ground answers in approved Shalimar content.
- [ ] Add clear limits for pricing, stock, refunds and promises.
- [ ] Document and test order extraction before enabling it.
- [ ] Log AI inputs, outputs, approvals and corrections.

Exit condition: AI can assist without making unapproved customer or financial commitments.

## Phase 6 — Launch and operations

- [ ] Review dependency vulnerabilities.
- [ ] Complete security and privacy review.
- [ ] Configure backups, monitoring and incident contacts.
- [ ] Run a small pilot with a named owner.
- [ ] Review delivery, opt-out, cost and failure metrics.
- [ ] Expand audience only after the pilot passes.

Exit condition: the owner signs off the launch checklist and live mode is deliberately enabled.

## Current launch rules

- Keep `MESSAGING_DELIVERY_MODE=dry-run`.
- Keep `MESSAGING_LIVE_APPROVED=false`.
- Do not send to imported contacts without recorded consent.
- Do not use production credentials in this repository or chat.
- Do not run destructive migrations.
- Do not create provider spending commitments without owner approval.
