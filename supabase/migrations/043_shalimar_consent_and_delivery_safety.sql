-- Shalimar Connect safety foundation. Additive and rollback-friendly.
-- Imported contacts remain consent=unknown until evidence is recorded.

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

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT;

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suppressed_reason TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS cost_inr NUMERIC(12,4);

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'dry-run' CHECK (delivery_mode IN ('dry-run','live')),
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','approved','rejected')),
  ADD COLUMN IF NOT EXISTS estimated_cost_inr NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS budget_snapshot_inr NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS provider_name TEXT NOT NULL DEFAULT 'meta-cloud';

-- Backfill deterministic keys for historical rows, then keep new inserts
-- deterministic at the application/RPC layer. Duplicate rows are retained
-- for audit history; only NULL keys are backfilled here.
UPDATE broadcast_recipients
SET idempotency_key = broadcast_id::text || ':' || contact_id::text
WHERE idempotency_key IS NULL AND contact_id IS NOT NULL;

-- If an old broadcast already contains the same contact twice, keep the
-- first row keyed and leave later rows NULL so the unique index can be
-- added without deleting delivery history.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY broadcast_id, idempotency_key ORDER BY created_at, id) AS rn
  FROM broadcast_recipients
  WHERE idempotency_key IS NOT NULL
)
UPDATE broadcast_recipients r
SET idempotency_key = NULL
FROM ranked d
WHERE r.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipient_idempotency
  ON broadcast_recipients(broadcast_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Preserve the existing atomic broadcast creation contract while assigning
-- a stable key to every new recipient. This prevents a worker retry from
-- claiming the same broadcast/contact twice.
DROP FUNCTION IF EXISTS public.create_broadcast_with_recipients(
  UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[]
);

CREATE OR REPLACE FUNCTION public.create_broadcast_with_recipients(
  p_account_id UUID,
  p_user_id UUID,
  p_name TEXT,
  p_template_name TEXT,
  p_template_language TEXT,
  p_total_recipients INTEGER,
  p_contact_ids UUID[],
  p_template_params JSONB[]
)
RETURNS TABLE(broadcast_id UUID, recipient_id UUID, contact_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id UUID;
BEGIN
  INSERT INTO broadcasts (account_id, user_id, name, template_name, template_language, status, total_recipients)
  VALUES (p_account_id, p_user_id, p_name, p_template_name, p_template_language, 'sending', p_total_recipients)
  RETURNING id INTO v_broadcast_id;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO broadcast_recipients (broadcast_id, contact_id, status, template_params, idempotency_key)
    SELECT v_broadcast_id, t.cid, 'pending', t.prm, v_broadcast_id::text || ':' || t.cid::text
    FROM unnest(p_contact_ids, p_template_params) AS t(cid, prm)
    RETURNING id, contact_id
  )
  SELECT v_broadcast_id, ins.id, ins.contact_id FROM ins;
END;
$$;

REVOKE ALL ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[]) FROM anon;
REVOKE ALL ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[]) TO service_role;

COMMENT ON TABLE contact_consents IS 'Evidence-backed channel/category consent. Never infer marketing opt-in from import or purchase history.';
COMMENT ON COLUMN contacts.suppressed_at IS 'Immediate global suppression timestamp. Outbound marketing must treat this as a hard stop.';
COMMENT ON COLUMN broadcast_recipients.idempotency_key IS 'Stable broadcast/contact key used to prevent duplicate sends across retries and worker restarts.';
