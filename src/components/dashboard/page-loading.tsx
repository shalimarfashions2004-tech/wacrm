import { Skeleton, SkeletonCard } from '@/components/dashboard/skeleton';

/**
 * Shared page-level loading state. It mirrors the dashboard content rhythm
 * so route transitions and client-side data loads keep the page structure
 * visible instead of collapsing to a centered spinner.
 */
export function DashboardPageLoading({
  variant = 'default',
}: {
  variant?: 'default' | 'board' | 'table' | 'editor';
}) {
  if (variant === 'board') {
    return (
      <div aria-busy="true" aria-label="Loading page" className="space-y-8">
        <PageHeading />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="min-w-64 flex-1 space-y-4 rounded-[28px] border border-border bg-card p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-16" />
              {Array.from({ length: 3 }, (_, cardIndex) => (
                <Skeleton key={cardIndex} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div aria-busy="true" aria-label="Loading page" className="space-y-8">
        <PageHeading />
        <div className="overflow-hidden rounded-[28px] border border-border bg-card p-5">
          <Skeleton className="mb-5 h-12 w-full rounded-2xl" />
          <div className="space-y-3">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'editor') {
    return (
      <div aria-busy="true" aria-label="Loading page" className="mx-auto max-w-4xl space-y-8">
        <PageHeading />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-[28px]" />
      </div>
    );
  }

  return (
    <div aria-busy="true" aria-label="Loading page" className="space-y-6">
      <PageHeading />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <Skeleton className="h-[360px] w-full rounded-[28px]" />
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-3">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72 max-w-[60vw]" />
      </div>
      <Skeleton className="h-10 w-28 rounded-xl" />
    </div>
  );
}

/** Static chrome shown while the auth session is being resolved. */
export function DashboardShellLoading() {
  return (
    <div aria-busy="true" aria-label="Loading workspace" className="app-shell-bg flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card/60 p-5 lg:block">
        <Skeleton className="mb-9 h-9 w-36 rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-8 h-12 w-full rounded-2xl" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-header flex h-16 shrink-0 items-center justify-between border-b border-border px-4 lg:px-7">
          <Skeleton className="h-9 w-44 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
          <DashboardPageLoading />
        </main>
      </div>
    </div>
  );
}
