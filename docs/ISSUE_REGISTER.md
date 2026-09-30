# Issue register

| ID | Severity | Finding | Evidence | Fix / launch gate |
|---|---|---|---|---|
| SC-001 | P0 | Marketing consent was not a first-class relational record. | Contacts had no consent/suppression table in migrations 001–042. | Migration 043 adds channel/category consent evidence and hard suppression. Must apply and test before marketing send. |
| SC-002 | P0 | A default live send is unsafe for a new business deployment. | Existing Meta send helpers are real side effects. | `MESSAGING_DELIVERY_MODE=dry-run` and a provider boundary are now the safe default. Live mode requires reviewed credentials and approval. |
| SC-003 | P1 | Recipient idempotency was implicit in the delivery lock, not explicit per recipient. | Migration 038 locks a broadcast pass but has no recipient idempotency key. | Migration 043 adds a stable broadcast/contact key and unique index. |
| SC-004 | P1 | Indian phone interpretation was intentionally strict international format, but the CRM has no Shalimar default-country import policy. | `parseInternationalPhone` requires `+`; CSV import has no consent mapping. | Keep explicit E.164 at send boundaries; add import mapping and consent review to the Shalimar runbook. |
| SC-005 | P1 | Build depended on external Google Fonts availability. | `next/font/google` failed offline. | Removed runtime font fetch; use CSS fallback stack. |
| SC-006 | P1 | Dependency audit reported 6 vulnerabilities. | `npm ci` audit output: 3 moderate, 2 high, 1 critical. | Review with `npm audit` and Dependabot; do not run `npm audit fix --force` blindly. |
| SC-007 | P2 | No owner-facing cost model or budget approval threshold. | No Shalimar cost/budget docs or broadcast cost fields. | Add cost fields in migration 043 and the cost model in this branch. |
| SC-008 | P2 | AI safeguards are present for reply assistance but wholesale data-grounding and draft-order approval are not documented. | AI reply and knowledge modules exist; no Shalimar acceptance record. | Keep AI suggestions human-approved; document integration contract before enabling order extraction. |
