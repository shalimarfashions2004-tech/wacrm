-- Operator setup for the EXISTING, owner-confirmed Shalimar connection only.
-- Never prints, reads, or changes access tokens. Never changes registration.
DO $$
DECLARE v_account UUID; v_matches INTEGER; v_policy public.messaging_budget_policies%ROWTYPE;
BEGIN
  SELECT COUNT(*) INTO v_matches FROM public.whatsapp_config
    WHERE phone_number_id = '1391671597361924' AND waba_id = '28787952197487898';
  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'Setup stopped: expected one saved Shalimar sender connection, found %. Check the Supabase project and saved Phone Number ID/WABA ID. No settings were changed.', v_matches;
  END IF;
  SELECT account_id INTO v_account FROM public.whatsapp_config
    WHERE phone_number_id = '1391671597361924' AND waba_id = '28787952197487898';
  INSERT INTO public.messaging_budget_policies(account_id, monthly_limit_paise, phone_number_id, waba_id)
    VALUES (v_account, 100000, '1391671597361924', '28787952197487898')
    ON CONFLICT (account_id) DO NOTHING;
  SELECT * INTO v_policy FROM public.messaging_budget_policies WHERE account_id = v_account;
  IF v_policy.phone_number_id <> '1391671597361924' OR v_policy.waba_id <> '28787952197487898'
    OR v_policy.monthly_limit_paise <> 100000 OR v_policy.enabled THEN
    RAISE EXCEPTION 'Setup stopped: an existing policy differs from this disabled INR 1000 setup. Review it without overwriting it.';
  END IF;
END $$;

-- Share only this result row. No credentials or customer data are selected.
SELECT
  '050 installed'::text AS migration,
  (p.monthly_limit_paise / 100)::int AS monthly_limit_inr,
  COALESCE((SELECT SUM(l.reserved_paise) FROM public.messaging_delivery_ledger l
    WHERE l.account_id = p.account_id
      AND l.budget_month = date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata')::date), 0) / 100.0 AS reserved_this_month_inr,
  'Asia/Kolkata calendar month'::text AS budget_period,
  CASE WHEN p.enabled THEN 'ON' ELSE 'OFF' END AS managed_delivery,
  CASE WHEN p.reservation_paise IS NULL OR p.rate_valid_until IS NULL OR p.rate_valid_until <= NOW()
    THEN 'Required before activation' ELSE 'Configured; verify before activation' END AS rate_review,
  'Required separately for each saved campaign or workflow'::text AS approval
FROM public.messaging_budget_policies p
WHERE p.phone_number_id = '1391671597361924' AND p.waba_id = '28787952197487898';
