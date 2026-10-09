# Task 4 report — identity mapping and contact safety

## Delivered

- Added `src/lib/tally/identity.ts` with deterministic Indian phone normalization and `matchTallyLedger`.
- Phone matches are the only automatic identity key. Name variants are normalized for corroboration; name-only matches are blocked, phone/name conflicts are manual review, and shared phone numbers are blocked.
- Suppressed contacts remain matched with suppression evidence; the matcher does not clear suppression or make consent decisions.
- Added `055_tally_identity_mapping.sql` with an account-scoped `tally_identity_matches` review queue. It is explicitly scoped to `new_shop_tally`, keeping the historical 2,353-customer import reconciliation separate.
- Queue inserts are service-role-only; `resolve_tally_identity_match` is owner/admin-only and can link only to a contact in the same account. Neither queueing nor resolution writes consent rows or changes suppression.
- Added tests for normalized phones, shared phones, missing phones, name variants, new CRM conflicts, phone/name conflicts, and suppressed contacts.

## Validation

- `npm test -- --run src/lib/tally/identity.test.ts` — passed (7 tests).
- `npx eslint src/lib/tally/identity.ts src/lib/tally/identity.test.ts` — passed.
- `git diff --check` — passed.
- `npm run typecheck` reaches the pre-existing `tally-agent/tests/queue.test.ts` UUID fixture error (`"a"` is not a UUID); Task 4 files introduce no reported type errors.

## Scope and follow-up

- The migration is additive and requires the existing `contacts.account_id`, `profiles.account_role`, `is_account_member`, and staged Tally run composite identity established by earlier migrations.
- Applying the migration and invoking queue/resolution RPCs in Supabase remains a deployment/database verification step; no live provider or broadcast path was touched.
