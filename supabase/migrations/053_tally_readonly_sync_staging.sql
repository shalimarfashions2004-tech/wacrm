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
