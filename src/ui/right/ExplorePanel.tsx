import { ArrowLeft, Columns2, Footprints, Mountain, Orbit } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatLatLon } from '../../lib/geo';
import { GLOBAL_LIMITS, autoDescription, targetRaw } from '../../lib/sites';
import { useSiteAnalysis } from '../../lib/useSite';
import { explainSite, type ExplainRow } from '../../parse/explainClient';
import { HandNote } from './HandNote';
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

export function ExplorePanel({ siteId }: { siteId: string }) {
  const info = useSiteAnalysis(siteId);

  if (!info) {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <BackLink />
        <h2 className="font-display text-xl">Site not found</h2>
        <p className="text-sm text-[var(--dim)]">That site is not in the current data. Go back and pick another candidate.</p>
      </div>
    );
  }

  const { data, site, cmp, analysis, result } = info;
  const f = site.featured;
  const score = result?.score ?? analysis?.score?.score ?? null;
  const target = cmp?.target ?? data.targets.find((t) => t.id === f?.analogFor[0]) ?? null;
  const body = target?.body ?? f?.body ?? 'moon';
  const bodyName = body === 'mars' ? 'Mars' : 'Moon';
  const literature = f?.valueSource === 'literature';
  const badge = site.kind === 'cell' ? 'Engine match' : f?.kind === 'new' ? 'New candidate' : f?.kind === 'known' ? 'Known analog' : 'Candidate';

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

  const heightM = f?.tour?.spawn.heightM ?? 1.7;

  return (
    <div className="flex h-full min-h-0 flex-col" key={siteId}>
      <header className="rise-in flex shrink-0 items-start gap-3 border-b border-white/10 px-4 pb-3 pt-4" style={idx(0)}>
        <BackLink />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] leading-tight">{site.name}</h2>
          {site.region && <p className="mt-0.5 truncate text-[13px] text-[var(--dim)]">{site.region}</p>}
          <p className="num mt-0.5 text-xs text-[var(--faint)]">{formatLatLon(site.lat, site.lon)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>{badge}</Badge>
            {literature && <Badge tone="mid">Literature values</Badge>}
            {f?.status && <span className="text-xs text-[var(--dim)]">{f.status}</span>}
          </div>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-4">
        <div className="rise-in" style={idx(1)}>
          <HeroImage views={views} lat={site.lat} lon={site.lon} name={site.name} />
        </div>

        <section className="rise-in flex items-center gap-4" style={idx(2)} aria-label="Match score">
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
              <p className="mt-1 text-xs text-[var(--mid)]">Partial data: {Math.round((1 - analysis.score.confidence) * 100)}% of the weight has no value here.</p>
            )}
          </div>
        </section>

        <WhySection
          key={`${siteId}:${curated.length}`}
          curated={curated}
          input={{ siteName: site.name, region: site.region, targetName: cmp?.label ?? target?.name ?? bodyName, body, rows: rowsForAi, curated }}
        />

        {analysis && cmp && (
          <section className="rise-in" style={idx(4)} aria-labelledby="mb-h">
            <h3 id="mb-h" className="mb-2 font-display text-[15px]">Match and gap</h3>
            <MatchBars rows={analysis.rows} features={data.features} siteRaw={site.raw} target={cmp.target} targetLabel={cmp.label} />
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
                    {g.note && <span className="block text-xs text-[var(--dim)]">{g.note}</span>}
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

        <details className="rise-in group" style={idx(7)}>
          <summary className="flex list-none items-center justify-between font-display text-[15px] text-[var(--dim)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            What no Earth site can reproduce
            <span aria-hidden className="num text-[var(--faint)] transition-transform group-open:rotate-90">{'>'}</span>
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--dim)] marker:text-[var(--faint)]">
            {GLOBAL_LIMITS.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </details>
      </div>

      <footer className="no-print relative shrink-0 border-t border-white/10 bg-black/25 px-4 pb-4 pt-7">
        <HandNote className="absolute top-1 right-[84px]">{`walk it at ${heightM} m eye height`}</HandNote>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-2">
            {site.featured?.twin && (
              <Link
                to={`/lab/${site.id}${window.location.search}`}
                className="glass-capsule flex items-center gap-2 px-3.5 py-1.5 text-[13px] font-medium text-[var(--accent)]"
                style={{ boxShadow: '0 0 18px -6px var(--accent)' }}
              >
                <Mountain size={14} aria-hidden /> Twin terrain lab
              </Link>
            )}
            {target && (
              <Link
                to={`/compare/${site.id}/${target.id}`}
                className="glass-capsule flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)]/85 hover:text-[var(--ink)]"
              >
                <Columns2 size={14} aria-hidden /> Compare
              </Link>
            )}
            {target && (
              <Link
                to={`/target/${target.id}`}
                className="glass-capsule flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)]/85 hover:text-[var(--ink)]"
              >
                <Orbit size={14} aria-hidden /> Target view
              </Link>
            )}
          </div>
          <Link
            to={`/tour/${site.id}`}
            aria-label={`Enter site: ${site.name}`}
            className="group flex flex-col items-center gap-1"
          >
            <span className="glass-drop grid h-16 w-16 place-items-center">
              <Footprints size={26} aria-hidden />
            </span>
            <span className="text-xs text-[var(--ink)]">Enter site</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}

function WhySection({ curated, input }: { curated: string; input: Parameters<typeof explainSite>[0] }) {
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
    <section className="rise-in" style={idx(3)} aria-labelledby="why-h">
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
      {ai && <p className="mt-1.5 text-[11px] text-[var(--faint)]">AI-written from these numbers</p>}
    </section>
  );
}
