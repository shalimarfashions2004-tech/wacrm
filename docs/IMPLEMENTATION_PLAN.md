# Implementation plan

1. **Foundation (this branch):** self-contained build, consent/suppression ledger, dry-run provider boundary, idempotency fields, cost/budget fields and owner documentation.
2. **CRM import:** map Shalimar fields, explicit country handling, consent evidence import, duplicate preview/merge and rollback.
3. **Campaign safety:** consent-aware audience preflight, approval threshold, quiet hours, cost estimate, server worker and dead-letter view.
4. **Inbox/wholesale workflows:** Malayalam preference, stock/price/order/payment workflows, staff assignment and follow-ups.
5. **AI assist:** grounded copy, translation, intent classification and draft-order extraction, all human-approved.
6. **Production readiness:** disposable DB migration replay, load simulations, backup/restore test, provider credential review and a single authorised test recipient.
