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
