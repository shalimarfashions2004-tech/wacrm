import { Skeleton } from './skeleton';

/** Keeps the page and navigation usable while a selected feature loads. */
export function PanelLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading content"
      className="border-border bg-card space-y-4 rounded-2xl border p-6"
    >
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
