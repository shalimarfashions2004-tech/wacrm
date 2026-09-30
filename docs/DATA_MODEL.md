# Data model additions

Migration 043 adds `contact_consents` with account, contact, channel, category, status, source, wording version, timestamps and evidence. It adds global suppression fields to contacts, stable idempotency and provider/cost fields to broadcast recipients, and delivery mode, approval status, provider and budget snapshots to broadcasts.

No imported contact is marked opted in. Contact dedupe continues to use the existing normalized-phone unique index. Historical broadcast rows are backfilled with deterministic keys where a contact exists; no messages are sent by the migration.
