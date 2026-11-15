import { FindPanel } from './FindPanel';
import { ExplorePanel } from './ExplorePanel';

/**
 * Right-hand console. Find mode when no site is selected, Explore mode otherwise.
 * Fills its container; scrolls internally.
 */
export function RightPanel({ siteId }: { siteId: string | null }) {
  return <div className="flex h-full min-h-0 flex-col">{siteId ? <ExplorePanel siteId={siteId} /> : <FindPanel />}</div>;
}
