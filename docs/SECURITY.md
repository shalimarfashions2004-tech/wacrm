# Security controls

Existing controls include Supabase RLS, account-scoped access, AES-256-GCM token encryption, HMAC webhook verification, scoped API keys, CSP and rate limiting. The audit still treats provider credentials and contact data as high-sensitivity.

Never commit `.env.local`, service-role keys, Meta tokens or AI keys. Keep PII out of logs, validate media URLs and imports, sanitize spreadsheet formula cells, retain immutable audit events, and review the 6 vulnerabilities reported by `npm ci` before deployment. Run migrations against a disposable database first; do not use `supabase db reset` against production.
