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
