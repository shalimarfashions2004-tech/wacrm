# Shalimar Connect audit

**Date:** 2026-09-30
**Repository:** `wacrm`, branch `feature/shalimar-connect-platform`

The repository is a mature self-hostable CRM rather than a blank prototype. It uses Next.js 16.3.5, React 19, TypeScript, Tailwind v4 and Supabase Postgres/Auth/Storage/RLS. The official Meta Cloud API is the only production WhatsApp transport in the codebase. The inbox, contact/tag/custom-field model, CSV import, pipelines, broadcasts, templates, automations, team roles, AI reply assistant, HMAC webhook validation, encrypted provider tokens and broadcast resume lock already exist.

The Shalimar-specific gaps are consent evidence and suppression, Indian phone/import policy, a provider boundary, cost/budget controls, owner-facing operational documentation and a default dry-run mode. The existing broadcast resume lock prevents concurrent delivery passes, but recipient idempotency and consent need an explicit database model. The new migration `043_shalimar_consent_and_delivery_safety.sql` is additive and does not run automatically against a live database.

Safe checks on the clean checkout: `npm ci` succeeded; lint passed with 41 existing warnings and no errors; typecheck passed; the branch now passes 93 Vitest files and 1,078 tests. The production build initially failed because `next/font/google` fetched Inter while this environment had no DNS. The layout now uses the existing CSS font stack, and a CI-style Webpack build with dummy Supabase/Meta values completes without Google Fonts or production credentials.
