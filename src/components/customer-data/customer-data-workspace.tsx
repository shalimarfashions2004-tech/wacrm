'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CUSTOMER_IMPORT_MAX_BYTES,
  parseCustomerImport,
  type CustomerImportPreview,
  type CustomerImportRow,
  type CustomerLanguage,
} from '@/lib/customer-data/import';
import { SHALIMAR_INTRO_TEMPLATES } from '@/lib/whatsapp/shalimar-templates';

interface SavedRow extends CustomerImportRow {
  id: string;
  contact_id: string | null;
  permission: string;
}
interface SavedImport {
  id: string;
  source_name: string;
  source_start: string;
  source_as_of: string;
  row_count: number;
  ready_count: number;
  contacts_published_at: string | null;
}
interface CustomerPage {
  run: SavedImport | null;
  rows: SavedRow[];
  total: number;
}
const selectClass =
  'border-border bg-card text-foreground h-10 rounded-xl border px-3 text-sm';
const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
const stateLabel = (state: string) => state.replaceAll('_', ' ');

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'This action could not be completed.');
  return data;
}

/** Private records stay in component memory. No public files or browser storage. */
export function CustomerDataWorkspace() {
  const { accountId, canEditSettings } = useAuth();
  return accountId ? (
    <Workspace key={accountId} admin={canEditSettings} />
  ) : null;
}

function Workspace({ admin }: { admin: boolean }) {
  const [data, setData] = useState<CustomerPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [file, setFile] = useState<{
    name: string;
    csv: string;
    preview: CustomerImportPreview;
  } | null>(null);
  const [selected, setSelected] = useState<SavedRow | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      q: query,
      review: String(reviewOnly),
    });
    fetch(`/api/customer-data?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then((value) => {
        setData(value);
        setError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Customer data could not be read.'
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, query, reviewOnly, revision]);
  const refresh = () => setRevision((value) => value + 1);

  async function chooseFile(chosen: File | undefined) {
    setFile(null);
    if (!chosen) return;
    try {
      if (chosen.size > CUSTOMER_IMPORT_MAX_BYTES)
        throw new Error('Use a CSV smaller than 2 MB.');
      const csv = await chosen.text();
      setFile({ name: chosen.name, csv, preview: parseCustomerImport(csv) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function saveImport() {
    if (!file || busy) return;
    setBusy(true);
    try {
      await post('/api/customer-data', {
        action: 'import',
        filename: file.name,
        csv: file.csv,
      });
      toast.success(
        'Historical data saved privately. Review the numbers before adding Contacts.'
      );
      setFile(null);
      setPage(0);
      setSearch('');
      setQuery('');
      setReviewOnly(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!data?.run || busy) return;
    setBusy(true);
    try {
      const { result } = await post('/api/customer-data', {
        action: 'publish_contacts',
        importId: data.run.id,
      });
      toast.success(
        `${result.created} new Contacts; ${result.linked} rows linked; ${result.conflicts} identity conflicts held for review. No messages sent.`
      );
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Customer import and review
          </CardTitle>
          <CardDescription>
            Import the prepared historical CSV, review each customer’s language
            and permission, then build a campaign. A usable phone number is not
            proof of a WhatsApp account or marketing permission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
            >
              {error}
            </p>
          )}
          {admin && (
            <div className="space-y-3 rounded-2xl border p-4">
              <label
                htmlFor="customer-import"
                className="block text-sm font-medium"
              >
                1. Select the reviewed customer-data CSV
              </label>
              <Input
                id="customer-import"
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => void chooseFile(e.target.files?.[0])}
              />
              <p className="text-muted-foreground text-xs">
                Maximum 5,000 rows / 2 MB. Original sales files stay untouched.
                Permission cannot be imported from purchase history.
              </p>
              {file && (
                <div className="space-y-3" aria-live="polite">
                  <p className="text-sm">
                    {file.preview.summary.total.toLocaleString()} customer rows:{' '}
                    {file.preview.summary.ready.toLocaleString()} usable
                    numbers; {file.preview.summary.review.toLocaleString()} held
                    for review.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Source window: {file.preview.source_start} to{' '}
                    {file.preview.source_as_of}. This is historical data, not a
                    live Tally connection.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {Object.entries(file.preview.summary.reasons)
                      .filter(([key]) => key !== 'ready')
                      .map(([key, count]) => `${stateLabel(key)}: ${count}`)
                      .join(' · ')}
                  </p>
                  <Button onClick={() => void saveImport()} disabled={busy}>
                    Save reviewed data privately
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={refresh}
              disabled={loading || busy}
            >
              <RefreshCw className="size-4" />
              Refresh saved data
            </Button>
            {loading && (
              <span role="status" className="text-muted-foreground text-sm">
                Checking saved customer data…
              </span>
            )}
          </div>
          {data?.run ? (
            <div className="bg-card-2 space-y-3 rounded-2xl p-4">
              <p className="text-sm font-medium">
                {data.run.row_count.toLocaleString()} saved rows ·{' '}
                {data.run.ready_count.toLocaleString()} usable numbers
              </p>
              <p className="text-muted-foreground text-xs">
                {data.run.source_name} · {data.run.source_start} to{' '}
                {data.run.source_as_of}
              </p>
              <p className="text-muted-foreground text-sm">
                2. Add usable rows to Contacts. Existing names must match before
                linking; conflicts remain in review. Existing opt-outs stay
                blocked.
              </p>
              <div className="flex flex-wrap gap-2">
                {admin && (
                  <Button
                    onClick={() => void publish()}
                    disabled={busy || !!error || loading}
                  >
                    <Users className="size-4" />
                    Add / link reviewed Contacts
                  </Button>
                )}
                <Link
                  href={`/broadcasts/new?source=customer-data&import=${data.run.id}`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Build a customer-data campaign
                </Link>
              </div>
              <p className="text-muted-foreground text-xs">
                This creates Contacts without sending or granting permission.
                Broadcast reach stays zero until language and separate
                permission evidence are recorded.
              </p>
            </div>
          ) : (
            !loading &&
            !error && (
              <p className="text-muted-foreground text-sm">
                No customer import is saved in this workspace yet. Select the
                prepared CSV above.
              </p>
            )
          )}
        </CardContent>
      </Card>

      {data?.run && (
        <Card>
          <CardHeader>
            <CardTitle>Customer numbers, purchases and permission</CardTitle>
            <CardDescription>
              Search the private list. “Review” opens language and evidence
              fields; it does not send a message. Correct phone conflicts in the
              source file and upload a new reviewed version.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                aria-label="Search customer name or phone"
                placeholder="Search name or number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewOnly}
                  onChange={(e) => {
                    setReviewOnly(e.target.checked);
                    setPage(0);
                  }}
                />
                Only phone / identity review
              </label>
            </div>
            <div className="overflow-x-auto" aria-busy={loading}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'Customer',
                      'Number / review',
                      'Purchase history',
                      'Language',
                      'Marketing permission',
                      '',
                    ].map((label, i) => (
                      <TableHead key={i}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-56 whitespace-normal">
                        {row.name}
                      </TableCell>
                      <TableCell>
                        <p>
                          {row.phone
                            ? `+${row.phone}`
                            : row.raw_phone || 'No number'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {stateLabel(row.phone_state)}
                          {row.contact_id ? ' · linked' : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>
                          {money(row.lifetime_gross_paise)} · {row.orders}{' '}
                          orders
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Last: {row.last_order} · 12m:{' '}
                          {money(row.gross_12m_paise)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {row.language === 'en'
                          ? 'English'
                          : row.language === 'ml'
                            ? 'മലയാളം'
                            : 'Unknown'}
                      </TableCell>
                      <TableCell>{stateLabel(row.permission)}</TableCell>
                      <TableCell>
                        {admin && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={loading || !!error || busy}
                            onClick={() => setSelected(row)}
                          >
                            Review
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                {data.total.toLocaleString()} matching rows · page {page + 1} of{' '}
                {Math.max(1, Math.ceil(data.total / 100))}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page === 0 || loading}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={(page + 1) * 100 >= data.total || loading}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>English and Malayalam image introductions</CardTitle>
          <CardDescription>
            Review these store introductions in Settings → Templates and submit
            them to Meta. A starter is a draft; Meta approval and a controlled
            image test are still required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {SHALIMAR_INTRO_TEMPLATES.map(({ label, payload }) => (
              <details key={payload.name} className="rounded-2xl border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  {label} · image + shop contact
                </summary>
                <p
                  className="mt-3 text-sm leading-6 whitespace-pre-wrap"
                  lang={payload.language}
                >
                  {payload.body_text}
                </p>
                <a
                  href={payload.header_media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-sm underline"
                >
                  Preview introduction image
                </a>
              </details>
            ))}
          </div>
          <Link
            href="/settings?tab=templates"
            className={buttonVariants({ variant: 'outline' })}
          >
            Open template review
          </Link>
          <p className="text-muted-foreground text-xs">
            Campaigns reserve ₹2 per attempt within the shared ₹1,000 monthly
            ceiling. Actual Meta charges are separate. This setup does not
            activate delivery or approve a campaign.
          </p>
        </CardContent>
      </Card>
      {selected && (
        <CustomerReview
          key={selected.id}
          row={selected}
          close={() => setSelected(null)}
          saved={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CustomerReview({
  row,
  close,
  saved,
}: {
  row: SavedRow;
  close: () => void;
  saved: () => void;
}) {
  const [language, setLanguage] = useState<CustomerLanguage>(row.language);
  const [permission, setPermission] = useState('unchanged');
  const [observed, setObserved] = useState('');
  const [source, setSource] = useState('');
  const [wording, setWording] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await post('/api/customer-data/review', {
        rowId: row.id,
        language,
        permission:
          permission === 'unchanged'
            ? null
            : {
                status: permission,
                observed_at: new Date(observed).toISOString(),
                source,
                wording,
                evidence,
              },
      });
      toast.success('Customer review saved. No message was sent.');
      saved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review {row.name}</DialogTitle>
          <DialogDescription>
            Current marketing permission: {stateLabel(row.permission)}. Record
            language from the customer; do not guess it from their name or
            location.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <label className="grid gap-2 text-sm">
            Preferred language
            <select
              className={selectClass}
              value={language}
              onChange={(e) => setLanguage(e.target.value as CustomerLanguage)}
            >
              <option value="unknown">Unknown</option>
              <option value="en">English</option>
              <option value="ml">മലയാളം</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            Marketing permission
            <select
              className={selectClass}
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              disabled={!row.contact_id}
            >
              <option value="unchanged">
                Keep existing permission unchanged
              </option>
              <option value="opted_in">
                Customer explicitly agreed to WhatsApp marketing
              </option>
              <option value="opted_out">Customer asked to stop</option>
            </select>
          </label>
          {!row.contact_id && (
            <p className="text-muted-foreground text-xs">
              Resolve this number and link the Contact before recording
              permission.
            </p>
          )}
          {permission !== 'unchanged' && (
            <div className="space-y-3 rounded-xl border p-4">
              <label className="grid gap-2 text-sm">
                When the customer responded
                <Input
                  type="datetime-local"
                  required
                  value={observed}
                  onChange={(e) => setObserved(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Where permission was collected
                <Input
                  required
                  minLength={3}
                  maxLength={300}
                  placeholder="For example: shop opt-in form"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Exact wording the customer agreed to
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  className="bg-card rounded-xl border p-3"
                  value={wording}
                  onChange={(e) => setWording(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Evidence / record reference
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  className="bg-card rounded-xl border p-3"
                  placeholder="Form receipt or conversation reference; no passwords"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
              <p className="text-muted-foreground text-xs">
                A past purchase is not opt-in. Recording opt-in never clears an
                existing global opt-out.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save review'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
