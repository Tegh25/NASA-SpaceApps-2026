import { Check, Columns2, Footprints, Link2, Printer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HAS_ION } from '../globe/viewer';
import { formatLatLon } from '../lib/geo';
import { GLOBAL_LIMITS } from '../lib/sites';
import { useSiteAnalysis } from '../lib/useSite';
import { useApp } from '../state/store';
import { FeatureTable } from './FeatureTable';
import { RadarChart } from './RadarChart';
import { Chip, ScoreGauge, SectionTitle, Segmented } from './common';

export function SiteDetailPanel({ id }: { id: string }) {
  const info = useSiteAnalysis(id);
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'table' | 'radar'>('table');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const close = () => {
    useApp.getState().goHome();
    navigate(`/${window.location.search}`);
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('#finetune')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!info) {
    return (
      <aside className="panel pointer-events-auto p-5" aria-label="Site details">
        <p className="mb-3">That site was not found.</p>
        <button type="button" onClick={close} className="underline">
          Back to the globe
        </button>
      </aside>
    );
  }

  const { data, site, cmp, analysis, result, description } = info;
  const f = site.featured;
  const score = result?.score ?? analysis?.score?.score ?? null;
  const confidence = result?.confidence ?? analysis?.score?.confidence ?? 1;
  const analogTargets = (f?.analogFor ?? []).map((tid) => data.targets.find((t) => t.id === tid)).filter((t) => !!t);
  const compareTarget = cmp?.target ?? analogTargets[0] ?? null;
  const usedFeatures = new Set(analysis?.rows.filter((r) => r.weight > 0).map((r) => r.key));
  const sources = Array.from(new Set(data.features.filter((fd) => usedFeatures.has(fd.key)).flatMap((fd) => fd.sources)));
  const isLavaTube = f?.matches.some((m) => /lava tube/i.test(m)) || f?.name.toLowerCase().includes('lava tube');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <aside
      className="panel pointer-events-auto flex max-h-full flex-col overflow-hidden"
      aria-labelledby="site-title"
    >
      <header className="flex items-start gap-3 border-b border-white/10 p-4">
        {score !== null && <ScoreGauge score={score} />}
        <div className="min-w-0 flex-1">
          <h2 id="site-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold leading-tight focus:outline-none">
            {site.name}
          </h2>
          {site.kind === 'featured' && <p className="mt-0.5 text-sm text-[var(--muted)]">{site.region}</p>}
          <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">{formatLatLon(site.lat, site.lon)}</p>
          {(analogTargets.length > 0 || cmp) && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="self-center text-[11px] text-[var(--muted)]">Analog for</span>
              {analogTargets.length
                ? analogTargets.map((t) => (
                    <Link key={t.id} to={`/target/${t.id}`} className="rounded-full">
                      <Chip tone={t.body}>{t.name}</Chip>
                    </Link>
                  ))
                : cmp && <Chip tone={cmp.target?.body ?? 'default'}>{cmp.label}</Chip>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close site details"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-white/10"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
        <section>
          <SectionTitle>Why it matches</SectionTitle>
          {f?.headline && <p className="mb-1.5 font-medium">{f.headline}</p>}
          {description.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="mb-2 text-sm leading-relaxed text-[var(--text)]/90">
              {p}
            </p>
          ))}
          {f && f.matches.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {f.matches.map((m) => (
                <li key={m} className="flex gap-2">
                  <Check size={15} className="mt-0.5 shrink-0 text-[var(--good)]" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          )}
        </section>

        {analysis && cmp && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>Compared with {cmp.label}</SectionTitle>
              <Segmented
                size="sm"
                label="Comparison view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'table', label: 'Table' },
                  { value: 'radar', label: 'Radar' },
                ]}
              />
            </div>
            {confidence < 0.75 && (
              <p className="mb-2 text-xs text-[var(--mid)]">Partial data: {Math.round((1 - confidence) * 100)}% of the weight has no value here.</p>
            )}
            {view === 'table' ? (
              <FeatureTable rows={analysis.rows} features={data.features} siteRaw={site.raw} target={cmp.target} targetLabel={cmp.label} />
            ) : (
              <RadarChart rows={analysis.rows} features={data.features} />
            )}
          </section>
        )}

        <section>
          <SectionTitle>Where this analog falls short</SectionTitle>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {isLavaTube && <li>Scores describe the surface above the tube; the cave interior is not modelled.</li>}
            {f?.shortfalls.map((s) => (
              <li key={s}>{s}</li>
            ))}
            {GLOBAL_LIMITS.map((s) => (
              <li key={s} className="text-[var(--muted)]">
                {s}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle>Data quality</SectionTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-[var(--muted)]">Values</dt>
            <dd>{site.kind === 'cell' ? `Grid cell, ${data.cells.cellSizeDeg}° resolution` : 'Site-level values'}</dd>
            <dt className="text-[var(--muted)]">Imagery</dt>
            <dd>{HAS_ION ? 'Cesium ion: Bing aerial, World Terrain' : 'Natural Earth II (bundled, no terrain)'}</dd>
            <dt className="text-[var(--muted)]">Tour fidelity</dt>
            <dd>{HAS_ION ? 'Photorealistic where Google 3D Tiles load' : 'Low detail'}</dd>
            {data.isMock && (
              <>
                <dt className="text-[var(--muted)]">Status</dt>
                <dd className="text-[var(--mid)]">Demo data, not real findings</dd>
              </>
            )}
          </dl>
        </section>

        <section>
          <SectionTitle>Sources</SectionTitle>
          {sources.length > 0 && <p className="mb-2 text-xs text-[var(--muted)]">Datasets behind these numbers: {sources.join(', ')}.</p>}
          {f?.references.length ? (
            <ul className="space-y-1 text-sm">
              {f.references.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[var(--moon)] underline-offset-2 hover:underline">
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <Link to="/method" className="mt-2 inline-block text-xs text-[var(--muted)] underline-offset-2 hover:underline">
            How the score works
          </Link>
        </section>
      </div>

      <footer className="no-print flex flex-wrap gap-2 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => navigate(`/tour/${site.id}`)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--good)] px-4 py-2.5 text-sm font-semibold text-[#06231b] hover:brightness-110"
        >
          <Footprints size={16} aria-hidden /> Enter site
        </button>
        {compareTarget && (
          <button
            type="button"
            onClick={() => navigate(`/compare/${site.id}/${compareTarget.id}`)}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2.5 text-sm hover:bg-white/10"
          >
            <Columns2 size={16} aria-hidden /> Compare
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2.5 text-sm hover:bg-white/10"
        >
          {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          aria-label="Print analog brief"
          title="Print analog brief"
          className="grid place-items-center rounded-lg border border-white/15 px-3 py-2.5 hover:bg-white/10"
        >
          <Printer size={16} aria-hidden />
        </button>
      </footer>
    </aside>
  );
}
