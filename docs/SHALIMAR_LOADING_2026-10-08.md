# Shalimar CRM loading improvements — 8 October 2026

## Delivered behavior

Settings changes its local panel and URL without a server navigation, preserving other query parameters, the hash, existing deep links and replace-history behavior. The rail stays available while a selected feature loads. Hover/keyboard focus starts code preloading without fetching account data or performing a provider action.

Settings loads integration/editor panels individually. AI keeps its authenticated configuration check fresh and defers Playground and Usage/chart code until needed. Dashboard chart code loads in parallel with the existing data reads; it no longer blocks the page's initial bundle.

Ordinary display lists have a bounded browser-memory read cache: 10-second lifetime, at most 64 entries, at most 256,000 response bytes each. Requests share pending reads; paginated PostgREST 206 responses retain counts and range headers. Scope includes resolved user, account and role; direct database reads also require a matching unexpired user JWT. Cache keys omit credentials. No persistent browser storage was added. Writes invalidate before/after completion, and account changes, sign-out, realtime updates, refocus and explicit fresh requests clear reads. An old pending account read cannot populate the new scope or return its data after a scope switch.

Authorization/profile/account reads, credentials, messages/conversations, registration/provider checks, consent, budget/ledger/approval data and automation step configuration remain fresh. Abortable requests keep their own cancellation. Errors, oversized responses and server no-store responses are not retained. Relevant Flows, workflow, knowledge and contact-tag writes invalidate the shared display cache.

No delivery flag, monthly limit, provider credential, schema or customer record was changed for this performance work. Inbox replies remain the separately approved path; campaign delivery remains paused.

## Local measurements

Same-version Webpack production builds were compared before/after. The figures sum gzip-compressed dependency chunks attached to each client page entry in Next's client-reference manifest, excluding separately referenced runtime/layout bundles. They are bundle-size measurements, not observed loading times. Deferred code still downloads when needed. Production uses Turbopack, so these byte totals are not claims about Vercel's exact transfer size.

| Page | Before, gzip bytes | After, gzip bytes | Reduction |
| --- | ---: | ---: | ---: |
| settings | 225,305 | 129,234 | 43% |
| agents | 296,136 | 169,052 | 43% |
| dashboard | 221,128 | 101,567 | 54% |
| contacts | 198,209 | 199,295 | -1% |
| inbox | 212,401 | 213,557 | -1% |

Contacts/Inbox entry code grows by roughly 1 KB from the common cache wiring. Contacts, tags, fields, pipelines/deals, notifications, quick replies, workflow lists, Flows and knowledge summaries benefit from repeated-read reuse instead. One regression check makes three equivalent calls (including simultaneous callers) and verifies one underlying request; a real Supabase client test verifies paginated 206 counts and a fresh read after an edit.

Baseline application source: `3eec14eaee22410703f94b8362605273ce61f540` (the subsequent 6b2c8b2 commit changed documentation only). Exact after-build values are also in `docs/evidence/shalimar-loading-20261008.json`.

## Validation and remaining readback

110 files / 1,243 tests passed, including 37 new cache behavior/boundary results. Type checking and local production Webpack build passed with placeholder credentials and live delivery disabled. Lint: 0 errors, 37 existing warnings; diff whitespace check passed. No new package or framework upgrade. SQL was not changed; the preceding release's 29 SQL results and owner 051 installation receipt remain separate evidence.

Next devtools discovery found no running development server; no runtime tool was pointed at another project. Authenticated production timing and tab interactions have not been measured by the agent. Earlier automatic approval review rejected authenticated CRM browser access; no session extraction or alternative browser was used to bypass it. Owner signed-in screen readback remains needed. The first visit still depends on live authentication/database latency; the update does not establish instant loading on every network.

Owner readback on 8 October: “Meta checks passed for Shalimar Fashions (+91 70253 20333).” This confirms the owner's current hosted provider-check result; campaign template approval, controlled image testing and other managed activation checks remain separate.

## References and rollback

Native history and lazy loading follow the installed Next 16.3.8 guides in `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` and `01-app/02-guides/lazy-loading.md`. PostgREST documents paginated 206 responses and count headers in [Pagination and Count](https://postgrest.org/en/stable/references/api/pagination_count.html).

Rollback target is the previously verified Vercel deployment `dpl_p65FZYWmYnDsSHz5ZpgCHNgJivxf`. The production receipt below records the new source commit, READY deployment, CRM alias and public authentication-boundary checks. No public GitHub push is part of this release.

## Production receipt

Committed source `0ad8f92061f29a5088c6beb954cbd0c09a50881b` was deployed from a clean Git archive with existing project linkage, using hosted environment values. Local placeholder build artifacts and unrelated/untracked files were excluded. Vercel hosted Turbopack build passed; deployment `dpl_WKu9AXySZ9Rxe1JYeeTzYLFcQnjb` is **READY**. Fresh provider metadata confirms `crm.shalimarfashions.com` points to this exact deployment in the existing Shalimar project.

Public live readback: `/login` 200; managed settings, WhatsApp config, AI usage, AI knowledge and Flows each return 401 without authentication. All 15 script assets observed on the login page returned 200. The newly added account-cache code is present and local CI placeholders are absent from those public scripts. This verifies the published code and public authentication boundaries; it does not measure an authenticated page's loading time.

The owner has been asked to refresh once and check Settings tab switching, AI, Contacts and Notifications. That readback is pending. The agent sent no messages, changed no WhatsApp credential, enabled no campaign and made no public GitHub push.


## Follow-up: owner still saw two-stage loading

The owner reported that AI Agents, Settings/Templates and WhatsApp first opened a page and then loaded its details again. The first bundle-size release did not resolve that observed symptom. No authenticated timing improvement is claimed from that release.

Investigation found that Settings unmounted each previous panel and Base UI unmounted AI Setup when it switched to Playground. Their mounted guards therefore reset on every return. WhatsApp waited for the database read and sequential live Meta health checks before revealing the form. AI configuration loaded before the knowledge card could start its request. The previous transport cache correctly honored API `no-store`, so it could share simultaneous API calls but did not retain these API display views between mounts.

The follow-up adds `/api/settings/snapshot`: one fresh, server-authenticated account context, then parallel reads for WhatsApp form metadata, sanitized AI configuration, knowledge summaries and the saved account-wide template catalog. Its response explicitly strips encrypted and plaintext credentials, ignores unknown template columns, and stays `private, no-store` over HTTP. The exact endpoint owns its session verification and cookie refresh, avoiding the redundant middleware `getUser`; other middleware guards are unchanged. No provider check, template synchronization, default seeding, AI generation or message send runs in this endpoint.

After the account/role resolves, the dashboard preloads that safe snapshot and the common screen code in the background. A separate, explicit per-tab view snapshot is retained for at most 60 seconds under user/account/role scope. This does not change HTTP caching. It shares pending requests, rejects results from an old account, skips errors and partial failures, and uses the existing byte/entry limits. Saves, edits, deletion, realtime invalidation, sign-out, account/role changes and refocus invalidate it. Explicit refresh bypasses old state and refreshes the saved snapshot. Health, registration, budget, approvals, AI usage and delivery checks are not memoized.

Visited Settings panels keep their state while on the Settings route. AI Setup/Playground keep their state while on Agents. Scope changes destroy these forms; inactive Settings panels are hidden/inert and their portaled dialogs are closed. WhatsApp reveals its saved form independently of Meta, uses a neutral checking state, and refreshes live health on returning to that panel. Fresh campaign settings are also reread on return. A failed metadata request has a retry state rather than presenting an empty form as a new configuration. Templates use account tenancy rather than the original author's user ID; mutations still use existing server role checks and refresh the catalog. AI knowledge summaries come from the same parallel snapshot, eliminating their second server request after setup completes.

The currently deployed server region was confirmed as `iad1` in Vercel. The database region has not been established from available provider metadata. No region change was made based on an assumption.

Validation is recorded in `docs/evidence/shalimar-preload-20261008.json`. Authenticated production browser inspection remains unavailable because the earlier automatic approval review rejected that access. No alternative browser or session extraction bypassed it. A first load still requires authentication/network access, and actual owner-observed timing remains a separate acceptance check. No credentials, delivery flag, budget limit, schema, customer record or approved Inbox reply policy was changed.


### Follow-up release receipt

Code source: `b48ee1d4dc95883ccdd143723493a13e64d2b8ce`. Vercel deployment `dpl_XPVXzhLn9qWCGzSdjaLEU9nbfcDw` is READY and the provider's alias readback confirms `crm.shalimarfashions.com` points to that exact deployment. A fresh committed Git archive was built by the hosted Turbopack builder; no placeholder prebuilt bundle or untracked asset was uploaded. Rollback for this follow-up is the first performance deployment `dpl_WKu9AXySZ9Rxe1JYeeTzYLFcQnjb`.

Final local checks: 113 files / 1,281 tests passed (38 new regression results since the first performance release), typecheck passed after a sequential rerun, lint 0 errors / 36 existing warnings, local Webpack production build passed, and diff check passed. One parallel typecheck attempt collided with the build regenerating `.next/types`; it was rerun after the build and passed. Local HTTP reads confirmed `/login` 200 and the snapshot route 401, including a caller-supplied account query that cannot select an account. The task's local verification server was then stopped.

Production public readback: `/login` 200; six protected APIs, including the new snapshot endpoint, return 401 without authentication. All 15 observed public login script assets return 200; the new snapshot/view code marker is present and CI placeholder credentials are absent. These checks establish deployment identity and public authentication boundaries, not signed-in database results or loading timings.

After refreshing once and checking AI Setup → WhatsApp → Templates → WhatsApp, the owner replied: “Details appear quickly now.” This confirms the targeted signed-in loading acceptance after the follow-up release. No numeric timing, universal instant-loading guarantee or overall production-readiness claim is inferred from that readback.


Owner acceptance received on 8 October 2026: **Details appear quickly now.** The targeted loading fix is complete. Broader managed WhatsApp/AI activation checks remain separate from this performance release.
