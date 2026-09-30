# Deployment checklist

Use a fork or private Shalimar repository. Configure Supabase URL/keys, `ENCRYPTION_KEY`, `META_APP_SECRET`, public HTTPS URL and `MESSAGING_DELIVERY_MODE=dry-run`. Replay migrations on a disposable Supabase project, run lint/typecheck/tests/build, verify RLS and webhook HMAC, then perform a dry-run campaign. Only after owner approval should live mode and Meta credentials be entered. Never paste credentials into Git or this chat.
