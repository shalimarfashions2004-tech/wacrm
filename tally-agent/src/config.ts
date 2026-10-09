export interface AgentConfig {
  tallyUrl: string;
  companyName: string;
  tallyRelease: string;
  maxResponseBytes?: number;
  requestTimeoutMs?: number;
  onProgress?: (message: string) => void;
  crmSyncEndpoint?: string;
  crmApiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface Period { start: string; end: string }
export interface SalesControls {
  source: 'tally_sales_register';
  collection_method: 'operator_readback';
  metric_scope: 'posted_sales_gross_v1';
  voucher_count: number;
  gross_value_paise: number;
  period_start: string;
  period_end: string;
  captured_at: string;
}
export interface Ledger { id: string; name: string; phone?: string; address?: string }
export interface VoucherLine { item?: string; quantity?: number; ratePaise?: number; valuePaise?: number }
export interface Voucher { id: string; number?: string; date: string; party?: string; voucherType?: string; isSales: boolean; isCancelled: boolean; isOptional: boolean; grossValuePaise: number; lines: VoucherLine[] }
export interface StockItem { id: string; name: string; group?: string; unit?: string; quantity?: number; ratePaise?: number; valuePaise?: number }
export interface SyncPayload {
  company_name: string; company_fingerprint: string; tally_release: string;
  source_period_start: string; source_period_end: string;
  ledgers: Ledger[]; vouchers: Voucher[]; stock_items: StockItem[];
  counts: { ledgers: number; vouchers: number; stock_items: number };
  gross_value_paise: number; metric_scope: 'posted_sales_gross_v1'; control_totals?: SalesControls; payload_sha256: string;
}
