-- Reconcile the production schema for broadcast resume fields.
-- Migration 038 owns these columns on a clean database; this idempotent
-- repair keeps older Shalimar databases aligned before a dry-run/send.

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS template_params JSONB;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS delivery_locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast_status
  ON broadcast_recipients(broadcast_id, status);

COMMENT ON COLUMN broadcast_recipients.template_params IS
  'Positional body values for this recipient template send, frozen at plan time.';

COMMENT ON COLUMN broadcasts.delivery_locked_at IS
  'Set while a server-side delivery pass is running; NULL when idle.';
