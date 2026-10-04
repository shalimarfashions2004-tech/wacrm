import { Skeleton, SkeletonCard } from '@/components/dashboard/skeleton';

/**
 * Route-level fallback for dashboard navigation. The dashboard shell stays
 * mounted while a new page bundle/data request is in flight, so users get an
 * immediate layout cue instead of a blank or stale-looking page.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading page" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-72 max-w-[60vw]" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>

      <Skeleton className="h-[360px] w-full rounded-[28px]" />
    </div>
  );
}
