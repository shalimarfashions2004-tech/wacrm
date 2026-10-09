-- Legacy Tally runs were reconciled only against their own payload. Retain
-- their rows and old snapshots for audit, but remove their report-ready state.
UPDATE public.tally_sync_runs
SET reconciliation_status = 'blocked',
    reconciliation_reason_codes = CASE
      WHEN reconciliation_reason_codes @> '["missing_control_totals"]'::jsonb THEN reconciliation_reason_codes
      ELSE reconciliation_reason_codes || '["missing_control_totals"]'::jsonb
    END,
    reconciled_at = NULL
WHERE control_totals IS NULL
  AND reconciliation_status = 'reconciled';
