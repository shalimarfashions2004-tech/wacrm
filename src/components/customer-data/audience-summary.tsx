import Link from 'next/link';
import type { CustomerAudienceReceipt } from '@/lib/customer-data/audience';

const reasons: Record<string, string> = {
  phone_review: 'Number or identity review',
  not_linked: 'Not linked to Contacts',
  contact_changed: 'Contact identity changed since import',
  contact_number_format: 'Existing Contact needs country-code review',
  outside_segment: 'Outside this purchase segment',
  language_unknown: 'Language unknown',
  other_language: 'Different language',
  opted_out: 'Opted out',
  permission_missing: 'Marketing permission missing',
  excluded_tag: 'Excluded by tag',
};
export function CustomerAudienceSummary({
  receipt,
  error,
  loading,
}: {
  receipt: CustomerAudienceReceipt | null;
  error: string;
  loading: boolean;
}) {
  return (
    <div
      className="border-primary/30 bg-primary/5 space-y-2 rounded-2xl border p-4 text-sm"
      aria-live="polite"
    >
      {loading ? (
        <p>Checking saved customers and permission…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : receipt ? (
        <>
          <p className="font-medium">
            {receipt.eligible.toLocaleString()} eligible ·{' '}
            {receipt.excluded.toLocaleString()} excluded from{' '}
            {receipt.total.toLocaleString()} rows
          </p>
          <p className="text-muted-foreground text-xs">
            Historical source: {receipt.source_start} to {receipt.source_as_of}.
            Purchase segments use this source date; they do not describe live
            Tally sales.
          </p>
          <ul className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
            {Object.entries(receipt.reasons).map(([key, count]) => (
              <li key={key}>
                {reasons[key] ?? key}: {count.toLocaleString()}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {receipt.segment_rules}
          </p>
        </>
      ) : (
        <p>Import and review a customer list to calculate real reach.</p>
      )}
      <Link
        href="/contacts/data-sheet"
        className="inline-block text-xs underline"
      >
        Review numbers, language and permission in Customer Data
      </Link>
      <p className="text-muted-foreground text-xs">
        Preparing freezes the source and recipients for campaign approval. It
        does not send.
      </p>
    </div>
  );
}
