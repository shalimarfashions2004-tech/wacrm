# Shalimar Connect architecture

The existing Next.js/Supabase architecture remains the product base. The new boundary is:

`UI/API → consent and approval preflight → broadcast plan → provider adapter → Meta webhook normalizer → recipient/message status`

`contact_consents` is the evidence ledger. `contacts.suppressed_at` is the immediate hard stop. `broadcast_recipients.idempotency_key` is the stable `(broadcast, contact)` delivery key. `delivery_locked_at` remains the pass-level mutex. `MESSAGING_DELIVERY_MODE=dry-run` is the default until live credentials and approval are present.

Provider adapters must expose send text/template/media, template status, webhook normalization, recipient validation, cost estimation and health. Meta-specific error parsing stays inside the adapter. No UI should call Graph API directly.
