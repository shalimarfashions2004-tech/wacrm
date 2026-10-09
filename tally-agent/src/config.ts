export interface AgentConfig {
  tallyUrl: string;
  companyName: string;
  tallyRelease: string;
  maxResponseBytes?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface Period { start: string; end: string }
export interface Ledger { id: string; name: string; phone?: string; address?: string }
export interface VoucherLine { item?: string; quantity?: number; ratePaise?: number; valuePaise?: number }
export interface Voucher { id: string; number?: string; date: string; party?: string; grossValuePaise: number; lines: VoucherLine[] }
export interface StockItem { id: string; name: string; group?: string; unit?: string; quantity?: number; ratePaise?: number; valuePaise?: number }
export interface SyncPayload {
  company_name: string; company_fingerprint: string; tally_release: string;
  source_period_start: string; source_period_end: string;
  ledgers: Ledger[]; vouchers: Voucher[]; stock_items: StockItem[];
  counts: { ledgers: number; vouchers: number; stock_items: number };
  gross_value_paise: number; payload_sha256: string;
}
