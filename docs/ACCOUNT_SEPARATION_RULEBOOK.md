# Account separation rulebook

This project uses a separate account set from the Mello project. The purpose of this rulebook is to prevent a correct change being sent to the wrong repository, deployment, database, or provider account.

## Shalimar Connect identity

| System | Shalimar value |
| --- | --- |
| GitHub repository | `shalimarfashions2004-tech/wacrm` |
| GitHub CLI account | `shalimarfashions2004-tech` |
| Vercel project | `shalimar-connect` |
| Production URL | `https://crm.shalimarfashions.com` |
| Supabase project | `houjlpiyafcanxsabmsk` |
| WhatsApp business context | Shalimar Meta/WABA only |
| Browser profile | Chrome profile labelled Shalimar Workspace / Shalimar GitHub |

## Mello identity

Mello stays separate. Its GitHub account is `mellodailyofficial-glitch`, and its repository, Vercel project, Supabase project, domains, and provider credentials must be checked from the Mello project itself. Never use a Mello value in this repository.

## Required checks before a GitHub operation

Run these checks from the repository root before pulling, branching, or pushing:

```text
git remote -v
gh auth status
gh repo view shalimarfashions2004-tech/wacrm --json viewerPermission
```

For Shalimar, all of the following must be true:

1. `origin` is `https://github.com/shalimarfashions2004-tech/wacrm.git`.
2. The active GitHub CLI account is `shalimarfashions2004-tech`.
3. The repository permission is `ADMIN` or another permission that explicitly allows the intended operation.

If the active account is wrong, switch it before doing Git operations:

```text
gh auth switch -u shalimarfashions2004-tech
```

A Chrome profile name is only a workspace hint. It is not proof of the GitHub account. Always verify the GitHub username in the page header or with `gh auth status`.

## Required checks before a deploy or database change

- Confirm the Vercel project is `shalimar-connect` and the target is `crm.shalimarfashions.com`.
- Confirm the Supabase project is `houjlpiyafcanxsabmsk`.
- Use only this repository's local environment file; never copy `.env.local` between projects.
- Keep production messaging in dry-run or approval-gated mode unless a recipient, message, and live approval are recorded for that exact test.
- Never put tokens, passwords, phone numbers, or private keys in this document or in Git.

## Browser and provider rule

Use the Chrome window labelled for Shalimar when opening GitHub, Vercel, Supabase, or Meta. If more than one account is open, stop and verify the visible account before submitting a form or changing settings. Do not sign out of another project to make this work; use the correct profile or the account switcher.

## Recovery when an account mismatch appears

1. Stop before pushing, deploying, or saving provider settings.
2. Check the repository remote and active `gh` account.
3. Switch to the project account, then repeat the read-only access check.
4. Record the mismatch in the project status document if it caused a failed operation.

This rulebook contains identifiers and routing rules only. It must never contain credentials or access tokens.
