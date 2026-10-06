import { DashboardPageLoading } from '@/components/dashboard/page-loading';

/**
 * Route-level fallback for dashboard navigation. The dashboard shell stays
 * mounted while a new page bundle/data request is in flight, so users get an
 * immediate layout cue instead of a blank or stale-looking page.
 */
export default function DashboardLoading() {
  return <DashboardPageLoading />;
}
