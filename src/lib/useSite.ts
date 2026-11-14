import { useMemo } from 'react';
import { isSearchActive, useApp } from '../state/store';
import { analyse, autoDescription, comparisonFor, getSite } from './sites';

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
