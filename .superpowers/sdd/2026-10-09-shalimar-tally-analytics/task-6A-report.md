# Task 6A report — existing CRM tab integration

## Delivered

- Added `src/lib/tally/tab-contracts.ts`, the shared read-only contract for CRM tabs. It carries account and canonical contact identity, source snapshot and period, reconciliation and consent state, evidence links, and an explicit live/historical/stale/missing data label.
- Reused the existing phone-first `matchTallyLedger` identity matcher. Missing mappings remain `manual_review`, shared phones are `blocked`, and no Tally path creates or mutates a CRM contact.
- Added a shared promotional-audience decision gate requiring reconciled, non-stale data and explicit marketing consent. Ordinary inbox reply paths are not coupled to this gate.
- Added an internal-event type guard limited to sync/reconciliation/action-required events for future automation and notification read loaders; outbound message events are rejected.
- Added `loadTallyDashboardMetrics` and a dashboard context panel. Existing WhatsApp, pipeline, activity, and message metrics remain unchanged. The panel labels live reconciled, historical imported, and stale/blocked snapshots visibly.
- Added focused contract tests covering canonical mapping, missing/shared identity safety, source-state labels, promotional blocking, and internal event boundaries.

## Validation

- `npm test -- --run src/lib/tally/tab-contracts.test.ts` — passed (5 tests).
- Focused ESLint on changed TypeScript/TSX files — passed.
- `git diff --check` — passed.
- `npm run typecheck` reaches existing errors in `src/lib/tally/reports.ts` implicit-any expressions and `tally-agent/tests/queue.test.ts` UUID fixture; no new errors were reported in Task 6A files.

## Scope and limitations

- Contacts, Inbox, Broadcasts, Automations, AI, Notifications, and Settings continue to use their existing permission and send gates. This task adds the shared contract and dashboard read projection; provider delivery and consent writes remain unchanged.
- Browser cross-tab readback requires the staged fixture and authenticated environment, which are not available in this local validation run.
