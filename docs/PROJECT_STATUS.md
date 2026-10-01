# Shalimar Connect project status

Updated: 2026-10-01  
Branch: `feature/shalimar-connect-platform`  
Product owner: Shalimar owner (business approval)  
Project manager: Shalimar delivery lead  
Backend decision: Supabase is the Shalimar backend. Firebase belongs to a separate dashboard and is out of scope.

## What this project is doing

Shalimar Connect is being prepared as a safe workspace for customer contacts, consent, WhatsApp conversations, broadcasts, follow-ups and later AI assistance.

The operating rule is simple: **having a phone number is not enough to send a message**. A campaign must pass consent, suppression, template, budget, approval and delivery checks. Every phase must leave behind evidence that another team member can inspect.

This document is the working project board. The execution plan remains the detailed product sequence; the issue register remains the risk and defect record.

## Status at a glance

| Area | Status | Meaning | Evidence / next proof |
|---|---|---|---|
| Repository and branch | Complete | Existing CRM was inspected and Shalimar work is isolated on the feature branch. | Git history and [execution plan](./SHALIMAR_EXECUTION_PLAN.md) |
| Safety code | Complete | Dry-run default, separate live approval flag, consent filtering and recipient idempotency are implemented. | Tests, typecheck and production build passed |
| Project documentation | Complete | Architecture, deployment, issue, cost and execution records exist. | `docs/` |
| Meta connection | Partially verified | Shalimar Chrome session readback: portfolio `S&F` (`1134016885720209`), Test WABA (`1103682202588508`), test number `+1 555-150-8712` is Connected/High, S&F app (`1498212839029923`) is in development, WhatsApp use case is enabled and Configure Webhooks is complete. | Register phone, add payment for business-initiated messages, complete one approved test message |
| Supabase project and Auth configuration | Complete for authentication; schema pending | The `shalimar` project is selected, healthy, and connected to Vercel. Site URL and CRM/local redirect patterns are configured. | Apply and verify migration 043 before data workflows |
| Supabase migration 043 | Not yet verified | Must be replayed on a disposable project, then applied to the intended Shalimar project. | Migration replay evidence and RLS checks |
| CRM hosting and domain | Complete for the hosted shell | Vercel deployment is Ready, `crm.shalimarfashions.com` is Production with HTTPS, and `/login` plus `/signup` load without the previous fetch error. | Create a test account, then verify account-scoped dashboard reads |
| Contact import and consent evidence | Not started | We need an approved source file/system and contact-by-contact consent evidence. | Import preview and sign-off record |
| End-to-end test message | Not started | Meta shows the send-message step is still incomplete; no real message should be sent until Supabase and consent checks pass. | One approved test conversation |
| Live launch | Disabled | Live mode requires explicit business approval and both environment gates. | `MESSAGING_DELIVERY_MODE=live` + `MESSAGING_LIVE_APPROVED=true` |

## Roles and accountability

These are role assignments, not assumed people. The project manager should name a person for each role before the pilot.

| Role | Accountable for | Must sign or provide |
|---|---|---|
| Shalimar owner | Business decisions, audience, budget and live-send approval | Launch approval, budget limit and named test recipient |
| Project manager | Schedule, dependencies, decision log, issue register and handoffs | Updated status after each gate |
| Product / operations lead | Staff workflow, consent wording, templates, quiet hours and campaign rules | Approved operating procedure |
| Backend developer | Supabase migration, RLS, consent ledger, queue/idempotency and provider boundary | Migration/readback evidence and code review |
| Frontend developer | Contact review, campaign preview, suppression reasons, cost and approval screens | UI acceptance checklist |
| QA / test lead | Repeatable tests, dry-run, webhook readback, retry and regression checks | Test report with pass/fail evidence |
| Security / privacy reviewer | Secrets, least privilege, webhook HMAC, consent retention and audit trail | Security review and open-risk decision |
| Meta / messaging administrator | Business Portfolio, WABA, number, app permissions, templates and webhook | Meta readback screenshots/IDs or equivalent record |
| Release / operations owner | Deployment, backups, monitoring, rollback and incident contacts | Deployment record and rollback drill |
| AI reviewer (later phase) | Grounding, human approval, order extraction limits and correction logging | AI acceptance record |

No role is considered complete because a task was attempted. Completion requires the evidence listed in its acceptance check.

## Milestones and gates

### M0 — Safety baseline (complete)

**Owner:** Backend developer + QA/test lead  
**Purpose:** Prevent accidental outbound messaging while the project is being connected.

Delivered:

- Supabase is documented as the Shalimar source of truth.
- Migration 043 defines consent, suppression, cost/budget and recipient idempotency fields.
- Outbound paths require dry-run by default and a separate live approval flag.
- Campaign audience hydration fails closed when consent records cannot be read.
- Documentation and environment examples describe the approval gates.

**Acceptance:** typecheck, lint without errors, full test suite, diff check and production build pass; live send remains disabled by default.

### M1 — Accounts and database readiness (next gate)

**Owner:** Meta/messaging administrator + Backend developer + Security reviewer  
**Depends on:** M0 complete; intended Supabase project identified.

Work:

1. Read back the Meta Business Portfolio, WABA, phone number, app, permissions and webhook settings.
2. Record the IDs and environment names without putting access tokens in Git or chat.
3. Replay migration 043 on a disposable Supabase project.
4. Verify tables, indexes, RLS policies and duplicate protection.
5. Apply migration 043 to the intended Shalimar Supabase project only after the disposable check.
6. Capture the migration and readback evidence in the release record.

**Acceptance:** Meta assets are readback-verified; migration 043 succeeds on disposable and intended projects; RLS tests show one account cannot read another account's records; no secrets are committed.

### M2 — Contact and consent readiness

**Owner:** Product/operations lead + Frontend developer + Security/privacy reviewer  
**Depends on:** M1 database readiness.

Work:

- Choose the authoritative contact source.
- Normalize Indian numbers to E.164 format and retain the original value for review.
- Import to staging first; preview duplicates, invalid numbers and missing fields.
- Record consent source, wording/version, date, channel and evidence reference.
- Treat missing consent as unknown; apply hard suppression to opt-outs and complaints.
- Review a sample and approve the audience before any campaign.

**Acceptance:** every proposed recipient has an explainable consent state, suppression result, phone normalization result and source record; rejected rows can be exported with a reason; import can be rolled back without deleting the source file.

### M3 — Messaging and webhook verification

**Owner:** QA/test lead + Backend developer + Meta administrator  
**Depends on:** M1 and an approved M2 test audience.

Work:

- Configure non-production credentials in the secret store.
- Verify webhook URL, HMAC/signature checks and inbound message readback.
- Run a dry-run campaign and inspect the planned recipient list and idempotency keys.
- With explicit owner approval, send to one approved test recipient.
- Verify sent, delivered, read, failed and opt-out events update the CRM.
- Repeat a retry and confirm it does not produce a duplicate recipient send.

**Acceptance:** one conversation is traceable from campaign plan to provider response to webhook status; failure and opt-out are visible; duplicate retry is prevented; evidence includes timestamps and correlation IDs.

### M4 — CRM and campaign workflow

**Owner:** Product/operations lead + Frontend developer  
**Depends on:** M3 end-to-end messaging proof.

Work:

- Contacts, tags and consent review.
- Shared inbox assignment and follow-up ownership.
- Template selection with audience preview.
- Cost estimate, budget threshold and approval action.
- Queue, retry, idempotency and dead-letter visibility.
- Campaign result and failure report.

**Acceptance:** a trained staff member can import, review, approve, send and audit one small campaign without developer intervention; each decision is recorded.

### M5 — AI assistance (later)

**Owner:** AI reviewer + Product/operations lead  
**Depends on:** M4 stable messaging and approved Shalimar knowledge content.

Work:

- Keep AI replies as drafts until a human approves them.
- Ground answers in approved content and show the source used.
- Block unapproved promises about price, stock, refunds or delivery.
- Test order extraction with clear human approval and correction logging.
- Log prompts, outputs, approvals and corrections according to the privacy decision.

**Acceptance:** AI cannot send or make a financial/customer commitment without the configured human approval; incorrect drafts are reportable and recoverable.

### M6 — Pilot and launch

**Owner:** Shalimar owner + Release/operations owner  
**Depends on:** M1–M4 complete; M5 is not required for a messaging-only pilot.

Work:

- Resolve or explicitly accept dependency audit findings.
- Complete security/privacy review, backups, monitoring and incident contacts.
- Run a small pilot with a named owner and limited audience/budget.
- Review delivery, opt-out, cost, failure and support metrics.
- Expand only after the pilot review.

**Acceptance:** owner signs the launch checklist, rollback is understood, monitoring is active, and live mode is deliberately enabled. No live mode is enabled by code or deployment default.

## Verification plan for the whole team

| Check | Who performs it | Evidence required | Gate |
|---|---|---|---|
| Code review | Backend + frontend developers | Reviewed diff and comments resolved | Before M1 |
| Automated tests | QA/test lead | Full test output and targeted consent/provider tests | Before M1 and after material changes |
| Typecheck/lint/build | Developer + release owner | Clean typecheck, no lint errors, production build output | Before deployment |
| Migration replay | Backend developer | Disposable database log and schema/RLS assertions | Before intended DB |
| Secrets review | Security reviewer | Environment checklist; no secret in Git/history | Before credentials |
| Consent sample review | Operations + privacy reviewer | Sample with consent source and suppression outcome | Before campaign |
| Dry-run campaign | QA + operations | Planned recipients, excluded recipients, estimated cost | Before live test |
| Single test message | Owner + QA | Explicit approval and provider/webhook correlation | Before pilot |
| Rollback/incident drill | Release owner | Runbook result and named contacts | Before pilot |
| Pilot review | Owner + PM | Metrics, issues, decision and next scope | Before expansion |

Any failed check blocks the next gate until the issue is fixed or the owner records an explicit risk acceptance.

## Current risks and controls

| Risk | Source | Owner | Control / decision needed |
|---|---|---|---|
| Consent evidence is missing or ambiguous | SC-001, SC-004 | Operations + privacy reviewer | Staging import, evidence fields, fail-closed marketing filter |
| A code path sends unexpectedly | SC-002 | Backend developer + QA | Dry-run default, separate live approval flag, send-path tests |
| Duplicate sends occur during retry | SC-003 | Backend developer | Stable recipient key, unique index and retry test |
| Meta connection is only assumed, not read back | M1 dependency | Meta administrator | Record app/WABA/phone/permission/webhook readback |
| Migration behaves differently in the real project | M1 dependency | Backend developer | Disposable replay first, then intended project readback |
| Phone numbers are interpreted incorrectly | SC-004 | Operations + frontend developer | E.164 normalization, original-value review and rejected-row export |
| Dependency vulnerabilities remain | SC-006 | Security reviewer | Review advisories and upgrade safely; do not force-upgrade blindly |
| Budget is not understood before a campaign | SC-007 | Owner + operations | Cost estimate, threshold and approval record |
| AI makes an unapproved promise | SC-008 | AI reviewer | Draft-only mode, approved knowledge and human approval |

## Decision log

| Date | Decision | Reason | Owner / follow-up |
|---|---|---|---|
| 2026-10-01 | Supabase is the canonical Shalimar backend. Firebase belongs to another dashboard. | Avoid mixing systems or creating an unplanned migration. | Backend developer; keep architecture and env docs aligned. |
| 2026-10-01 | Live messaging requires two independent settings: live mode and explicit approval. | A single environment switch is too easy to enable accidentally. | Owner approves only after M1–M3 evidence. |
| 2026-10-01 | Consent is a relational evidence record; missing marketing consent is not treated as permission. | Imported phone numbers do not prove permission to market. | Operations/privacy reviewer owns evidence policy. |
| 2026-10-01 | Migration 043 must be replayed on a disposable project before the intended project. | Catch schema/RLS mistakes without risking production records. | Backend developer; attach replay output to release record. |
| 2026-10-01 | AI remains a later, human-approved phase. | Messaging and data controls must be stable before automation. | Product and AI reviewers. |
| 2026-10-01 | User reports Meta is ready; it remains an unverified dependency until app, WABA, phone, permissions and webhook are read back. | A login or dashboard appearance alone does not prove usable integration. | Meta administrator + QA at M1. |
| 2026-10-01 | Meta readback completed in the Shalimar Chrome profile. | The S&F portfolio, Test WABA, connected/high-quality test number, S&F app and green Configure Webhooks step are visible. Production phone registration, payment and send-message steps remain incomplete. | Meta administrator + QA; finish only with approved test and Supabase evidence. |
| 2026-10-01 | Keep Supabase Auth for the current Shalimar release; defer Clerk to a planned migration. | This codebase uses Supabase Auth across the dashboard and UUID foreign keys/RLS policies tied to `auth.users`. Clerk's native Supabase integration is supported, but would require coordinated identity mapping, profile sync and RLS changes. | Project manager + backend developer; revisit only as a versioned auth migration with a disposable database and rollback plan. |

## Immediate next actions

| Priority | Action | Owner | Dependency | Done when |
|---|---|---|---|---|
| P0 | Record Meta app, Business Portfolio, WABA, phone, permission and webhook readback. | Meta administrator | Access to Meta account | IDs/settings are captured without secrets |
| P0 | Select the intended Shalimar Supabase project and confirm the environment owner. | Shalimar owner + backend developer | Owner decision | Project URL/role is recorded in the private deployment record |
| P0 | Replay migration 043 on a disposable Supabase project. | Backend developer + QA | M1 project available | Tables, indexes and RLS assertions pass |
| P1 | Create a contact import sample with consent evidence columns. | Operations lead | Source file/system identified | Sample reviewed and rejected rows explainable |
| P1 | Run the dry-run campaign and save the recipient/cost/idempotency report. | QA + operations | M1 and sample audience | No external message is sent; report is reproducible |
| P1 | Review six dependency audit findings and assign upgrade decisions. | Security reviewer | Current `npm audit` output | Each advisory has fix, acceptance or deferral owner |
| P2 | Name people for each project role and add them to the handoff. | Project manager | Shalimar owner input | No milestone has an unowned acceptance check |

## Change control and reporting rhythm

- The project manager updates this file after each milestone gate or material blocker.
- Developers attach test and migration evidence to the relevant commit or release note.
- QA records both passing and failing checks; a passing summary must not hide failed scenarios.
- Material scope changes require a decision-log entry with owner and reason.
- No live send, production credential entry, spending commitment or destructive migration occurs from an open task without the owner approval required by the gate.
- The source of truth for defects is [ISSUE_REGISTER.md](./ISSUE_REGISTER.md); the source of truth for implementation sequence is [SHALIMAR_EXECUTION_PLAN.md](./SHALIMAR_EXECUTION_PLAN.md).

## Project completion definition

Shalimar Connect is ready for a controlled pilot only when M0–M3 acceptance evidence exists, M4 staff workflow is usable, the owner signs the pilot checklist, backups/monitoring and rollback are understood, and live mode is enabled deliberately. AI capability, wider audience expansion and automation are separate approvals; they are not implied by the first successful test message.
