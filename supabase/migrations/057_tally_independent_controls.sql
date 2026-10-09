-- Independent controls for Tally reports. Legacy snapshots remain retained, but
-- they are not accepted by the v2 report gate because their payload was only
-- reconciled against itself.
ALTER TABLE public.tally_sync_runs
  ADD COLUMN IF NOT EXISTS control_totals jsonb;

ALTER TABLE public.tally_sync_runs
  DROP CONSTRAINT IF EXISTS tally_sync_runs_control_totals_valid;
ALTER TABLE public.tally_sync_runs
  ADD CONSTRAINT tally_sync_runs_control_totals_valid CHECK (
    control_totals IS NULL OR (
      jsonb_typeof(control_totals) = 'object'
      AND control_totals->>'source' = 'tally_sales_register'
      AND control_totals->>'collection_method' = 'operator_readback'
      AND control_totals->>'metric_scope' = 'posted_sales_gross_v1'
      AND jsonb_typeof(control_totals->'voucher_count') = 'number'
      AND (control_totals->>'voucher_count') ~ '^[0-9]+$'
      AND (control_totals->>'voucher_count')::bigint BETWEEN 0 AND 50000
      AND jsonb_typeof(control_totals->'gross_value_paise') = 'number'
      AND (control_totals->>'gross_value_paise') ~ '^[0-9]+$'
      AND (control_totals->>'gross_value_paise')::bigint BETWEEN 0 AND 99999999999999999
      AND control_totals ? 'period_start'
      AND control_totals ? 'period_end'
      AND control_totals ? 'captured_at'
      AND (control_totals->>'captured_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      AND (control_totals->>'period_start')::date = source_period_start
      AND (control_totals->>'period_end')::date = source_period_end
    )
  );

CREATE OR REPLACE FUNCTION public.tally_sync_ingest(p_account_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE run uuid; r jsonb; v uuid; n integer;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' OR jsonb_array_length(p_payload->'ledgers') > 50000 OR jsonb_array_length(p_payload->'vouchers') > 50000 OR jsonb_array_length(p_payload->'stock_items') > 50000 THEN RAISE EXCEPTION 'tally_sync_bounds'; END IF;
  IF (p_payload->'counts'->>'ledgers')::integer <> jsonb_array_length(p_payload->'ledgers') OR (p_payload->'counts'->>'vouchers')::integer <> jsonb_array_length(p_payload->'vouchers') OR (p_payload->'counts'->>'stock_items')::integer <> jsonb_array_length(p_payload->'stock_items') THEN RAISE EXCEPTION 'tally_sync_counts'; END IF;
  INSERT INTO tally_sync_runs(account_id,payload_sha256,company_name,company_fingerprint,tally_release,source_period_start,source_period_end,counts,gross_value_paise,control_totals)
  VALUES(p_account_id,p_payload->>'payload_sha256',p_payload->>'company_name',p_payload->>'company_fingerprint',p_payload->>'tally_release',(p_payload->>'source_period_start')::date,(p_payload->>'source_period_end')::date,p_payload->'counts',(p_payload->>'gross_value_paise')::bigint,p_payload->'control_totals') RETURNING id INTO run;
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

CREATE OR REPLACE FUNCTION public.tally_reconcile_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  run_row public.tally_sync_runs%ROWTYPE;
  payload_count integer;
  expected_count integer;
  observed_count integer;
  payload_gross bigint;
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

  IF run_row.source_period_start IS NULL OR run_row.source_period_end IS NULL OR run_row.source_period_end < run_row.source_period_start THEN
    reasons := reasons || '["missing_period"]'::jsonb;
  END IF;
  IF run_row.control_totals IS NULL THEN
    reasons := reasons || '["missing_control_totals"]'::jsonb;
  ELSIF run_row.control_totals->>'source' <> 'tally_sales_register' OR run_row.control_totals->>'collection_method' <> 'operator_readback' OR run_row.control_totals->>'metric_scope' <> 'posted_sales_gross_v1' OR NOT (run_row.control_totals ? 'voucher_count') OR NOT (run_row.control_totals ? 'gross_value_paise') OR NOT (run_row.control_totals ? 'period_start') OR NOT (run_row.control_totals ? 'period_end') OR NOT (run_row.control_totals ? 'captured_at') OR (run_row.control_totals->>'captured_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN
    reasons := reasons || '["invalid_control_totals"]'::jsonb;
  ELSIF (run_row.control_totals->>'period_start')::date <> run_row.source_period_start OR (run_row.control_totals->>'period_end')::date <> run_row.source_period_end THEN
    reasons := reasons || '["control_period_mismatch"]'::jsonb;
  ELSE
    expected_count := (run_row.control_totals->>'voucher_count')::integer;
    expected_gross := (run_row.control_totals->>'gross_value_paise')::bigint;
  END IF;

  IF jsonb_typeof(run_row.counts->'vouchers') = 'number' AND (run_row.counts->>'vouchers') ~ '^[0-9]+$' AND length(run_row.counts->>'vouchers') <= 9 THEN payload_count := (run_row.counts->>'vouchers')::integer; END IF;
  payload_gross := run_row.gross_value_paise;
  SELECT count(*)::integer, COALESCE(sum(gross_value_paise::numeric), 0) INTO observed_count, observed_gross_numeric FROM public.tally_sync_vouchers WHERE run_id = p_run_id AND account_id = run_row.account_id;
  IF abs(observed_gross_numeric) > 99999999999999999 THEN reasons := reasons || '["observed_gross_overflow"]'::jsonb; observed_gross := NULL; ELSE observed_gross := observed_gross_numeric::bigint; END IF;

  IF expected_count IS NULL OR expected_count < 0 THEN reasons := reasons || '["invalid_expected_count"]'::jsonb; END IF;
  IF expected_gross IS NULL OR expected_gross < 0 THEN reasons := reasons || '["invalid_expected_gross"]'::jsonb; END IF;
  IF expected_count IS NOT NULL AND payload_count IS DISTINCT FROM expected_count THEN reasons := reasons || '["payload_control_count_mismatch"]'::jsonb; END IF;
  IF expected_gross IS NOT NULL AND payload_gross IS DISTINCT FROM expected_gross THEN reasons := reasons || '["payload_control_gross_mismatch"]'::jsonb; END IF;
  count_difference := CASE WHEN expected_count IS NULL THEN NULL ELSE observed_count - expected_count END;
  gross_difference := CASE WHEN observed_gross IS NULL OR expected_gross IS NULL THEN NULL ELSE observed_gross - expected_gross END;
  IF expected_count IS NOT NULL AND count_difference <> 0 THEN reasons := reasons || '["count_mismatch"]'::jsonb; END IF;
  IF expected_gross IS NOT NULL AND gross_difference IS NOT NULL AND gross_difference <> 0 THEN reasons := reasons || '["gross_mismatch"]'::jsonb; END IF;
  IF jsonb_array_length(reasons) > 0 THEN result_status := 'blocked'; END IF;

  UPDATE public.tally_sync_runs SET reconciliation_status = result_status, reconciliation_reason_codes = reasons, reconciled_at = CASE WHEN result_status = 'reconciled' THEN now() ELSE NULL END WHERE id = p_run_id;
  IF result_status = 'reconciled' THEN
    INSERT INTO public.tally_report_snapshots (run_id, account_id, source_checksum, period_start, period_end, coverage, currency, metric_version)
    VALUES (p_run_id, run_row.account_id, run_row.payload_sha256, run_row.source_period_start, run_row.source_period_end, jsonb_build_object('voucher_count', observed_count, 'gross_value_paise', observed_gross, 'control_source', run_row.control_totals->>'source', 'control_captured_at', run_row.control_totals->>'captured_at', 'metric_scope', run_row.control_totals->>'metric_scope'), 'INR', 'tally-v2')
    ON CONFLICT (run_id, account_id) DO NOTHING RETURNING id INTO snapshot_id;
    IF snapshot_id IS NULL THEN SELECT id INTO snapshot_id FROM public.tally_report_snapshots WHERE run_id = p_run_id AND account_id = run_row.account_id; END IF;
  END IF;
  RETURN jsonb_build_object('runId', p_run_id, 'status', result_status, 'expectedCount', expected_count, 'observedCount', observed_count, 'expectedGrossValuePaise', expected_gross, 'observedGrossValuePaise', observed_gross, 'countDifference', count_difference, 'grossDifferencePaise', gross_difference, 'reasonCodes', reasons, 'snapshotId', snapshot_id);
END; $$;
REVOKE ALL ON FUNCTION public.tally_reconcile_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tally_reconcile_run(uuid) TO authenticated, service_role;
