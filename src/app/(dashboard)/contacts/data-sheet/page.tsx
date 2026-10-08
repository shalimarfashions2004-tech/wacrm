import Link from 'next/link';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  LockKeyhole,
  Rows3,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TallyAccessSetup } from '@/components/customer-data/tally-access-setup';
import { CustomerDataWorkspace } from '@/components/customer-data/customer-data-workspace';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatRupees,
  SHALIMAR_CUSTOMER_DATA_SNAPSHOT as snapshot,
} from '@/lib/customer-data/snapshot';

const dataContract = [
  [
    'Customer key',
    'Company identifier + reviewed Tally ledger identifier',
    'Identity review required',
  ],
  [
    'Observed tenure',
    'First order to the source as-of date',
    'Verified from source',
  ],
  [
    'Three-year status',
    '36 months requires source coverage',
    'Blocked by source window',
  ],
  [
    'Purchase value',
    'Lifetime gross and trailing 12-month gross',
    'Verified from source',
  ],
  [
    'Lifecycle',
    'Existing A–E Shalimar customer segments',
    'Verified from source',
  ],
  [
    'Consent',
    'Separate opt-in state for CRM messaging',
    'Never inferred from sales',
  ],
] as const;

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <span className="bg-pale-lime text-foreground flex size-10 shrink-0 items-center justify-center rounded-2xl">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
            {label}
          </p>
          <p className="text-foreground mt-1 text-2xl font-semibold tracking-tight">
            {value}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CustomerDataSheetPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/contacts"
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back to Contacts
          </Link>
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-[0.18em] uppercase">
            Shalimar customer data
          </p>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            A review page for customer history, purchase value, and lifecycle
            segments. Import the prepared history below; live Tally sync starts
            after the shop computer check. The reference figures further down
            remain separate from saved CRM records.
          </p>
        </div>
        <Badge
          variant="outline"
          className="h-8 gap-2 rounded-full border-amber-500/40 bg-amber-500/10 px-3 text-amber-700 dark:text-amber-300"
        >
          <LockKeyhole className="size-3.5" />
          Reviewed imports · permission required
        </Badge>
      </div>

      <CustomerDataWorkspace />

      <TallyAccessSetup />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-2xl">
              <FileSpreadsheet className="size-5" />
            </span>
            <div>
              <p className="text-foreground font-medium">
                Historical source reference
              </p>
              <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                The Shalimar folder contains {snapshot.excelWorkbookCount}{' '}
                monthly Sales Register workbooks. The prepared import reconciles
                customer purchase amounts to the current invoice CSV. Import
                counts and linked Contacts appear above; these figures describe
                the earlier source review.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              disabled
              className="border-border bg-card-2 rounded-full"
            >
              <Upload className="size-4" />
              Source files preserved
            </Button>
            <Link
              href="/broadcasts/new?source=customer-data"
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors"
            >
              Build broadcast list
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Customers"
          value={snapshot.customerCount.toLocaleString('en-IN')}
          detail="Customer master rows"
        />
        <MetricCard
          icon={Rows3}
          label="Invoice rows"
          value={snapshot.invoiceRowCount.toLocaleString('en-IN')}
          detail="Sales master rows"
        />
        <MetricCard
          icon={CalendarClock}
          label="Source window"
          value={snapshot.sourceWindow}
          detail={`As of ${snapshot.sourceAsOf}`}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Verified 3-year"
          value={snapshot.verified36mCustomers.toLocaleString('en-IN')}
          detail="No 36-month record is verifiable yet"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Customer lifecycle segments</CardTitle>
            <CardDescription>
              Existing Shalimar segments from the customer master, with lifetime
              and trailing 12-month value.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="pl-6">Segment</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Lifetime gross</TableHead>
                  <TableHead className="pr-6">Gross, last 12m</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.lifecycle.map((segment) => (
                  <TableRow key={segment.key} className="border-border">
                    <TableCell className="text-foreground pl-6 font-medium">
                      {segment.label}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {segment.customers.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRupees(segment.lifetimeGross)}
                    </TableCell>
                    <TableCell className="text-muted-foreground pr-6">
                      {formatRupees(segment.gross12m)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lifetime purchase bands</CardTitle>
            <CardDescription>
              Useful filters for the future connected customer grid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.spendBands.map((band) => (
              <div
                key={band.label}
                className="bg-card-2 flex items-center justify-between gap-4 rounded-2xl px-4 py-3"
              >
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {band.label}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {band.customers.toLocaleString('en-IN')} customers
                  </p>
                </div>
                <p className="text-foreground text-sm font-medium">
                  {formatRupees(band.lifetimeGross)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Product intelligence</CardTitle>
            <CardDescription>
              Current item mix from the prepared report. These figures are
              indicative until Tally item data reconciles cleanly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.productMix.map((item) => (
              <div
                key={item.name}
                className="bg-card-2 flex items-center justify-between gap-4 rounded-2xl px-4 py-3"
              >
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {item.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {item.pieces.toLocaleString('en-IN')} pieces
                  </p>
                </div>
                <p className="text-foreground text-sm font-medium">
                  {formatRupees(item.value)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Broadcast audiences from this data</CardTitle>
            <CardDescription>
              Saved audiences will use reviewed sales data plus consent and
              suppression checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              [
                'High value and frequent',
                'High lifetime value + repeat orders + recent purchase',
              ],
              [
                'High value at risk',
                'High lifetime value + 60–120 days since last order',
              ],
              [
                'Product interest',
                'Bought a selected item or category in the chosen period',
              ],
              [
                'Low value one-time',
                'One order + low value, for second-order education',
              ],
            ].map(([label, rule]) => (
              <div
                key={label}
                className="border-border bg-card-2 rounded-2xl border px-4 py-3"
              >
                <p className="text-foreground text-sm font-medium">{label}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {rule}
                </p>
              </div>
            ))}
            <p className="text-muted-foreground pt-1 text-xs leading-5">
              The audience builder must exclude missing or unresolved phones,
              duplicates, internal outlets, suppressed contacts, and anyone
              without recorded WhatsApp consent.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Three-year check</CardTitle>
            <CardDescription>
              What the current files can prove today.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-300" />
              <div className="space-y-1">
                <p className="text-foreground font-medium">
                  Three years is not verifiable yet
                </p>
                <p className="text-muted-foreground text-sm leading-6">
                  The source starts in April 2024 and ends on May 23, 2026. It
                  contains{' '}
                  {snapshot.observed24mCustomers.toLocaleString('en-IN')}{' '}
                  customers with at least 24 months observed, but zero customers
                  with 36 months of verified history.
                </p>
              </div>
            </div>
            <div className="border-border bg-card-2 flex items-start gap-3 rounded-2xl border p-4">
              <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
              <div className="space-y-1">
                <p className="text-foreground font-medium">
                  Consent stays separate
                </p>
                <p className="text-muted-foreground text-sm leading-6">
                  A purchase record can support analysis, but it does not create
                  WhatsApp marketing permission. Any future message eligibility
                  must come from a separate consent record.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer data contract</CardTitle>
            <CardDescription>
              Fields the future Excel connection will validate before linking to
              Contacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="pl-6">Field</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead className="pr-6">Current status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataContract.map(([field, definition, status]) => (
                  <TableRow key={field} className="border-border">
                    <TableCell className="text-foreground pl-6 font-medium">
                      {field}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-normal">
                      {definition}
                    </TableCell>
                    <TableCell className="pr-6">
                      <Badge
                        variant="outline"
                        className="border-border text-muted-foreground rounded-full text-xs"
                      >
                        {status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data quality before connection</CardTitle>
          <CardDescription>
            These checks stay visible so later imports do not hide source
            limitations.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-card-2 rounded-2xl p-4">
            <p className="text-muted-foreground text-xs">Blank phone</p>
            <p className="text-foreground mt-1 text-xl font-semibold">
              {snapshot.blankPhoneCustomers}
            </p>
            <p className="text-muted-foreground text-xs">rows need review</p>
          </div>
          <div className="bg-card-2 rounded-2xl p-4">
            <p className="text-muted-foreground text-xs">Multiple numbers</p>
            <p className="text-foreground mt-1 text-xl font-semibold">
              {snapshot.multiNumberPhoneCustomers}
            </p>
            <p className="text-muted-foreground text-xs">
              rows need normalization
            </p>
          </div>
          <div className="bg-card-2 rounded-2xl p-4">
            <p className="text-muted-foreground text-xs">Name duplicates</p>
            <p className="text-foreground mt-1 text-xl font-semibold">
              {snapshot.normalizedNameDuplicates}
            </p>
            <p className="text-muted-foreground text-xs">
              duplicate needs resolution
            </p>
          </div>
          <div className="bg-card-2 rounded-2xl p-4">
            <p className="text-muted-foreground text-xs">Source files</p>
            <p className="text-foreground mt-1 text-xl font-semibold">
              {snapshot.excelWorkbookCount}
            </p>
            <p className="text-muted-foreground text-xs">
              monthly workbooks checked
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs leading-5">
        Snapshot sources: {snapshot.sourceCustomerFile},{' '}
        {snapshot.sourceInvoiceFile}, and the monthly Tally Sales Register
        workbooks in the Shalimar folder. This page contains aggregate reference
        data only; no customer names, phone numbers, addresses, or messages were
        imported.
      </p>
    </div>
  );
}
