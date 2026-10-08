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
