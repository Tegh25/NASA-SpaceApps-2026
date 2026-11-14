import * as Cesium from 'cesium';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { whenViewer } from '../globe/viewer';
import { formatValue } from '../lib/geo';
import { analyse, getSite, targetRaw } from '../lib/sites';
import { queryFromTarget } from '../scoring/score';
import { useApp } from '../state/store';
import { MatchBadge } from '../ui/common';
import { TargetScene } from './TargetScene';

export default function ComparePage() {
  const { siteId, targetId } = useParams();
  const data = useApp((s) => s.data);
  const site = data ? getSite(data, siteId) : null;
  const target = data?.targets.find((t) => t.id === targetId) ?? null;

  const facts = useMemo(() => {
    if (!data || !site || !target) return null;
    const a = analyse(site, { query: queryFromTarget(target, data.features), label: target.name, target }, data.features);
    const rows = a.rows.filter((r) => r.diff !== null);
    const byKey = new Map(data.features.map((f) => [f.key, f]));
    const pick = (r: (typeof rows)[number]) => {
      const fd = byKey.get(r.key)!;
      return { key: r.key, label: fd.label, level: r.level, site: formatValue(site.raw(r.key), fd.unit), target: formatValue(targetRaw(r, fd, target), fd.unit) };
    };
    return {
      score: a.score?.score ?? null,
      matches: [...rows].sort((x, y) => x.diff! - y.diff!).slice(0, 4).map(pick),
      gaps: [...rows].sort((x, y) => y.diff! - x.diff!).slice(0, 3).map(pick),
    };
  }, [data, site, target]);

  useEffect(() => {
    if (!site) return;
    whenViewer().then((v) => {
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat - 0.12, 9000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-32), roll: 0 },
        duration: 1.2,
      });
    });
  }, [site?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  if (!site || !target)
    return (
      <div className="absolute inset-0 z-10 grid place-items-center">
        <div className="panel p-5">
          Unknown site or target.{' '}
          <Link to="/" className="underline">
            Back
          </Link>
        </div>
      </div>
    );

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute inset-y-0 right-0 w-full md:w-1/2">
        <TargetScene target={target} sunAz={120} sunEl={Math.abs(target.lat) > 75 ? 1.5 : 20} exaggeration={1.5} groundView={false} />
      </div>
      <div className="absolute inset-y-0 left-1/2 hidden w-px bg-white/20 md:block" aria-hidden />

      <div className="panel pointer-events-auto absolute left-4 top-4 flex items-center gap-3 px-3 py-2">
        <Link to={`/site/${site.id}`} className="flex items-center gap-1.5 text-sm hover:text-white" aria-label="Back to site details">
          <ArrowLeft size={15} aria-hidden /> Back
        </Link>
        <span className="text-sm font-medium">{site.name}</span>
        {facts?.score != null && <span className="font-mono text-sm text-[var(--good)]">{Math.round(facts.score)}/100</span>}
      </div>
      <div className="panel pointer-events-auto absolute right-4 top-4 px-3 py-2 text-sm font-medium" style={{ color: `var(--${target.body})` }}>
        {target.name}
      </div>

      {facts && (
        <div className="pointer-events-auto absolute inset-x-4 bottom-4 grid gap-3 md:grid-cols-2">
          <FactCard title={`Where ${site.name} matches`} items={facts.matches} />
          <FactCard title="Where it differs" items={facts.gaps} />
        </div>
      )}
    </div>
  );
}

function FactCard({ title, items }: { title: string; items: { key: string; label: string; level: 'strong' | 'partial' | 'weak' | null; site: string; target: string }[] }) {
  return (
    <div className="panel p-3">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <ul className="space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2">
            <span className="flex-1">{i.label}</span>
            <span className="font-mono text-xs text-[var(--muted)] tabular">
              {i.site} vs {i.target}
            </span>
            <MatchBadge level={i.level} />
          </li>
        ))}
      </ul>
    </div>
  );
}
