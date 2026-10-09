-- SHALIMAR: apply migrations 053-056 in Supabase SQL Editor
-- Do not edit credentials into this file.

-- Read-only Tally snapshots. The intake API is the only writer; dashboard
-- members can read snapshots through account-scoped RLS.
CREATE TABLE IF NOT EXISTS public.tally_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  company_name text NOT NULL CHECK (length(btrim(company_name)) BETWEEN 1 AND 200),
  company_fingerprint text NOT NULL CHECK (company_fingerprint ~ '^[a-f0-9]{64}$'),
  tally_release text NOT NULL CHECK (length(tally_release) BETWEEN 1 AND 100),
  source_period_start date NOT NULL,
  source_period_end date NOT NULL CHECK (source_period_end >= source_period_start),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','duplicate')),
  received_at timestamptz NOT NULL DEFAULT now(),
  counts jsonb NOT NULL DEFAULT '{"ledgers":0,"vouchers":0,"stock_items":0}'::jsonb,
  gross_value_paise bigint NOT NULL DEFAULT 0 CHECK (gross_value_paise BETWEEN 0 AND 99999999999999999),
  UNIQUE(account_id, payload_sha256),
  UNIQUE(id, account_id)
);
CREATE TABLE IF NOT EXISTS public.tally_sync_ledgers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 200), name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200), phone text, address text,
  FOREIGN KEY(run_id, account_id) REFERENCES public.tally_sync_runs(id, account_id) ON DELETE CASCADE, UNIQUE(run_id, source_id)
);
CREATE TABLE IF NOT EXISTS public.tally_sync_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 200), voucher_number text, voucher_date date NOT NULL, party text, gross_value_paise bigint NOT NULL CHECK (gross_value_paise BETWEEN -99999999999999999 AND 99999999999999999),
  FOREIGN KEY(run_id, account_id) REFERENCES public.tally_sync_runs(id, account_id) ON DELETE CASCADE, UNIQUE(run_id, source_id)
);
CREATE TABLE IF NOT EXISTS public.tally_sync_voucher_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL REFERENCES public.tally_sync_vouchers(id) ON DELETE CASCADE, run_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no BETWEEN 1 AND 1000), item text, quantity numeric, rate_paise bigint CHECK (rate_paise BETWEEN -99999999999999999 AND 99999999999999999), value_paise bigint CHECK (value_paise BETWEEN -99999999999999999 AND 99999999999999999),
  FOREIGN KEY(run_id, account_id) REFERENCES public.tally_sync_runs(id, account_id) ON DELETE CASCADE, UNIQUE(voucher_id, line_no)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tally_sync_vouchers_id_run_account_key') THEN
    ALTER TABLE public.tally_sync_vouchers ADD CONSTRAINT tally_sync_vouchers_id_run_account_key UNIQUE(id, run_id, account_id);
  END IF;
END $$;
ALTER TABLE public.tally_sync_voucher_lines DROP CONSTRAINT IF EXISTS tally_sync_voucher_lines_voucher_id_fkey;
ALTER TABLE public.tally_sync_voucher_lines ADD CONSTRAINT tally_sync_voucher_lines_voucher_run_account_fkey FOREIGN KEY (voucher_id, run_id, account_id) REFERENCES public.tally_sync_vouchers(id, run_id, account_id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS public.tally_sync_stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 200), name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200), item_group text, unit text, quantity numeric, rate_paise bigint CHECK (rate_paise BETWEEN -99999999999999999 AND 99999999999999999), value_paise bigint CHECK (value_paise BETWEEN -99999999999999999 AND 99999999999999999),
  FOREIGN KEY(run_id, account_id) REFERENCES public.tally_sync_runs(id, account_id) ON DELETE CASCADE, UNIQUE(run_id, source_id)
);
CREATE INDEX IF NOT EXISTS tally_sync_runs_account_received ON public.tally_sync_runs(account_id, received_at DESC);
CREATE INDEX IF NOT EXISTS tally_sync_ledgers_account_run ON public.tally_sync_ledgers(account_id, run_id);
CREATE INDEX IF NOT EXISTS tally_sync_vouchers_account_run ON public.tally_sync_vouchers(account_id, run_id);
CREATE INDEX IF NOT EXISTS tally_sync_stock_account_run ON public.tally_sync_stock_items(account_id, run_id);
ALTER TABLE public.tally_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_sync_stock_items ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY['tally_sync_runs','tally_sync_ledgers','tally_sync_vouchers','tally_sync_voucher_lines','tally_sync_stock_items']) LOOP EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I',t,t); EXECUTE format('CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated USING (is_account_member(account_id))',t,t); EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon',t); EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.tally_sync_ingest(p_account_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE run uuid; r jsonb; v uuid; n integer;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' OR jsonb_array_length(p_payload->'ledgers') > 50000 OR jsonb_array_length(p_payload->'vouchers') > 50000 OR jsonb_array_length(p_payload->'stock_items') > 50000 THEN RAISE EXCEPTION 'tally_sync_bounds'; END IF;
  IF (p_payload->'counts'->>'ledgers')::integer <> jsonb_array_length(p_payload->'ledgers') OR (p_payload->'counts'->>'vouchers')::integer <> jsonb_array_length(p_payload->'vouchers') OR (p_payload->'counts'->>'stock_items')::integer <> jsonb_array_length(p_payload->'stock_items') THEN RAISE EXCEPTION 'tally_sync_counts'; END IF;
  INSERT INTO tally_sync_runs(account_id,payload_sha256,company_name,company_fingerprint,tally_release,source_period_start,source_period_end,counts,gross_value_paise)
  VALUES(p_account_id,p_payload->>'payload_sha256',p_payload->>'company_name',p_payload->>'company_fingerprint',p_payload->>'tally_release',(p_payload->>'source_period_start')::date,(p_payload->>'source_period_end')::date,p_payload->'counts',(p_payload->>'gross_value_paise')::bigint) RETURNING id INTO run;
  FOR r IN SELECT value FROM jsonb_array_elements(p_payload->'ledgers') LOOP INSERT INTO tally_sync_ledgers(run_id,account_id,source_id,name,phone,address) VALUES(run,p_account_id,r->>'id',r->>'name',r->>'phone',r->>'address'); END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(p_payload->'vouchers') LOOP
    INSERT INTO tally_sync_vouchers(run_id,account_id,source_id,voucher_number,voucher_date,party,gross_value_paise) VALUES(run,p_account_id,r->>'id',r->>'number',(r->>'date')::date,r->>'party',(r->>'grossValuePaise')::bigint) RETURNING id INTO v;
    n:=0; FOR r IN SELECT value FROM jsonb_array_elements(r->'lines') LOOP n:=n+1; INSERT INTO tally_sync_voucher_lines(voucher_id,run_id,account_id,line_no,item,quantity,rate_paise,value_paise) VALUES(v,run,p_account_id,n,r->>'item',(r->>'quantity')::numeric,(r->>'ratePaise')::bigint,(r->>'valuePaise')::bigint); END LOOP;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(p_payload->'stock_items') LOOP INSERT INTO tally_sync_stock_items(run_id,account_id,source_id,name,item_group,unit,quantity,rate_paise,value_paise) VALUES(run,p_account_id,r->>'id',r->>'name',r->>'group',r->>'unit',(r->>'quantity')::numeric,(r->>'ratePaise')::bigint,(r->>'valuePaise')::bigint); END LOOP;
  RETURN (SELECT to_jsonb(x) FROM (SELECT id,status,received_at,counts FROM tally_sync_runs WHERE id=run) x);
END; $$;
REVOKE ALL ON FUNCTION public.tally_sync_ingest(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tally_sync_ingest(uuid,jsonb) TO service_role;

-- Deterministic reconciliation and report snapshots for read-only Tally intake.
ALTER TABLE public.tally_sync_runs
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending','reconciled','blocked')),
  ADD COLUMN IF NOT EXISTS reconciliation_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.tally_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[a-f0-9]{64}$'),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  coverage jsonb NOT NULL,
  currency text NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR')),
  metric_version text NOT NULL DEFAULT 'tally-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, account_id),
  FOREIGN KEY(run_id, account_id) REFERENCES public.tally_sync_runs(id, account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tally_report_snapshots_account_period
  ON public.tally_report_snapshots(account_id, period_start, period_end);
ALTER TABLE public.tally_report_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tally_report_snapshots_read ON public.tally_report_snapshots;
CREATE POLICY tally_report_snapshots_read ON public.tally_report_snapshots
  FOR SELECT TO authenticated USING (is_account_member(account_id));
REVOKE INSERT, UPDATE, DELETE ON public.tally_report_snapshots FROM authenticated, anon;
GRANT SELECT ON public.tally_report_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.tally_reconcile_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  run_row public.tally_sync_runs%ROWTYPE;
  expected_count integer;
  observed_count integer;
  expected_gross bigint;
  observed_gross bigint;
  observed_gross_numeric numeric;
  count_difference integer;
  gross_difference numeric;
  reasons jsonb := '[]'::jsonb;
  result_status text := 'reconciled';
  snapshot_id uuid;
BEGIN
  SELECT * INTO run_row FROM public.tally_sync_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tally_run_not_found'; END IF;
  IF NOT public.is_account_member(run_row.account_id, 'admin') THEN RAISE EXCEPTION 'tally_run_forbidden'; END IF;

  IF run_row.source_period_start IS NULL OR run_row.source_period_end IS NULL
     OR run_row.source_period_end < run_row.source_period_start THEN
    reasons := reasons || '["missing_period"]'::jsonb;
  END IF;
  expected_count := CASE WHEN jsonb_typeof(run_row.counts->'vouchers') = 'number'
    AND (run_row.counts->>'vouchers') ~ '^-?[0-9]+$'
    AND length(run_row.counts->>'vouchers') <= 9
    THEN (run_row.counts->>'vouchers')::integer ELSE NULL END;
  expected_gross := run_row.gross_value_paise;
  SELECT count(*)::integer, COALESCE(sum(gross_value_paise::numeric), 0)
    INTO observed_count, observed_gross_numeric
    FROM public.tally_sync_vouchers WHERE run_id = p_run_id AND account_id = run_row.account_id;
  IF abs(observed_gross_numeric) > 99999999999999999 THEN
    reasons := reasons || '["observed_gross_overflow"]'::jsonb;
    observed_gross := NULL;
  ELSE
    observed_gross := observed_gross_numeric::bigint;
  END IF;
  IF expected_count IS NULL OR expected_count < 0 THEN reasons := reasons || '["invalid_expected_count"]'::jsonb; END IF;
  IF expected_gross IS NULL OR expected_gross < 0 THEN reasons := reasons || '["invalid_expected_gross"]'::jsonb; END IF;
  count_difference := COALESCE(observed_count, 0) - COALESCE(expected_count, 0);
  gross_difference := CASE WHEN observed_gross IS NULL OR expected_gross IS NULL THEN NULL ELSE observed_gross - expected_gross END;
  IF expected_count IS NOT NULL AND expected_count >= 0 AND count_difference <> 0 THEN reasons := reasons || '["count_mismatch"]'::jsonb; END IF;
  IF expected_gross IS NOT NULL AND expected_gross >= 0 AND gross_difference IS NOT NULL AND gross_difference <> 0 THEN reasons := reasons || '["gross_mismatch"]'::jsonb; END IF;
  IF jsonb_array_length(reasons) > 0 THEN result_status := 'blocked'; END IF;

  UPDATE public.tally_sync_runs SET reconciliation_status = result_status,
    reconciliation_reason_codes = reasons,
    reconciled_at = CASE WHEN result_status = 'reconciled' THEN now() ELSE NULL END
    WHERE id = p_run_id;
  IF result_status = 'reconciled' THEN
    INSERT INTO public.tally_report_snapshots
      (run_id, account_id, source_checksum, period_start, period_end, coverage, currency, metric_version)
    VALUES (p_run_id, run_row.account_id, run_row.payload_sha256, run_row.source_period_start,
      run_row.source_period_end,
      jsonb_build_object('voucher_count', observed_count, 'gross_value_paise', observed_gross),
      'INR', 'tally-v1')
    ON CONFLICT (run_id, account_id) DO NOTHING
    RETURNING id INTO snapshot_id;
    IF snapshot_id IS NULL THEN SELECT id INTO snapshot_id FROM public.tally_report_snapshots WHERE run_id = p_run_id AND account_id = run_row.account_id; END IF;
  END IF;
  RETURN jsonb_build_object(
    'runId', p_run_id, 'status', result_status,
    'expectedCount', expected_count, 'observedCount', observed_count,
    'expectedGrossValuePaise', expected_gross, 'observedGrossValuePaise', observed_gross,
    'countDifference', count_difference, 'grossDifferencePaise', gross_difference,
    'reasonCodes', reasons, 'snapshotId', snapshot_id);
END; $$;
REVOKE ALL ON FUNCTION public.tally_reconcile_run(uuid) FROM PUBLIC, anon;
-- Authenticated callers may invoke the function, but the function itself enforces admin role.
GRANT EXECUTE ON FUNCTION public.tally_reconcile_run(uuid) TO authenticated, service_role;

-- Account-scoped Tally identity decisions. New-shop Tally data is kept separate
-- from the historical customer_data_imports reconciliation path.
CREATE TABLE IF NOT EXISTS public.tally_identity_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ledger_source_id text NOT NULL CHECK (length(btrim(ledger_source_id)) BETWEEN 1 AND 200),
  source_scope text NOT NULL DEFAULT 'new_shop_tally' CHECK (source_scope = 'new_shop_tally'),
  ledger_name text NOT NULL CHECK (length(btrim(ledger_name)) BETWEEN 1 AND 200),
  ledger_phone text,
  normalized_phone text CHECK (normalized_phone IS NULL OR normalized_phone ~ '^91[6-9][0-9]{9}$'),
  status text NOT NULL CHECK (status IN ('auto_matched','manual_review','blocked','resolved')),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, account_id, ledger_source_id),
  FOREIGN KEY(run_id, account_id) REFERENCES public.tally_sync_runs(id, account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tally_identity_matches_queue ON public.tally_identity_matches(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tally_identity_matches_contact ON public.tally_identity_matches(account_id, contact_id) WHERE contact_id IS NOT NULL;
ALTER TABLE public.tally_identity_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tally_identity_matches_read ON public.tally_identity_matches;
CREATE POLICY tally_identity_matches_read ON public.tally_identity_matches
  FOR SELECT TO authenticated USING (is_account_member(account_id));
REVOKE INSERT, UPDATE, DELETE ON public.tally_identity_matches FROM authenticated, anon;
GRANT SELECT ON public.tally_identity_matches TO authenticated;

-- The intake/service process may enqueue a decision, but cannot create one for
-- another account. This function never writes contact_consents or suppression.
CREATE OR REPLACE FUNCTION public.queue_tally_identity_match(
  p_run_id uuid, p_ledger_source_id text, p_ledger_name text, p_ledger_phone text,
  p_normalized_phone text, p_status text, p_contact_id uuid, p_evidence jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a uuid; match_id uuid;
BEGIN
  SELECT account_id INTO a FROM public.tally_sync_runs WHERE id = p_run_id;
  IF a IS NULL OR p_status NOT IN ('auto_matched','manual_review','blocked')
    OR p_ledger_source_id IS NULL OR p_ledger_name IS NULL THEN RAISE EXCEPTION 'tally_identity_invalid'; END IF;
  IF p_contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id=p_contact_id AND account_id=a) THEN RAISE EXCEPTION 'tally_identity_contact_mismatch'; END IF;
  INSERT INTO public.tally_identity_matches(run_id,account_id,ledger_source_id,ledger_name,ledger_phone,normalized_phone,status,contact_id,evidence)
  VALUES(p_run_id,a,p_ledger_source_id,p_ledger_name,p_ledger_phone,p_normalized_phone,p_status,p_contact_id,coalesce(p_evidence,'[]'::jsonb))
  ON CONFLICT(run_id,account_id,ledger_source_id) DO UPDATE SET ledger_name=excluded.ledger_name, ledger_phone=excluded.ledger_phone,
    normalized_phone=excluded.normalized_phone, status=excluded.status, contact_id=excluded.contact_id, evidence=excluded.evidence
  RETURNING id INTO match_id;
  RETURN match_id;
END; $$;
REVOKE ALL ON FUNCTION public.queue_tally_identity_match(uuid,text,text,text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_tally_identity_match(uuid,text,text,text,text,text,uuid,jsonb) TO service_role;

-- Only owners/admins can resolve a queued identity, and only to a contact in
-- the same account. Resolution is an identity link, never consent.
CREATE OR REPLACE FUNCTION public.resolve_tally_identity_match(p_match_id uuid, p_contact_id uuid)
RETURNS public.tally_identity_matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a uuid; result public.tally_identity_matches;
BEGIN
  SELECT account_id INTO a FROM public.profiles WHERE user_id=auth.uid() AND account_role IN ('owner','admin');
  IF a IS NULL THEN RAISE EXCEPTION 'tally_identity_admin_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id=p_contact_id AND account_id=a) THEN RAISE EXCEPTION 'tally_identity_contact_mismatch'; END IF;
  UPDATE public.tally_identity_matches SET contact_id=p_contact_id,status='resolved',resolved_by=auth.uid(),resolved_at=now()
    WHERE id=p_match_id AND account_id=a AND status IN ('manual_review','blocked') RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'tally_identity_review_not_found'; END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_tally_identity_match(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_tally_identity_match(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Read-only, account-scoped report sources. Application queries always add account_id
-- and reconciliation_status='reconciled'; blocked runs remain available to the sync UI.
CREATE OR REPLACE VIEW public.tally_reconciled_vouchers WITH (security_invoker = true) AS
SELECT v.account_id, v.run_id, v.id, v.source_id, v.voucher_date, v.party,
       v.gross_value_paise, r.source_period_start, r.source_period_end,
       r.received_at, r.reconciliation_status, s.id AS snapshot_id,
       s.coverage, s.currency
FROM public.tally_sync_vouchers v
JOIN public.tally_sync_runs r ON r.id = v.run_id AND r.account_id = v.account_id
JOIN public.tally_report_snapshots s ON s.run_id = r.id AND s.account_id = r.account_id
WHERE r.reconciliation_status = 'reconciled';
CREATE OR REPLACE VIEW public.tally_reconciled_lines WITH (security_invoker = true) AS
SELECT l.account_id, l.run_id, l.voucher_id, l.line_no, l.item,
       l.quantity, l.rate_paise, l.value_paise, v.voucher_date, v.party,
       v.gross_value_paise
FROM public.tally_sync_voucher_lines l
JOIN public.tally_reconciled_vouchers v ON v.id = l.voucher_id AND v.run_id = l.run_id AND v.account_id = l.account_id;
CREATE OR REPLACE VIEW public.tally_reconciled_stock WITH (security_invoker = true) AS
SELECT s.account_id, s.run_id, s.source_id, s.name, s.item_group, s.unit,
       s.quantity, s.rate_paise, s.value_paise, r.source_period_end,
       r.received_at, r.reconciliation_status
FROM public.tally_sync_stock_items s
JOIN public.tally_sync_runs r ON r.id = s.run_id AND r.account_id = s.account_id
JOIN public.tally_report_snapshots p ON p.run_id = r.id AND p.account_id = r.account_id
WHERE r.reconciliation_status = 'reconciled';
GRANT SELECT ON public.tally_reconciled_vouchers, public.tally_reconciled_lines, public.tally_reconciled_stock TO authenticated;

-- Verification readback
SELECT 'tally_sync_runs' AS object, to_regclass('public.tally_sync_runs') IS NOT NULL AS installed
UNION ALL SELECT 'tally_report_snapshots', to_regclass('public.tally_report_snapshots') IS NOT NULL
UNION ALL SELECT 'tally_identity_matches', to_regclass('public.tally_identity_matches') IS NOT NULL
UNION ALL SELECT 'tally_reconciled_vouchers', to_regclass('public.tally_reconciled_vouchers') IS NOT NULL
UNION ALL SELECT 'tally_reconciled_lines', to_regclass('public.tally_reconciled_lines') IS NOT NULL
UNION ALL SELECT 'tally_reconciled_stock', to_regclass('public.tally_reconciled_stock') IS NOT NULL;
