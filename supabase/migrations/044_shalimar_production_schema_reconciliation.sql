-- 044_shalimar_production_schema_reconciliation
--
-- Additive reconciliation for older Shalimar production databases that
-- predate the current WACRM migrations. Every statement is idempotent and
-- preserves existing rows. The corresponding production repair was applied
-- through Supabase SQL Editor after verifying there were no message-key
-- duplicates.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_default_currency_format;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_default_currency_format
  CHECK (default_currency ~ '^[A-Z]{3}$');

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS wa_user_id TEXT,
  ADD COLUMN IF NOT EXISTS wa_parent_user_id TEXT,
  ADD COLUMN IF NOT EXISTS wa_username TEXT,
  ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_wa_user_id
  ON contacts (account_id, wa_user_id)
  WHERE wa_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS contact_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','email','rcs')),
  category TEXT NOT NULL CHECK (category IN ('marketing','utility','service','authentication')),
  status TEXT NOT NULL CHECK (status IN ('opted_in','opted_out','unknown')),
  source TEXT NOT NULL,
  wording_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, contact_id, channel, category)
);

CREATE INDEX IF NOT EXISTS idx_contact_consents_sendable
  ON contact_consents(account_id, channel, category, status, contact_id);

ALTER TABLE contact_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members manage contact consent" ON contact_consents;
CREATE POLICY "Account members manage contact consent" ON contact_consents FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1
      FROM contacts c
      WHERE c.id = contact_consents.contact_id
        AND c.account_id = contact_consents.account_id
    )
  );

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_type TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_message_id
  ON messages (conversation_id, message_id);

CREATE OR REPLACE FUNCTION public.bump_conversation_on_inbound(
  p_conversation_id UUID,
  p_last_message_text TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversations
  SET unread_count = COALESCE(unread_count, 0) + 1,
      last_message_text = p_last_message_text,
      last_message_at = NOW(),
      updated_at = NOW()
  WHERE id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_conversation_on_inbound(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
