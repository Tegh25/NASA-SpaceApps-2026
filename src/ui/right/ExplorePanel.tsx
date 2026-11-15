import { ArrowLeft, Columns2, ExternalLink, Footprints, Mountain, Orbit, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatLatLon } from '../../lib/geo';
import { gapSource, siteDatasets } from '../../lib/provenance';
import { GLOBAL_LIMITS, autoDescription, targetRaw } from '../../lib/sites';
import { siteLookupState, useSiteAnalysis } from '../../lib/useSite';
import { explainSite, type ExplainRow } from '../../parse/explainClient';
import { useApp } from '../../state/store';
import { HeroImage, type HeroView } from './HeroImage';
import { MatchBars } from './MatchBars';
import { ScoreRing } from './ScoreRing';
import { formatDelta, formatUnit } from './format';

const idx = (n: number) => ({ '--i': n }) as CSSProperties;

function BackLink() {
  const { search } = useLocation();
  return (
    <Link
      to={{ pathname: '/', search }}
      aria-label="Back to find"
      className="glass-capsule grid h-9 w-9 shrink-0 place-items-center text-[var(--dim)] hover:text-[var(--ink)]"
    >
      <ArrowLeft size={18} aria-hidden />
    </Link>
  );
}

function Badge({ children, tone = 'accent' }: { children: string; tone?: 'accent' | 'mid' }) {
  const c = tone === 'mid' ? 'var(--mid)' : 'var(--accent)';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs" style={{ color: c, borderColor: `color-mix(in srgb, ${c} 50%, transparent)`, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {children}
    </span>
  );
}

function ActionTile({ to, icon: Icon, title, sub, primary = false }: { to?: string; icon: LucideIcon; title: string; sub: string; primary?: boolean }) {
  const body = (
    <>
      <Icon size={18} aria-hidden className={primary ? 'text-[var(--accent)]' : 'text-[var(--ink)]/85'} />
      <span className="mt-2 block text-[13px] font-medium leading-4 text-[var(--ink)]">{title}</span>
      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-[14px] text-[var(--dim)]">{sub}</span>
    </>
  );
  const cls = 'glass-thin block h-full min-h-[96px] p-3 text-left';
  if (!to)
    return (
      <div className={`${cls} opacity-45`} aria-disabled="true">
        {body}
      </div>
    );
  return (
    <Link
      to={to}
      className={cls}
      style={primary ? { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 22px -10px var(--accent)' } : undefined}
    >
      {body}
    </Link>
  );
}

export function ExplorePanel({ siteId }: { siteId: string }) {
  const info = useSiteAnalysis(siteId);
  const status = useApp((s) => s.status);

  if (!info) {
    const lookup = siteLookupState(status, false);
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <BackLink />
        {lookup === 'loading' ? (
          <p className="text-sm text-[var(--dim)]" role="status">Loading site data</p>
        ) : lookup === 'error' ? (
          <>
            <h2 className="font-display text-xl">Could not load site data</h2>
            <p className="text-sm text-[var(--dim)]">Reload the page to try again.</p>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl">Site not found</h2>
            <p className="text-sm text-[var(--dim)]">That site is not in the current data. Go back and pick another candidate.</p>
          </>
        )}
      </div>
    );
  }

  const { data, site, cmp, analysis, result } = info;
  const search = window.location.search;
  const f = site.featured;
  const score = result?.score ?? analysis?.score?.score ?? null;
  const target = cmp?.target ?? data.targets.find((t) => t.id === f?.analogFor[0]) ?? null;
  const body = target?.body ?? f?.body ?? 'moon';
  const bodyName = body === 'mars' ? 'Mars' : 'Moon';
  const literature = f?.valueSource === 'literature';
  const badge = site.kind === 'cell' ? 'Engine match' : f?.kind === 'new' ? 'New candidate' : f?.kind === 'known' ? 'Known analog' : 'Reserve candidate';
  const origin =
    site.kind === 'cell'
      ? 'Found live by the search engine from your conditions. Not reviewed.'
      : f?.kind === 'new'
        ? 'Found by our pipeline. Provisional: no catalogued analog site within 150 km.'
        : f?.kind === 'known'
          ? literature
            ? 'Studied by other teams. Values from published papers.'
            : 'Studied by other teams. Run through our pipeline to check the method.'
          : f?.status ?? null;

  const curated =
    f?.why || (cmp && analysis ? autoDescription(site, analysis, data.features, cmp.label) : f?.description || 'Pick a target or describe an environment to see how this place compares.');

  const earthImg = f?.images?.eo ?? f?.images?.earth;
  const views: HeroView[] = [
    {
      id: 'earth',
      label: 'Earth site',
      src: earthImg,
      caption: f?.images?.eo ? 'Landsat 8/9 + Sentinel-2 composite' : 'Earth surface imagery',
    },
    {
      id: 'target',
      label: `${bodyName} target`,
      src: f?.images?.target ?? target?.imagery,
      caption: body === 'mars' ? 'HRSC+MOLA DEM' : 'LRO LOLA hillshade',
    },
  ];
  if (f?.images?.twin) views.push({ id: 'twin', label: 'Twin', src: f.images.twin, caption: 'This site beside its target' });

  const rowsForAi: ExplainRow[] = (analysis?.rows ?? [])
    .filter((r) => r.diff !== null && r.weight > 0)
    .map((r) => {
      const fd = data.features.find((x) => x.key === r.key)!;
      return { label: fd.label, unit: fd.unit, earth: site.raw(r.key), target: targetRaw(r, fd, target), level: r.level };
    });

  return (
    <div className="flex h-full min-h-0 flex-col" key={siteId}>
      <header className="rise-in flex shrink-0 items-start gap-3 border-b border-white/10 px-4 pb-3 pt-4" style={idx(0)}>
        <BackLink />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] leading-tight">{site.name}</h2>
          {site.region && <p className="mt-0.5 truncate text-[13px] text-[var(--dim)]">{site.region}</p>}
          <p className="num mt-0.5 text-xs text-[var(--faint)]">{formatLatLon(site.lat, site.lon)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={f?.kind === 'new' || site.kind === 'cell' ? 'accent' : 'mid'}>{badge}</Badge>
            {f?.status && f.kind !== 'reserve' && <span className="text-xs text-[var(--dim)]">{f.status}</span>}
          </div>
          {origin && <p className="mt-1.5 text-[12px] leading-4 text-[var(--dim)]">{origin}</p>}
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-4">
        <div className="rise-in" style={idx(1)}>
          <HeroImage views={views} lat={site.lat} lon={site.lon} name={site.name} />
        </div>

        <section className="rise-in" style={idx(2)} aria-labelledby="x3d-h">
          <h3 id="x3d-h" className="mb-2 font-display text-[15px]">Explore in 3D</h3>
          <div className="grid grid-cols-3 gap-2">
            {f?.twin ? (
              <ActionTile
                to={`/lab/${site.id}${search}`}
                icon={Mountain}
                title="Terrain twin"
                sub={`Beside ${bodyName} terrain, same scale`}
                primary
              />
            ) : (
              <ActionTile icon={Mountain} title="Terrain twin" sub="Not built for this site" />
            )}
            <ActionTile to={`/tour/${site.id}`} icon={Footprints} title="Walk the site" sub="Ground-level view" primary={!f?.twin} />
            {target ? (
              <ActionTile to={`/compare/${site.id}/${target.id}`} icon={Columns2} title="Side by side" sub={`Globe and ${target.name}`} />
            ) : (
              <ActionTile icon={Columns2} title="Side by side" sub="No target to compare" />
            )}
          </div>
          {target && (
            <Link
              to={`/target/${target.id}`}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[var(--dim)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
            >
              <Orbit size={13} aria-hidden /> Open {target.name} on its own
            </Link>
          )}
        </section>

        <section className="rise-in flex items-center gap-4" style={idx(3)} aria-label="Match score">
          {score !== null ? (
            <ScoreRing score={score} />
          ) : (
            <div className="num glass-capsule grid h-[76px] w-[76px] place-items-center text-sm text-[var(--faint)]">n/a</div>
          )}
          <div className="min-w-0">
            <p className="font-display text-base leading-tight">{cmp ? `vs ${cmp.label}` : 'No comparison yet'}</p>
            <p className="mt-1 text-xs text-[var(--dim)]">
              {score !== null ? 'Closeness across the measured conditions, out of 100.' : 'Choose a target on the left or describe an environment.'}
            </p>
            {analysis?.score && analysis.score.confidence < 0.75 && (
              <p className="mt-1 text-xs text-[var(--mid)]">Partial data: {Math.round((1 - analysis.score.confidence) * 100)}% of this comparison has no data (the site or the target lacks a value).</p>
            )}
          </div>
        </section>

        <WhySection
          key={`${siteId}:${curated}`}
          curated={curated}
          input={{ siteName: site.name, region: site.region, targetName: cmp?.label ?? target?.name ?? bodyName, body, rows: rowsForAi, curated }}
          datasets={siteDatasets(f, data.features, body, target)}
        />

        {analysis && cmp && (
          <section className="rise-in" style={idx(4)} aria-labelledby="mb-h">
            <h3 id="mb-h" className="mb-2 font-display text-[15px]">Match and gap</h3>
            <MatchBars rows={analysis.rows} features={data.features} siteRaw={site.raw} target={cmp.target} targetLabel={cmp.label} body={body} />
          </section>
        )}

        {f && f.gaps.length > 0 && (
          <section className="rise-in" style={idx(5)} aria-labelledby="gap-h">
            <h3 id="gap-h" className="mb-2 font-display text-[15px]">The numbers that differ</h3>
            <ul className="space-y-2">
              {f.gaps.map((g) => {
                const d = formatDelta(g.earth, g.target, g.unit);
                return (
                  <li key={g.label} className="border-l border-[var(--bad)]/60 pl-3 text-[13px] leading-snug text-[var(--ink)]">
                    {g.label}: <span className="num">{formatUnit(g.earth, g.unit)}</span> here vs{' '}
                    <span className="num">{formatUnit(g.target, g.unit)}</span> at {cmp?.label ?? target?.name ?? bodyName}
                    {d && <span className="num ml-1 text-[var(--bad)]">({d})</span>}
                    {g.note && <span className="mt-0.5 block text-xs leading-snug text-[var(--dim)]">{g.note}</span>}
                    {gapSource(g.label, data.features, body, target) && (
                      <span className="mt-0.5 block text-[10.5px] leading-3 text-[var(--dim)]">Source: {gapSource(g.label, data.features, body, target)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(literature || (f && f.caveats.length > 0)) && (
          <section className="rise-in" style={idx(6)} aria-labelledby="cav-h">
            <h3 id="cav-h" className="mb-2 font-display text-[15px]">Read before presenting</h3>
            {literature && (
              <p className="mb-2 rounded-[12px] border border-[var(--mid)]/50 bg-[var(--mid)]/10 px-3 py-2 text-xs text-[var(--mid)]">
                Values from the literature, not computed from Earth observation data.
              </p>
            )}
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--dim)] marker:text-[var(--faint)]">
              {f?.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </section>
        )}

        {f && f.references.length > 0 && (
          <section className="rise-in" style={idx(7)} aria-labelledby="ref-h">
            <h3 id="ref-h" className="mb-2 font-display text-[15px]">Data sources</h3>
            <ul className="space-y-1.5">
              {f.references.map((r) => (
                <li key={r.url}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-1.5 text-[12.5px] leading-snug text-[var(--ink)]/85 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                  >
                    <ExternalLink size={12} aria-hidden className="mt-[3px] shrink-0" />
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
            <Link to="/method" className="mt-2 inline-block text-[12px] text-[var(--dim)] underline-offset-2 hover:text-[var(--ink)] hover:underline">
              Full method and every dataset
            </Link>
          </section>
        )}

        <details className="rise-in group" style={idx(8)}>
          <summary className="flex list-none items-center justify-between font-display text-[15px] text-[var(--dim)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            What no Earth site can reproduce
            <span aria-hidden className="num text-[var(--faint)] transition-transform group-open:rotate-90">{'>'}</span>
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--dim)] marker:text-[var(--faint)]">
            {GLOBAL_LIMITS.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </details>
      </div>

    </div>
  );
}

function WhySection({ curated, input, datasets }: { curated: string; input: Parameters<typeof explainSite>[0]; datasets: string[] }) {
  const [text, setText] = useState(curated);
  const [pending, setPending] = useState(false);
  const [ai, setAi] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const ask = async () => {
    setPending(true);
    try {
      const res = await explainSite(input);
      if (!alive.current) return;
      if (res.mode === 'llm' && res.text) {
        setText(res.text);
        setAi(true);
      }
    } catch {
      /* keep the curated text */
    } finally {
      if (alive.current) setPending(false);
    }
  };

  return (
    <section className="rise-in" style={idx(4)} aria-labelledby="why-h">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 id="why-h" className="font-display text-[15px]">Why it matches</h3>
        {!ai && (
          <button
            type="button"
            onClick={ask}
            disabled={pending}
            className="text-xs text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-60"
          >
            {pending ? 'Asking' : 'Ask AI'}
          </button>
        )}
      </div>
      <p className="text-[13.5px] leading-relaxed text-[var(--ink)]/90" aria-live="polite">
        {text}
        {pending && <span aria-hidden className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-[var(--accent)]" style={{ animation: 'blink-cursor 900ms steps(1) infinite' }} />}
      </p>
      {ai && <p className="mt-1.5 text-[11px] text-[var(--dim)]">AI-written from these numbers</p>}
      {datasets.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="Datasets behind this text">
          <span className="text-[11px] text-[var(--dim)]">Based on</span>
          {datasets.map((d) => (
            <span key={d} className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-[1px] text-[11px] leading-4 text-[var(--ink)]/80">
              {d}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
