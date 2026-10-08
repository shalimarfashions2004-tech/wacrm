'use client';
import { crmFetch } from '@/lib/supabase/read-cache';
import Image from 'next/image';
import type { TemplateButton } from '@/types';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { rupees } from '@/components/settings/managed-messaging';
import type { ManagedBudget } from '@/lib/whatsapp/managed-policy';
import type { ManagedSourceKind } from '@/lib/whatsapp/managed-source';

interface Review {
  fingerprint: string;
  name: string;
  ready: boolean;
  approved: boolean;
  expiresAt: string | null;
  budget: ManagedBudget;
  templates: {
    name: string;
    body: string;
    category: string;
    language: string;
    headerType?: string;
    headerText?: string;
    mediaUrl?: string;
    footer?: string;
    buttons: TemplateButton[];
  }[];
  audience: {
    total: number;
    eligible: number;
    excluded: number;
    attempted: number;
  } | null;
  workflow:
    { step_type: string; step_config: Record<string, unknown> }[] | null;
  trigger?: string;
  deliveryError?: string | null;
  samples?: { phone: string; text: string }[];
}
export function ManagedApproval({
  kind,
  sourceId,
  version = 0,
  dirty = false,
  onStarted,
}: {
  kind: ManagedSourceKind;
  sourceId: string;
  version?: number;
  dirty?: boolean;
  onStarted?: () => void;
}) {
  const { canEditSettings } = useAuth();
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const url = `/api/whatsapp/managed/${kind}/${sourceId}`;
  const load = useCallback(async () => {
    if (!canEditSettings) return;
    try {
      const res = await crmFetch(url, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? 'Could not load the saved review.');
      setReview(body);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load the saved review.'
      );
    }
  }, [url, canEditSettings]);
  useEffect(() => {
    void load();
  }, [load, version]);
  async function act(action: 'approve' | 'revoke') {
    if (!review || dirty) return;
    setBusy(true);
    try {
      const res = await crmFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, fingerprint: review.fingerprint }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not save approval.');
      setConfirm(false);
      toast.success(
        action === 'revoke'
          ? 'Approval revoked.'
          : kind === 'broadcast'
            ? 'Approved. The server is processing this campaign.'
            : 'Saved workflow messages approved for future runs.'
      );
      await load();
      onStarted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save approval.');
      await load();
    } finally {
      setBusy(false);
    }
  }
  if (!canEditSettings)
    return (
      <p className="text-muted-foreground text-sm">
        An admin must review and approve the saved{' '}
        {kind === 'broadcast' ? 'campaign' : 'workflow'} before it sends
        messages.
      </p>
    );
  return (
    <section
      className="border-border bg-card w-full space-y-4 rounded-[22px] border p-5"
      aria-label="Message approval"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Message approval</h3>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={busy || dirty}
          onClick={load}
        >
          Refresh review
        </Button>
      </div>
      {dirty ? (
        <p className="text-sm">
          Save your workflow changes before reviewing its messages.
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">
          {error}
        </p>
      ) : !review ? (
        <p className="text-muted-foreground text-sm">
          Loading the saved message and spending allowance…
        </p>
      ) : (
        <>
          <p className="text-sm">
            {review.approved
              ? 'This saved version is approved.'
              : 'This saved version needs approval.'}{' '}
            Changes to the message, audience or budget require a new review.
          </p>
          {review.deliveryError && (
            <p
              role="alert"
              className="text-sm text-amber-800 dark:text-amber-300"
            >
              {review.deliveryError}
            </p>
          )}
          {review.audience && (
            <p className="text-sm">
              {review.audience.eligible} eligible recipients ·{' '}
              {review.audience.excluded} excluded by number or consent checks ·{' '}
              {review.audience.attempted} already attempted or not pending.
            </p>
          )}
          {review.templates.map((t) => (
            <div
              key={`${t.name}:${t.language}`}
              className="bg-card-2 rounded-2xl p-3"
            >
              <p className="text-muted-foreground text-xs">
                {t.name} · {t.language} · {t.category}
              </p>
              {t.headerType === 'image' &&
                t.mediaUrl &&
                /^https:\/\//.test(t.mediaUrl) && (
                  <Image
                    src={t.mediaUrl}
                    alt="Campaign image shown to recipients"
                    width={640}
                    height={360}
                    unoptimized
                    className="mt-2 max-h-64 w-full rounded-xl object-contain"
                  />
                )}
              {t.headerType === 'text' && (
                <p className="mt-2 font-medium">{t.headerText}</p>
              )}
              {t.mediaUrl && (
                <a
                  className="mt-2 block text-xs break-all underline"
                  href={/^https:\/\//.test(t.mediaUrl) ? t.mediaUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open header media
                </a>
              )}
              <p className="mt-2 text-sm whitespace-pre-wrap">{t.body}</p>
              {t.footer && (
                <p className="text-muted-foreground mt-2 text-xs">{t.footer}</p>
              )}
              {t.buttons.map((b, i) => (
                <p
                  key={i}
                  className="mt-2 rounded-full border px-3 py-2 text-center text-xs"
                >
                  {b.text}
                  {b.type === 'PHONE_NUMBER'
                    ? ` · ${b.phone_number}`
                    : b.type === 'URL'
                      ? ` · ${b.url}`
                      : ''}
                </p>
              ))}
            </div>
          ))}
          {review.samples?.map((s, i) => (
            <details key={i} className="text-sm">
              <summary>Prepared message for {s.phone}</summary>
              <p className="bg-card-2 mt-2 rounded-xl p-3 whitespace-pre-wrap">
                {s.text}
              </p>
            </details>
          ))}
          {kind === 'automation' && (
            <div className="text-sm">
              <p>Trigger: {review.trigger?.replaceAll('_', ' ')}</p>
              {review.workflow?.map((s, i) => (
                <p
                  key={i}
                  className="bg-card-2 mt-2 rounded-xl p-3 whitespace-pre-wrap"
                >
                  {String(
                    s.step_config.text ??
                      s.step_config.body ??
                      s.step_config.template_name ??
                      ''
                  )}
                </p>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-sm">
            {review.audience
              ? `${rupees(review.audience.eligible * (review.budget.reservationPaise ?? 0))} reserved for eligible recipients. `
              : ''}
            {rupees(review.budget.remainingPaise)} remains this month. Consent
            and allowance are checked again for every attempt.
          </p>
          {!review.ready && (
            <p className="text-sm">
              Enable managed delivery in{' '}
              <a className="underline" href="/settings?tab=whatsapp">
                WhatsApp settings
              </a>{' '}
              first.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full"
              disabled={
                busy ||
                !review.ready ||
                (!!review.audience && !review.audience.eligible)
              }
              onClick={() => setConfirm(true)}
            >
              {kind === 'broadcast'
                ? 'Review and send'
                : 'Approve saved workflow messages'}
            </Button>
            {review.approved && (
              <Button
                variant="outline"
                className="rounded-full"
                disabled={busy}
                onClick={() => act('revoke')}
              >
                Revoke approval
              </Button>
            )}
          </div>
          <Dialog open={confirm} onOpenChange={setConfirm}>
            <DialogContent className="rounded-[28px]">
              <DialogHeader>
                <DialogTitle>
                  {kind === 'broadcast'
                    ? 'Approve and send this campaign?'
                    : 'Approve automatic messages?'}
                </DialogTitle>
                <DialogDescription>
                  {kind === 'broadcast'
                    ? `Send the reviewed template to up to ${review.audience?.eligible ?? 0} eligible recipients in “${review.name}”. The monthly allowance and current consent will be enforced.`
                    : `Allow future runs of the saved “${review.name}” workflow to send the reviewed messages. Each recipient and the shared allowance are checked at send time. Approval expires after 30 days or when the saved workflow changes.`}
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
                <Button disabled={busy} onClick={() => act('approve')}>
                  {busy
                    ? 'Checking and saving…'
                    : kind === 'broadcast'
                      ? 'Approve and send'
                      : 'Approve future runs'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}
