-- Runtime API for the approved, saved snapshot. Applying this does not enable sending.
-- Snapshot and hash are returned together so a source edited during preparation
-- cannot substitute different content under an approved hash.

CREATE OR REPLACE FUNCTION public.messaging_source_snapshot(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET timezone = 'UTC' AS $$
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
  RETURN jsonb_build_object('source', v_source, 'children', v_children,
    'templates', v_templates, 'policy', v_policy, 'sender', v_sender);
END $$;

CREATE OR REPLACE FUNCTION public.messaging_source_fingerprint(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID
) RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT encode(sha256(convert_to(public.messaging_source_snapshot(p_account_id, p_source_kind, p_source_id)::text, 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.read_messaging_source(
  p_account_id UUID, p_source_kind TEXT, p_source_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_snapshot JSONB;
BEGIN
  v_snapshot := public.messaging_source_snapshot(p_account_id, p_source_kind, p_source_id);
  RETURN jsonb_build_object('snapshot', v_snapshot,
    'fingerprint', encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex'));
END $$;

CREATE OR REPLACE FUNCTION public.read_messaging_budget(p_account_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_policy public.messaging_budget_policies%ROWTYPE; v_reserved BIGINT; v_review INTEGER;
BEGIN
  IF NOT public.is_account_member(p_account_id) THEN RAISE EXCEPTION 'messaging_account_required'; END IF;
  SELECT * INTO v_policy FROM public.messaging_budget_policies WHERE account_id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'messaging_policy_missing'; END IF;
  SELECT COALESCE(SUM(reserved_paise),0), COUNT(*) FILTER (WHERE outcome IN ('reserved','uncertain'))
  INTO v_reserved, v_review FROM public.messaging_delivery_ledger
  WHERE account_id = p_account_id AND budget_month = date_trunc('month',NOW() AT TIME ZONE 'Asia/Kolkata')::date;
  RETURN jsonb_build_object('enabled',v_policy.enabled,'monthlyLimitPaise',v_policy.monthly_limit_paise,
    'reservedPaise',v_reserved,'remainingPaise',GREATEST(0,v_policy.monthly_limit_paise-v_reserved),
    'reservationPaise',v_policy.reservation_paise,'rateValidUntil',v_policy.rate_valid_until,
    'rateSource',v_policy.rate_source,'needsReviewCount',v_review,
    'phoneNumberId',v_policy.phone_number_id,'wabaId',v_policy.waba_id);
END $$;

ALTER TABLE public.messaging_budget_policies
  ADD COLUMN IF NOT EXISTS enabled_by UUID,
  ADD COLUMN IF NOT EXISTS enabled_at TIMESTAMPTZ;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS delivery_error TEXT;

-- Called only by the authenticated admin API after live provider checks.
-- HTTP callers never supply price/expiry; the reviewed server rate does.
CREATE OR REPLACE FUNCTION public.configure_messaging_budget(
  p_account_id UUID, p_actor_id UUID, p_enabled BOOLEAN, p_reservation_paise INTEGER,
  p_rate_source TEXT, p_rate_reviewed_at TIMESTAMPTZ, p_rate_valid_until TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=p_actor_id AND account_id=p_account_id
    AND account_role IN ('admin','owner')) THEN RAISE EXCEPTION 'messaging_admin_required'; END IF;
  PERFORM 1 FROM public.messaging_budget_policies WHERE account_id=p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'messaging_policy_missing'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'messaging_policy_invalid'; END IF;
  IF p_enabled THEN
    IF p_reservation_paise IS NULL OR p_reservation_paise < 1 OR p_reservation_paise > 100000
      OR p_rate_reviewed_at IS NULL OR p_rate_reviewed_at > NOW()
      OR p_rate_valid_until IS NULL OR p_rate_valid_until <= NOW()
      OR p_rate_valid_until > p_rate_reviewed_at + INTERVAL '31 days'
      OR p_rate_source IS NULL OR p_rate_source !~ '[^[:space:]]' THEN
      RAISE EXCEPTION 'messaging_rate_review_required';
    END IF;
    UPDATE public.messaging_budget_policies SET enabled=TRUE,reservation_paise=p_reservation_paise,
      rate_source=p_rate_source,rate_reviewed_at=p_rate_reviewed_at,rate_valid_until=p_rate_valid_until,
      enabled_by=p_actor_id,enabled_at=NOW() WHERE account_id=p_account_id;
  ELSE
    UPDATE public.messaging_budget_policies SET enabled=FALSE,enabled_by=p_actor_id,enabled_at=NOW()
    WHERE account_id=p_account_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.messaging_source_snapshot(UUID,TEXT,UUID),
  public.read_messaging_source(UUID,TEXT,UUID),
  public.configure_messaging_budget(UUID,UUID,BOOLEAN,INTEGER,TEXT,TIMESTAMPTZ,TIMESTAMPTZ)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_messaging_source(UUID,TEXT,UUID),
  public.configure_messaging_budget(UUID,UUID,BOOLEAN,INTEGER,TEXT,TIMESTAMPTZ,TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.read_messaging_budget(UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_messaging_budget(UUID) TO authenticated;


-- A waiting/resumed run cannot switch silently to a newly edited workflow.
ALTER TABLE public.automation_logs ADD COLUMN IF NOT EXISTS messaging_fingerprint TEXT;
CREATE OR REPLACE FUNCTION public.protect_messaging_run_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role') THEN
    IF TG_OP = 'INSERT' AND NEW.messaging_fingerprint IS NOT NULL THEN
      RAISE EXCEPTION 'messaging_run_server_only';
    ELSIF TG_OP = 'UPDATE' AND (
      NEW.messaging_fingerprint IS DISTINCT FROM OLD.messaging_fingerprint OR
      (OLD.messaging_fingerprint IS NOT NULL AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR
        NEW.automation_id IS DISTINCT FROM OLD.automation_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
      ))) THEN RAISE EXCEPTION 'messaging_run_server_only';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_messaging_run_identity ON public.automation_logs;
CREATE TRIGGER protect_messaging_run_identity BEFORE INSERT OR UPDATE ON public.automation_logs
FOR EACH ROW EXECUTE FUNCTION public.protect_messaging_run_identity();
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
      AND l.account_id = p_account_id AND l.contact_id = p_contact_id
      AND l.messaging_fingerprint = p_expected_fingerprint;
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

NOTIFY pgrst, 'reload schema';
