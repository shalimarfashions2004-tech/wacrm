# Shalimar CRM domain deployment

Status: Vercel project ready; CRM subdomain connected; Supabase Auth configuration verified; database migration pending
Target: `https://crm.shalimarfashions.com`

## What is already known

- `shalimarfashions.com` currently serves a GitHub Pages “Coming Soon” site.
- The domain’s nameservers are GoDaddy (`ns43.domaincontrol.com` and `ns44.domaincontrol.com`).
- The CRM is a server-rendered Next.js application. GitHub Pages is not a suitable host for the CRM because it cannot run the app’s server routes, Supabase session handling, webhooks or API.
- WhatsApp delivery stays in dry-run mode during deployment.
- Vercel project: `shalimar-connect` in the Shalimar account.
- Current deployment URL: `https://shalimar-connect-kndhki28h-shalimarfashions2004-9466.vercel.app`.
- Supabase project: `shalimar` (`houjlpiyafcanxsabmsk`) in the Shalimar organization.
- Supabase project URL: `https://houjlpiyafcanxsabmsk.supabase.co`.

## Recommended hosting path

Use a Next.js host such as Vercel or an existing managed Node host. Vercel is the shortest path for this repository; it provides a temporary `vercel.app` URL first, then the custom subdomain can be attached after the build and environment checks pass.

Vercel currently shows this exact DNS record for the custom subdomain:

| Type | Name | Target | Purpose |
|---|---|---|---|
| CNAME | `crm` | `aa82c31b3c6585b9.vercel-dns-017.com.` | Routes `crm.shalimarfashions.com` to the CRM deployment |

The record is now present and Vercel shows `crm.shalimarfashions.com` as **Production**. HTTPS is responding successfully; keep the DNS record unchanged.

Do not replace the apex `shalimarfashions.com` records until the existing public site has an approved replacement. The first release only needs the `crm` subdomain.

## Environment values required in the host secret store

Set these in the host dashboard, never in Git or chat:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `META_APP_SECRET`
- `NEXT_PUBLIC_SITE_URL=https://crm.shalimarfashions.com`
- `MESSAGING_DELIVERY_MODE=dry-run`
- `MESSAGING_LIVE_APPROVED=false`
- `MESSAGING_PROVIDER=meta-cloud`

The intended Shalimar Supabase project was restored from a paused state on 2026-10-01; its dashboard currently reports healthy. Vercel now has the project URL, browser key and protected server key for Production and Preview. Supabase Auth uses `https://crm.shalimarfashions.com` as the site URL and allows the CRM and local callback patterns. No real Meta token or production secret belongs in a repository file.

`ENCRYPTION_KEY` and `META_APP_SECRET` remain placeholders until the owner supplies the correct production values through the secret store. Keep `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED=false` until the full Meta and consent checklist is approved.

## Release checks

1. Host creates a preview deployment from the Shalimar branch. **Done:** a fresh production redeploy picked up the Supabase environment values; the deployed bundle no longer contains the placeholder URL and `crm.shalimarfashions.com` returns HTTP 200.
2. Typecheck and the full Vitest suite pass (95 files, 1,085 tests); the broadcast safety subset is 8 files and 65 tests. The hosted Vercel build is Ready; a local build requires Supabase environment variables.
3. **Done:** `/login` and `/signup` render over HTTPS without the previous fetch error.
4. **Done:** Supabase site URL and redirect allow-list include the CRM and local callback patterns.
5. Done: the `crm` CNAME is added in GoDaddy; verify HTTPS/TLS readback after any future DNS edits.
6. A test account can sign in and reach `/dashboard`.
7. Dashboard reads account-scoped data without cross-account access.
8. A dry-run campaign produces a plan without sending an external message.

## Rollback

Remove or disable only the `crm` CNAME record and return the host deployment to its previous version. The apex Shalimar website remains untouched.
