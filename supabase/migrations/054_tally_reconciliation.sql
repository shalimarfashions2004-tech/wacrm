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
