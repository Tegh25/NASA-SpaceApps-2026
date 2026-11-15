import { useMemo } from 'react';
import { isSearchActive, useApp } from '../state/store';
import { analyse, autoDescription, comparisonFor, getSite } from './sites';

export type SiteLookup = 'loading' | 'error' | 'not-found' | 'ready';

/**
 * `useSiteAnalysis` returns null both while data is still loading and when the id does not exist.
 * Callers use this to tell the two apart so a slow or failed load is not reported as a missing site
 * (or a missing site as an endless "loading").
 */
export function siteLookupState(status: 'loading' | 'ready' | 'error', found: boolean): SiteLookup {
  if (found) return 'ready';
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return 'not-found';
}

export function useSiteAnalysis(id: string | null | undefined) {
  const data = useApp((s) => s.data);
  const query = useApp((s) => s.query);
  const presetId = useApp((s) => s.presetId);
  const results = useApp((s) => s.results);
  return useMemo(() => {
    if (!data) return null;
    const site = getSite(data, id);
    if (!site) return null;
    const cmp = comparisonFor(data, site, query, isSearchActive(query), presetId);
    const analysis = cmp ? analyse(site, cmp, data.features) : null;
    const result = results.find((r) => r.id === id) ?? null;
    const description =
      site.featured?.description ||
      (cmp && analysis ? autoDescription(site, analysis, data.features, cmp.label) : 'No comparison available yet. Describe an environment or pick a preset.');
    return { data, site, cmp, analysis, result, description };
  }, [data, id, query, presetId, results]);
}
