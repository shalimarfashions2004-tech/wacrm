'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ManagedBudget } from '@/lib/whatsapp/managed-policy';
import { WhatsAppCostGuide } from './whatsapp-cost-guide';

export const rupees = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);
interface Settings {
  budget: ManagedBudget;
  ready: boolean;
  deploymentEnabled: boolean;
  providerCheckAvailable: boolean;
  canApprove: boolean;
  reviewedRate: { reservationPaise: number; validUntil: string };
}
export function ManagedMessagingSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [provider, setProvider] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/managed/settings', {
        cache: 'no-store',
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? 'Could not read campaign settings.');
      setData(body);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not read campaign settings.'
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(action: 'verify' | 'enable' | 'pause') {
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/managed/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? 'Could not save campaign settings.');
      if (body.provider)
        setProvider(
          `Meta checks passed for ${body.provider.name} (${body.provider.phone}).`
        );
      toast.success(body.message);
      setConfirm(false);
      await load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not save campaign settings.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section
        className="border-border bg-card space-y-4 rounded-[22px] border p-5"
        aria-label="Campaigns and automatic messages"
      >
        <div>
          <h3 className="font-medium">Campaigns and automatic messages</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            A shared monthly allowance. Each saved campaign and workflow needs
            its own admin approval.
          </p>
        </div>
        {error ? (
          <div
            role="alert"
            className="text-sm text-amber-800 dark:text-amber-300"
          >
            {error}
            <Button
              variant="outline"
              className="ml-3 rounded-full"
              onClick={load}
            >
              Refresh
            </Button>
          </div>
        ) : !data ? (
          <p className="text-muted-foreground text-sm">
            Loading spending controls…
          </p>
        ) : (
          <>
            <p role="status" className="text-sm font-medium">
              {data.ready
                ? 'Managed delivery enabled — approved campaigns and workflows only.'
                : 'Managed delivery paused — no campaigns or automatic messages will be sent.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Monthly limit', data.budget.monthlyLimitPaise],
                ['Reserved this month', data.budget.reservedPaise],
                ['Available', data.budget.remainingPaise],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-card-2 rounded-2xl p-3">
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="mt-1 text-xl">{rupees(Number(value))}</p>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              India calendar month. We reserve{' '}
              {rupees(data.reviewedRate.reservationPaise)} per attempted
              message. Failed or uncertain attempts keep their reservation. This
              is an allowance, separate from Meta’s balance and actual bill.
            </p>
            {data.budget.needsReviewCount > 0 && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {data.budget.needsReviewCount} attempts need delivery review.
                They will not retry automatically.
              </p>
            )}
            {provider && (
              <p className="text-sm" role="status">
                {provider}
              </p>
            )}
            {data.canApprove ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={busy || !data.providerCheckAvailable}
                  onClick={() => act('verify')}
                >
                  Check with Meta
                </Button>
                {data.ready ? (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={busy}
                    onClick={() => act('pause')}
                  >
                    Pause managed delivery
                  </Button>
                ) : (
                  <Button
                    className="rounded-full"
                    disabled={busy || !data.deploymentEnabled}
                    onClick={() => setConfirm(true)}
                  >
                    Review and enable
                  </Button>
                )}
                {busy && <Loader2 className="size-5 animate-spin" />}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                An admin can change these settings.
              </p>
            )}
            {!data.deploymentEnabled && (
              <p className="text-muted-foreground text-sm">
                Deployment checks are still in progress.
              </p>
            )}
            <Dialog open={confirm} onOpenChange={setConfirm}>
              <DialogContent className="rounded-[28px]">
                <DialogHeader>
                  <DialogTitle>Enable approved messages?</DialogTitle>
                  <DialogDescription>
                    Keep the {rupees(data.budget.monthlyLimitPaise)} monthly
                    limit and reserve{' '}
                    {rupees(data.reviewedRate.reservationPaise)} per attempt.
                    Meta will be checked before this setting is saved. Campaigns
                    and workflows still need separate approval.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={busy} onClick={() => act('enable')}>
                    {busy ? 'Checking Meta…' : 'Enable with this limit'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </section>
      <WhatsAppCostGuide />
    </>
  );
}
