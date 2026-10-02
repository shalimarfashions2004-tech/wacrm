/**
 * Shared status badge config for broadcasts + recipients.
 *
 * Previously `statusConfig` was defined inline in both
 * /broadcasts/page.tsx and /broadcasts/[id]/page.tsx with slight
 * drift risk. One source of truth now.
 *
 * Badge shape: tonal fills + readable foreground labels. The
 * statuses remain text-first so the same badge is clear in both
 * light and dark modes.
 */

import type { BroadcastStatus, RecipientStatus } from '@/types';

export interface StatusDisplay {
  label: string;
  classes: string;
  /**
   * Set true for statuses that should pulse in the UI to convey
   * "live / in-flight" — currently only `sending`.
   */
  pulse?: boolean;
}

export const broadcastStatusConfig: Record<BroadcastStatus, StatusDisplay> = {
  draft: {
    label: 'draft',
    classes:
      'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
  },
  scheduled: {
    label: 'scheduled',
    classes: 'bg-primary/10 text-foreground border-primary/20',
  },
  sending: {
    label: 'sending',
    classes: 'bg-primary/10 text-foreground border-primary/20',
    pulse: true,
  },
  sent: {
    label: 'sent',
    classes: 'bg-primary/10 text-primary border-primary/20',
  },
  failed: {
    label: 'failed',
    classes: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
  },
};

export const recipientStatusConfig: Record<RecipientStatus, StatusDisplay> = {
  pending: {
    label: 'pending',
    classes:
      'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
  },
  sent: {
    label: 'sent',
    classes:
      'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  },
  delivered: {
    label: 'delivered',
    classes: 'bg-primary/10 text-foreground border-primary/20',
  },
  read: {
    label: 'read',
    classes: 'bg-primary/10 text-primary border-primary/20',
  },
  replied: {
    label: 'replied',
    classes:
      'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  },
  failed: {
    label: 'failed',
    classes: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
  },
};

/**
 * Tolerant lookup — callers often have a generic string status
 * coming from Supabase. Falls back to the "draft" / "pending"
 * entry so the UI never crashes on an unknown value.
 */
export function getBroadcastStatus(status: string): StatusDisplay {
  return (
    broadcastStatusConfig[status as BroadcastStatus] ??
    broadcastStatusConfig.draft
  );
}

export function getRecipientStatus(status: string): StatusDisplay {
  return (
    recipientStatusConfig[status as RecipientStatus] ??
    recipientStatusConfig.pending
  );
}
