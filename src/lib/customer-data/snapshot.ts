export interface CustomerLifecycleSnapshot {
  key: string;
  label: string;
  customers: number;
  lifetimeGross: number;
  gross12m: number;
}

export interface CustomerSpendBandSnapshot {
  label: string;
  customers: number;
  lifetimeGross: number;
}

export interface ProductMixSnapshot {
  name: string;
  pieces: number;
  value: number;
}

/**
 * Aggregate-only reference data from the Shalimar sales exports.
 *
 * This is intentionally free of names, phone numbers, and addresses. It gives
 * the CRM a useful review surface before a private Excel import is approved.
 */
export const SHALIMAR_CUSTOMER_DATA_SNAPSHOT = {
  sourceAsOf: "2026-05-23",
  sourceWindow: "Apr 2024 – May 2026",
  sourceCustomerFile: "customer_master_2026-09-07.csv",
  sourceInvoiceFile: "sales_master_invoices.csv",
  excelWorkbookCount: 26,
  customerCount: 2353,
  invoiceRowCount: 8087,
  observed12mCustomers: 1551,
  observed24mCustomers: 323,
  verified36mCustomers: 0,
  blankPhoneCustomers: 70,
  multiNumberPhoneCustomers: 55,
  normalizedNameDuplicates: 1,
  lifecycle: [
    {
      key: "A_Active_Core",
      label: "Active core",
      customers: 164,
      lifetimeGross: 54177668,
      gross12m: 29030578.24,
    },
    {
      key: "B_Active_Light",
      label: "Active light",
      customers: 204,
      lifetimeGross: 7510087,
      gross12m: 4482462,
    },
    {
      key: "C_Slipping",
      label: "Slipping",
      customers: 228,
      lifetimeGross: 18825256,
      gross12m: 10006781.19,
    },
    {
      key: "D_Lapsed_12m",
      label: "Lapsed 12m",
      customers: 937,
      lifetimeGross: 31408481,
      gross12m: 16820557,
    },
    {
      key: "E_Dormant",
      label: "Dormant",
      customers: 820,
      lifetimeGross: 14769693,
      gross12m: 0,
    },
  ] satisfies CustomerLifecycleSnapshot[],
  spendBands: [
    { label: "Under ₹10k", customers: 872, lifetimeGross: 4176262 },
    { label: "₹10k–49,999", customers: 972, lifetimeGross: 22617456 },
    { label: "₹50k–99,999", customers: 253, lifetimeGross: 17666543 },
    { label: "₹1L–2.49L", customers: 164, lifetimeGross: 24849565 },
    { label: "₹2.5L–4.99L", customers: 64, lifetimeGross: 22282685 },
    { label: "₹5L+", customers: 28, lifetimeGross: 35098674 },
  ] satisfies CustomerSpendBandSnapshot[],
  productMix: [
    { name: "Baniyan set", pieces: 12384, value: 1980000 },
    { name: "Frock", pieces: 6942, value: 1710000 },
    { name: "Pattupavada", pieces: 2911, value: 1510000 },
    { name: "Dothi", pieces: 8232, value: 1340000 },
    { name: "S-shirt", pieces: 2162, value: 480000 },
    { name: "Jeans", pieces: 1579, value: 470000 },
  ] satisfies ProductMixSnapshot[],
} as const;

export function formatRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
