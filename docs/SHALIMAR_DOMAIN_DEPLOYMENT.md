# Shalimar CRM domain deployment

Status: Vercel project ready; custom subdomain pending GoDaddy DNS update  
Target: `https://crm.shalimarfashions.com`

## What is already known

- `shalimarfashions.com` currently serves a GitHub Pages “Coming Soon” site.
- The domain’s nameservers are GoDaddy (`ns43.domaincontrol.com` and `ns44.domaincontrol.com`).
- The CRM is a server-rendered Next.js application. GitHub Pages is not a suitable host for the CRM because it cannot run the app’s server routes, Supabase session handling, webhooks or API.
- WhatsApp delivery stays in dry-run mode during deployment.
- Vercel project: `shalimar-connect` in the Shalimar account.
- Current deployment URL: `https://shalimar-connect-4tej02yux-shalimarfashions2004-9466.vercel.app`.

## Recommended hosting path

Use a Next.js host such as Vercel or an existing managed Node host. Vercel is the shortest path for this repository; it provides a temporary `vercel.app` URL first, then the custom subdomain can be attached after the build and environment checks pass.

Vercel currently shows this exact DNS record for the custom subdomain:

| Type | Name | Target | Purpose |
|---|---|---|---|
| CNAME | `crm` | `aa82c31b3c6585b9.vercel-dns-017.com.` | Routes `crm.shalimarfashions.com` to the CRM deployment |

The domain has been added to Vercel and is currently marked “Invalid Configuration” until this record is present at GoDaddy.

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

The intended Shalimar Supabase project and migration 043 must be verified before the deployment is called functional. No real Meta token or production secret belongs in a repository file.

The current Vercel project has only safe placeholder values so the build can be verified. Replace the Supabase values in Vercel’s Environment Variables screen before inviting users or calling the CRM live. Keep `MESSAGING_DELIVERY_MODE=dry-run` and `MESSAGING_LIVE_APPROVED=false` until the full Meta and consent checklist is approved.

## Release checks

1. Host creates a preview deployment from the Shalimar branch. **Done:** production deployment is ready at the temporary Vercel URL.
2. Build, typecheck and tests pass.
3. `/login` and `/signup` render over HTTPS.
4. Supabase email redirect URLs allow `https://crm.shalimarfashions.com/auth/callback`.
5. Add the `crm` CNAME above in GoDaddy, then verify DNS resolves and the host provisions TLS.
6. A test account can sign in and reach `/dashboard`.
7. Dashboard reads account-scoped data without cross-account access.
8. A dry-run campaign produces a plan without sending an external message.

## Rollback

Remove or disable only the `crm` CNAME record and return the host deployment to its previous version. The apex Shalimar website remains untouched.
