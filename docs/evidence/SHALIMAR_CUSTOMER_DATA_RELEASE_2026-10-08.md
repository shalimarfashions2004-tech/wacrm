# Customer Data release receipt — 8 October 2026

Code commit: `2ea5b9c60dc81c5f3f826b820d6ea0192583ccb7`, pushed to `feature/shalimar-connect-platform` on the canonical `shalimarfashions2004-tech/wacrm` remote. GitHub CLI identity was `shalimarfashions2004-tech`. Vercel CLI identity/project were `shalimarfashions2004-9466` / `shalimar-connect` (`prj_8tVCzU4KZSBbTky0BHqmxBFZif1O`).

Production deployment: `dpl_F1NjpJipJKKbHkmKmFmP2PMFNGcn`.

- Provider status: **Ready**, target **production**, read through Vercel deployment inspection.
- Deployment URL: `https://shalimar-connect-ogh41qnv1-shalimarfashions2004-9466.vercel.app`.
- Production alias: `https://crm.shalimarfashions.com`.
- Provider creation time: 8 October 2026, 17:49:20 Europe/London.
- Provider build duration: 1 minute 2 seconds.
- No WhatsApp credentials, delivery flags, permissions or budget values were changed for deployment.

Public readback after deployment:

| Path | Result |
| --- | --- |
| `/login` | 200 HTML |
| `/contacts/data-sheet` without authentication | 307 to `/login` |
| `/api/customer-data` without authentication | 401 JSON `Unauthorized` |
| `/brand/shalimar-store-introduction.png` | 200 `image/png` |

These responses verify deployment/public routing and the unauthenticated boundary. They **do not** verify an authenticated customer import, language/permission persistence, current Meta template approval or actual image delivery. The private customer CSV remains outside the public repository and was not uploaded as part of this deployment. Migration 052 and CRM import readbacks were still pending at this receipt.

Local release validation: 115 files / 1,323 Vitest tests; typecheck; lint 0 errors / 36 existing warnings; configured Webpack build; 22 customer-data PostgreSQL test results; 29 existing managed-messaging PostgreSQL results; five synthetic export-reconciliation checks. Workflow changes add the new database/export tests to migration CI. CI is not reported as executed on this feature-branch push because current workflow triggers target main/pull requests.

The owner still needs to run `SHALIMAR_RUN_THIS_052.sql`, import the prepared private CSV in Customer Data and provide saved count/source/contact-link readback. No customer message was sent or campaign enabled by this release. Template submission/approval and a separately authorized controlled image test remain gates to sending.

Rollback: restore the prior known-good Vercel deployment if existing authentication, Inbox or Settings regresses. Keep additive import tables and any saved customer records. The earlier authenticated CRM inspection rejection was not bypassed; no session cookies, extracted credentials or service-role reads were used for these checks.
