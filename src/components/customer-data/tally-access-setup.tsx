import Link from 'next/link';
import { Download, Monitor, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** Preparation only. A downloaded diagnostic is never treated as a sync receipt. */
export function TallyAccessSetup() {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Monitor className="size-4" />
            Connect the shop’s TallyPrime
          </CardTitle>
          <Badge variant="outline" className="rounded-full">
            Waiting for shop computer check
          </Badge>
        </div>
        <CardDescription>
          Start on the computer running Tally. The first check reads only the
          selected company’s identity. Customer records are not synced yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="text-muted-foreground grid list-decimal gap-3 pl-5 text-sm leading-6 sm:grid-cols-2 sm:gap-x-8">
          <li>
            Open the correct Shalimar company in TallyPrime. In F1 Help, note
            its release and local HTTP port.
          </li>
          <li>
            Download the shop access kit, extract it, and follow START HERE.
            Staff stay in control of the shop computer.
          </li>
          <li>
            Run the local company check and review its result. If it is blocked,
            ask the shop technician to check Tally’s local service.
          </li>
          <li>
            After the check, verify one month’s sales totals before linking
            customers, reviewing permission and choosing their language.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <a
            href="/downloads/SHALIMAR_TALLY_ACCESS_KIT.zip"
            download
            className={buttonVariants({ variant: 'outline' })}
          >
            <Download className="size-4" />
            Download shop access kit
          </a>
          <Link
            href="/settings?tab=templates"
            className={buttonVariants({ variant: 'secondary' })}
          >
            Review English / Malayalam templates
          </Link>
        </div>
        <p className="text-muted-foreground flex items-start gap-2 text-xs leading-5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          This check stays on the shop computer. It uploads nothing and enables
          no broadcasts. Keep passwords private and the Tally port off the
          public internet.
        </p>
        <details className="border-border bg-card rounded-2xl border p-4 text-sm">
          <summary className="text-foreground cursor-pointer font-medium">
            What still needs to pass before a customer broadcast?
          </summary>
          <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5 leading-6">
            <li>Sales totals match Tally, with source dates visible.</li>
            <li>
              Each customer has a reviewed identity, language and separate
              WhatsApp marketing permission. A past purchase is not permission.
            </li>
            <li>
              Meta approves the exact image template and a controlled image
              delivery test succeeds.
            </li>
            <li>
              An administrator approves the saved campaign and its audience.
              Managed delivery reserves ₹2 per attempt within the shared ₹1,000
              monthly limit; actual Meta charges are separate.
            </li>
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}
