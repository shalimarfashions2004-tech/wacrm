-- Managed campaign/automation delivery foundation. No sends or activation.
-- Money is integer paise. Reservations are permanent, including failed or
-- uncertain attempts: only a future, separately reviewed reconciliation may
-- release money. Never delete the ledger to retry a provider request.

CREATE TABLE IF NOT EXISTS public.messaging_budget_policies (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE RESTRICT,
  monthly_limit_paise INTEGER NOT NULL CHECK (monthly_limit_paise BETWEEN 1 AND 100000),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  phone_number_id TEXT NOT NULL CHECK (phone_number_id ~ '^[0-9]+$'),
  waba_id TEXT NOT NULL CHECK (waba_id ~ '^[0-9]+$'),
  -- A reviewed conservative per-message reservation, NOT Meta's invoice rate.
  reservation_paise INTEGER CHECK (reservation_paise BETWEEN 1 AND 100000),
  rate_source TEXT,
  rate_reviewed_at TIMESTAMPTZ,
  rate_valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT enabled OR (
    reservation_paise IS NOT NULL AND rate_source IS NOT NULL AND rate_source ~ '[^[:space:]]'
    AND rate_reviewed_at IS NOT NULL AND rate_valid_until IS NOT NULL AND rate_valid_until > rate_reviewed_at
  ))
);

CREATE TABLE IF NOT EXISTS public.messaging_source_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.messaging_budget_policies(account_id) ON DELETE RESTRICT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('broadcast', 'automation')),
  source_id UUID NOT NULL,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  approved_by UUID NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > approved_at AND expires_at <= approved_at + INTERVAL '30 days')
);
CREATE UNIQUE INDEX IF NOT EXISTS messaging_source_approvals_current
  ON public.messaging_source_approvals(account_id, source_kind, source_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.messaging_delivery_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.messaging_budget_policies(account_id) ON DELETE RESTRICT,
  approval_id UUID NOT NULL REFERENCES public.messaging_source_approvals(id) ON DELETE RESTRICT,
  operation_key TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('broadcast', 'automation')),
  source_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  budget_month DATE NOT NULL,
  reserved_paise INTEGER NOT NULL CHECK (reserved_paise > 0),
  outcome TEXT NOT NULL DEFAULT 'reserved' CHECK (outcome IN ('reserved', 'accepted', 'failed', 'uncertain')),
  provider_message_id TEXT,
  result_code TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE(account_id, operation_key),
  CHECK (outcome <> 'accepted' OR NULLIF(BTRIM(provider_message_id), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS messaging_delivery_ledger_month
  ON public.messaging_delivery_ledger(account_id, budget_month);
CREATE UNIQUE INDEX IF NOT EXISTS messaging_delivery_ledger_provider
  ON public.messaging_delivery_ledger(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.messaging_budget_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_source_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_delivery_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messaging_budget_read ON public.messaging_budget_policies;
CREATE POLICY messaging_budget_read ON public.messaging_budget_policies FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));
DROP POLICY IF EXISTS messaging_approvals_read ON public.messaging_source_approvals;
CREATE POLICY messaging_approvals_read ON public.messaging_source_approvals FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));
DROP POLICY IF EXISTS messaging_ledger_read ON public.messaging_delivery_ledger;
CREATE POLICY messaging_ledger_read ON public.messaging_delivery_ledger FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));
-- Bypass-RLS is not permission to bypass the reservation protocol. Even the
-- application's service role writes these tables only through the RPCs below.
REVOKE ALL ON public.messaging_budget_policies, public.messaging_source_approvals,
  public.messaging_delivery_ledger FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.messaging_budget_policies, public.messaging_source_approvals,
  public.messaging_delivery_ledger TO authenticated, service_role;

-- Internal fingerprint of the saved content, audience, sender and budget terms.
-- Excludes progress counters/timestamps so delivery itself does not revoke it.
-- Automation template changes conservatively require renewed approval.
CREATE OR REPLACE FUNCTION public.messaging_source_fingerprint(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET timezone = 'UTC' AS $$
DECLARE
  v_source JSONB;
  v_children JSONB;
  v_templates JSONB;
  v_policy JSONB;
  v_sender JSONB;
BEGIN
  SELECT jsonb_build_object('phone', p.phone_number_id, 'waba', p.waba_id,
    'limit', p.monthly_limit_paise, 'reservation', p.reservation_paise,
    'rate_source', p.rate_source, 'rate_reviewed_at', p.rate_reviewed_at,
    'rate_valid_until', p.rate_valid_until)
  INTO v_policy FROM public.messaging_budget_policies p WHERE p.account_id = p_account_id;
  SELECT jsonb_build_object('phone', c.phone_number_id, 'waba', c.waba_id)
  INTO v_sender FROM public.whatsapp_config c WHERE c.account_id = p_account_id;
  IF v_policy IS NULL OR v_sender IS NULL THEN RAISE EXCEPTION 'messaging_policy_missing'; END IF;
  IF p_source_kind = 'broadcast' THEN
    SELECT jsonb_build_object('id', b.id, 'name', b.name, 'template', b.template_name,
      'language', b.template_language, 'variables', b.template_variables,
      'audience', b.audience_filter, 'scheduled_at', b.scheduled_at)
    INTO v_source FROM public.broadcasts b WHERE b.id = p_source_id AND b.account_id = p_account_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'contact', r.contact_id,
      'phone', c.phone, 'params', r.template_params) ORDER BY r.id), '[]'::jsonb)
    INTO v_children FROM public.broadcast_recipients r
      LEFT JOIN public.contacts c ON c.id = r.contact_id AND c.account_id = p_account_id
    WHERE r.broadcast_id = p_source_id;
    SELECT COALESCE(jsonb_agg(to_jsonb(t) - ARRAY['created_at', 'updated_at', 'last_submitted_at'] ORDER BY t.id), '[]'::jsonb)
    INTO v_templates FROM public.message_templates t JOIN public.broadcasts b
      ON t.account_id = b.account_id AND t.name = b.template_name AND t.language = b.template_language
    WHERE b.id = p_source_id AND b.account_id = p_account_id;
  ELSIF p_source_kind = 'automation' THEN
    SELECT jsonb_build_object('id', a.id, 'name', a.name, 'trigger', a.trigger_type,
      'config', a.trigger_config)
    INTO v_source FROM public.automations a WHERE a.id = p_source_id AND a.account_id = p_account_id;
    SELECT COALESCE(jsonb_agg(to_jsonb(s) - 'created_at' ORDER BY s.id), '[]'::jsonb)
    INTO v_children FROM public.automation_steps s WHERE s.automation_id = p_source_id;
    SELECT COALESCE(jsonb_agg(to_jsonb(t) - ARRAY['created_at', 'updated_at', 'last_submitted_at'] ORDER BY t.id), '[]'::jsonb)
    INTO v_templates FROM public.message_templates t WHERE t.account_id = p_account_id;
  ELSE RAISE EXCEPTION 'messaging_source_invalid';
  END IF;
  IF v_source IS NULL THEN RAISE EXCEPTION 'messaging_source_not_found'; END IF;
  RETURN encode(sha256(convert_to(jsonb_build_object('source', v_source, 'children', v_children,
    'templates', v_templates, 'policy', v_policy, 'sender', v_sender)::text, 'UTF8')), 'hex');
END $$;

-- Preview/approval calls use the signed-in user, never a caller-supplied actor.
CREATE OR REPLACE FUNCTION public.preview_messaging_approval(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_account_member(p_account_id, 'admin') THEN RAISE EXCEPTION 'messaging_admin_required'; END IF;
  RETURN public.messaging_source_fingerprint(p_account_id, p_source_kind, p_source_id);
END $$;

CREATE OR REPLACE FUNCTION public.approve_messaging_source(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID, p_expected_fingerprint TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_fingerprint TEXT; v_id UUID;
BEGIN
  IF NOT public.is_account_member(p_account_id, 'admin') THEN RAISE EXCEPTION 'messaging_admin_required'; END IF;
  PERFORM 1 FROM public.messaging_budget_policies WHERE account_id = p_account_id FOR UPDATE;
  v_fingerprint := public.messaging_source_fingerprint(p_account_id, p_source_kind, p_source_id);
  IF p_expected_fingerprint IS DISTINCT FROM v_fingerprint THEN RAISE EXCEPTION 'messaging_source_changed'; END IF;
  IF p_source_kind = 'broadcast' AND NOT EXISTS (
    SELECT 1 FROM public.broadcast_recipients r JOIN public.contacts c ON c.id = r.contact_id
    WHERE r.broadcast_id = p_source_id AND c.account_id = p_account_id
  ) THEN RAISE EXCEPTION 'messaging_audience_empty'; END IF;
  SELECT id INTO v_id FROM public.messaging_source_approvals
  WHERE account_id = p_account_id AND source_kind = p_source_kind AND source_id = p_source_id
    AND revoked_at IS NULL AND fingerprint = v_fingerprint AND expires_at > NOW() AND approved_by = auth.uid();
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  UPDATE public.messaging_source_approvals SET revoked_at = NOW()
  WHERE account_id = p_account_id AND source_kind = p_source_kind AND source_id = p_source_id AND revoked_at IS NULL;
  INSERT INTO public.messaging_source_approvals(account_id, source_kind, source_id, fingerprint, approved_by, expires_at)
  VALUES (p_account_id, p_source_kind, p_source_id, v_fingerprint, auth.uid(), NOW() + INTERVAL '30 days')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_messaging_source(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_account_member(p_account_id, 'admin') THEN RAISE EXCEPTION 'messaging_admin_required'; END IF;
  PERFORM 1 FROM public.messaging_budget_policies WHERE account_id = p_account_id FOR UPDATE;
  UPDATE public.messaging_source_approvals SET revoked_at = NOW()
  WHERE account_id = p_account_id AND source_kind = p_source_kind AND source_id = p_source_id AND revoked_at IS NULL;
END $$;

-- Only a trusted server worker can claim. It must build the exact payload
-- from the approved saved source and pass that payload's SHA-256. SQL derives
-- the operation key; a worker cannot bypass deduplication with a fresh key.
-- Each claim is ONE attempt, even if a worker dies before recording a result.
CREATE OR REPLACE FUNCTION public.claim_messaging_delivery(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID, p_contact_id UUID,
  p_expected_fingerprint TEXT, p_payload_hash TEXT,
  p_recipient_id UUID DEFAULT NULL, p_run_id UUID DEFAULT NULL, p_step_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_policy public.messaging_budget_policies%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
  v_approval public.messaging_source_approvals%ROWTYPE;
  v_existing public.messaging_delivery_ledger%ROWTYPE;
  v_key TEXT; v_category TEXT; v_template_name TEXT; v_language TEXT;
  v_step public.automation_steps%ROWTYPE;
  v_inbound TIMESTAMPTZ; v_inbound_text TEXT;
  v_month DATE := date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')::date;
  v_spent BIGINT; v_id UUID;
BEGIN
  IF p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'messaging_payload_invalid'; END IF;
  -- Serializes ALL campaign and automation claims in this account, including
  -- first use of a month. SUM cannot race two workers past the monthly cap.
  SELECT * INTO v_policy FROM public.messaging_budget_policies WHERE account_id = p_account_id FOR UPDATE;
  IF NOT FOUND OR NOT v_policy.enabled THEN RAISE EXCEPTION 'messaging_managed_disabled'; END IF;
  IF v_policy.rate_valid_until IS NULL OR v_policy.rate_valid_until <= NOW()
    OR v_policy.rate_reviewed_at > NOW() THEN RAISE EXCEPTION 'messaging_rate_review_required'; END IF;
  PERFORM 1 FROM public.whatsapp_config c WHERE c.account_id = p_account_id
    AND c.phone_number_id = v_policy.phone_number_id AND c.waba_id = v_policy.waba_id
    AND c.status = 'connected' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'messaging_sender_mismatch'; END IF;
  IF p_expected_fingerprint IS DISTINCT FROM public.messaging_source_fingerprint(p_account_id, p_source_kind, p_source_id)
    THEN RAISE EXCEPTION 'messaging_source_changed'; END IF;
  SELECT * INTO v_approval FROM public.messaging_source_approvals a
  WHERE a.account_id = p_account_id AND a.source_kind = p_source_kind AND a.source_id = p_source_id
    AND a.fingerprint = p_expected_fingerprint AND a.revoked_at IS NULL AND a.expires_at > NOW();
  IF NOT FOUND THEN RAISE EXCEPTION 'messaging_approval_required'; END IF;
  -- Removal/demotion of the approver invalidates their standing approval.
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_approval.approved_by
    AND p.account_id = p_account_id AND p.account_role IN ('owner', 'admin'))
    THEN RAISE EXCEPTION 'messaging_approver_no_longer_authorized'; END IF;
  SELECT * INTO v_contact FROM public.contacts c WHERE c.id = p_contact_id AND c.account_id = p_account_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'messaging_contact_not_found'; END IF;
  IF v_contact.suppressed_at IS NOT NULL THEN RAISE EXCEPTION 'messaging_contact_suppressed'; END IF;
  IF COALESCE(v_contact.phone, '') !~ '^\+?[0-9 ()-]+$'
    OR COALESCE(regexp_replace(v_contact.phone, '[^0-9]', '', 'g'), '') !~ '^91[6-9][0-9]{9}$'
    THEN RAISE EXCEPTION 'messaging_india_mobile_required'; END IF;

  IF p_source_kind = 'broadcast' THEN
    PERFORM 1 FROM public.broadcast_recipients r WHERE r.id = p_recipient_id
      AND r.broadcast_id = p_source_id AND r.contact_id = p_contact_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'messaging_recipient_not_found'; END IF;
    -- Contact, not recipient row id: deleting/recreating a recipient cannot resend.
    v_key := 'broadcast:' || p_source_id || ':' || p_contact_id;
    SELECT template_name, template_language INTO v_template_name, v_language
      FROM public.broadcasts WHERE id = p_source_id AND account_id = p_account_id;
  ELSIF p_source_kind = 'automation' THEN
    PERFORM 1 FROM public.automations WHERE id = p_source_id AND account_id = p_account_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'messaging_automation_inactive'; END IF;
    PERFORM 1 FROM public.automation_logs l WHERE l.id = p_run_id AND l.automation_id = p_source_id
      AND l.account_id = p_account_id AND l.contact_id = p_contact_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'messaging_run_not_found'; END IF;
    SELECT * INTO v_step FROM public.automation_steps s WHERE s.id = p_step_id AND s.automation_id = p_source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'messaging_step_not_found'; END IF;
    v_key := 'automation:' || p_run_id || ':' || p_step_id;
    IF v_step.step_type = 'send_template' THEN
      v_template_name := v_step.step_config->>'template_name';
      v_language := COALESCE(v_step.step_config->>'language', 'en_US');
      IF NULLIF(v_template_name, '') IS NULL THEN RAISE EXCEPTION 'messaging_template_missing'; END IF;
    ELSIF v_step.step_type IN ('send_message', 'send_buttons', 'send_list') THEN v_category := 'service';
    ELSE RAISE EXCEPTION 'messaging_step_unsupported'; END IF;
  ELSE RAISE EXCEPTION 'messaging_source_invalid'; END IF;

  SELECT * INTO v_existing FROM public.messaging_delivery_ledger WHERE account_id = p_account_id AND operation_key = v_key;
  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash THEN RAISE EXCEPTION 'messaging_operation_payload_changed'; END IF;
    RETURN jsonb_build_object('claimed', FALSE, 'delivery_id', v_existing.id, 'outcome', v_existing.outcome);
  END IF;
  -- Refuse historical recipients previously handed to Meta by the old sender.
  IF p_source_kind = 'broadcast' AND EXISTS (SELECT 1 FROM public.broadcast_recipients r
    WHERE r.broadcast_id = p_source_id AND r.contact_id = p_contact_id
      AND (r.sent_at IS NOT NULL OR r.whatsapp_message_id IS NOT NULL OR r.provider_message_id IS NOT NULL OR r.attempt_count > 0
        OR r.status <> 'pending')) THEN RAISE EXCEPTION 'messaging_historical_attempt_requires_review'; END IF;
  IF v_template_name IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM public.message_templates t WHERE t.account_id = p_account_id
      AND t.name = v_template_name AND t.language = v_language AND t.status = 'APPROVED'
      AND NULLIF(t.meta_template_id, '') IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'messaging_template_not_approved'; END IF;
    SELECT lower(t.category) INTO v_category FROM public.message_templates t
      WHERE t.account_id = p_account_id AND t.name = v_template_name AND t.language = v_language AND t.status = 'APPROVED';
    -- Authentication can have international pricing. This rollout covers India
    -- marketing, utility, and in-window service only.
    IF v_category NOT IN ('marketing', 'utility') THEN RAISE EXCEPTION 'messaging_category_unsupported'; END IF;
  END IF;
  IF v_category IS NULL THEN RAISE EXCEPTION 'messaging_category_missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.contact_consents c WHERE c.account_id = p_account_id
    AND c.contact_id = p_contact_id AND c.channel = 'whatsapp' AND c.status = 'opted_out'
    AND c.category IN (v_category, 'service')) THEN RAISE EXCEPTION 'messaging_consent_opted_out'; END IF;
  IF v_category <> 'service' AND NOT EXISTS (
    SELECT 1 FROM public.contact_consents c WHERE c.account_id = p_account_id AND c.contact_id = p_contact_id
      AND c.channel = 'whatsapp' AND c.category = v_category AND c.status = 'opted_in'
      AND c.source ~ '[^[:space:]]' AND c.wording_version ~ '[^[:space:]]'
      AND c.consented_at IS NOT NULL AND c.consented_at <= NOW() AND c.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'messaging_documented_opt_in_required'; END IF;
  SELECT m.created_at, m.content_text INTO v_inbound, v_inbound_text
    FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.account_id = p_account_id AND c.contact_id = p_contact_id AND m.sender_type = 'customer'
      AND NULLIF(m.message_id, '') IS NOT NULL ORDER BY m.created_at DESC LIMIT 1;
  IF lower(COALESCE(v_inbound_text, '')) ~ '^[[:space:]]*(stop|unsubscribe|remove|cancel|opt[ -]?out|വേണ്ട|ഒഴിവാക്കുക)[[:space:]]*$'
    THEN RAISE EXCEPTION 'messaging_inbound_opt_out'; END IF;
  IF v_category = 'service' AND (v_inbound IS NULL OR v_inbound > NOW() OR v_inbound <= NOW() - INTERVAL '24 hours')
    THEN RAISE EXCEPTION 'messaging_service_window_closed'; END IF;
  SELECT COALESCE(SUM(reserved_paise), 0) INTO v_spent FROM public.messaging_delivery_ledger
    WHERE account_id = p_account_id AND budget_month = v_month;
  IF v_spent + v_policy.reservation_paise > v_policy.monthly_limit_paise THEN RAISE EXCEPTION 'messaging_monthly_budget_exhausted'; END IF;
  INSERT INTO public.messaging_delivery_ledger(account_id, approval_id, operation_key, source_kind, source_id,
    contact_id, payload_hash, budget_month, reserved_paise)
  VALUES (p_account_id, v_approval.id, v_key, p_source_kind, p_source_id,
    p_contact_id, p_payload_hash, v_month, v_policy.reservation_paise) RETURNING id INTO v_id;
  RETURN jsonb_build_object('claimed', TRUE, 'delivery_id', v_id,
    'reserved_paise', v_policy.reservation_paise, 'budget_month', v_month);
END $$;

CREATE OR REPLACE FUNCTION public.finish_messaging_delivery(
  p_account_id UUID, p_delivery_id UUID, p_outcome TEXT,
  p_provider_message_id TEXT DEFAULT NULL, p_result_code TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_row public.messaging_delivery_ledger%ROWTYPE;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('accepted', 'failed', 'uncertain') THEN RAISE EXCEPTION 'messaging_outcome_invalid'; END IF;
  IF p_result_code IS NOT NULL AND p_result_code !~ '^[A-Za-z0-9_.:-]{1,80}$' THEN RAISE EXCEPTION 'messaging_result_code_invalid'; END IF;
  SELECT * INTO v_row FROM public.messaging_delivery_ledger WHERE id = p_delivery_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'messaging_delivery_not_found'; END IF;
  IF v_row.outcome <> 'reserved' THEN
    IF v_row.outcome = p_outcome AND v_row.provider_message_id IS NOT DISTINCT FROM p_provider_message_id THEN RETURN; END IF;
    RAISE EXCEPTION 'messaging_result_already_recorded';
  END IF;
  UPDATE public.messaging_delivery_ledger SET outcome = p_outcome,
    provider_message_id = p_provider_message_id, result_code = p_result_code, finished_at = NOW()
    WHERE id = p_delivery_id AND account_id = p_account_id;
END $$;

REVOKE ALL ON FUNCTION public.messaging_source_fingerprint(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.messaging_source_fingerprint(UUID, TEXT, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.preview_messaging_approval(UUID, TEXT, UUID),
  public.approve_messaging_source(UUID, TEXT, UUID, TEXT), public.revoke_messaging_source(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_messaging_approval(UUID, TEXT, UUID),
  public.approve_messaging_source(UUID, TEXT, UUID, TEXT), public.revoke_messaging_source(UUID, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_messaging_delivery(UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, UUID),
  public.finish_messaging_delivery(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_messaging_delivery(UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, UUID),
  public.finish_messaging_delivery(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.messaging_budget_policies IS 'Managed delivery ceiling in paise; disabled until reviewed sender, rates and server integration are ready. Not a Meta prepaid balance or invoice guarantee.';
COMMENT ON TABLE public.messaging_source_approvals IS 'Protected approval of saved message, audience and policy terms; client-editable broadcasts.approval_status is not authoritative.';
COMMENT ON TABLE public.messaging_delivery_ledger IS 'Permanent attempt and budget reservation. Never auto-release or retry failed/uncertain/reserved rows. Provider acceptance is not delivery.';

NOTIFY pgrst, 'reload schema';
