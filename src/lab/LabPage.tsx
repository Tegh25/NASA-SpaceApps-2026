import { ArrowLeft, ChevronDown, ChevronUp, Orbit, Pause, Play, ScanLine, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { loadHeightmap } from '../data/loaders';
import { useApp } from '../state/store';
import { BIN_DEG, fingerprint, histogramOverlap, type Fingerprint } from './fingerprint';
import { LabScene, prepareHeights, type Layout } from './labScene';

type Loaded = { elev: Float32Array; w: number; h: number; mpp: number; isMock: boolean };
type LoadState =
  | { status: 'loading' }
  | { status: 'done'; earth: Loaded | null; moon: Loaded | null; earthErr?: string; moonErr?: string };

const SAND = '#D9B882';

function load(path: string | undefined): Promise<Loaded> {
  if (!path) return Promise.reject(new Error('No heightmap path'));
  return loadHeightmap(path).then(({ hm, elev, isMock }) => ({ elev, w: hm.width, h: hm.height, mpp: hm.metersPerPixel, isMock }));
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

export default function LabPage() {
  const { siteId } = useParams();
  const { search } = useLocation();
  const data = useApp((s) => s.data);
  const featured = data?.featured.find((f) => f.id === siteId);
  const target = data?.targets.find((t) => t.id === featured?.analogFor[0]);
  const twin = (featured as unknown as { twin?: { earthHeightmap?: string; moonHeightmap?: string } } | undefined)?.twin;
  const earthPath = featured ? (twin?.earthHeightmap ?? `heightmaps/earth/${featured.id}.json`) : undefined;
  const otherPath = featured ? (twin?.moonHeightmap ?? target?.heightmap) : undefined;
  const body = target?.body ?? 'moon';
  const bodyName = body === 'mars' ? 'Mars' : 'Moon';

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    if (!featured) return;
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.allSettled([load(earthPath), load(otherPath)]).then(([e, m]) => {
      if (cancelled) return;
      setState({
        status: 'done',
        earth: e.status === 'fulfilled' ? e.value : null,
        moon: m.status === 'fulfilled' ? m.value : null,
        earthErr: e.status === 'rejected' ? String(e.reason?.message ?? e.reason) : undefined,
        moonErr: m.status === 'rejected' ? String(m.reason?.message ?? m.reason) : undefined,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [featured, earthPath, otherPath]);

  const earth = state.status === 'done' ? state.earth : null;
  const moon = state.status === 'done' ? state.moon : null;
  const both = !!(earth && moon);

  const fp = useMemo(() => {
    if (state.status !== 'done') return null;
    const f = (l: Loaded | null): Fingerprint | null => (l ? fingerprint(l.elev, l.w, l.h, l.mpp) : null);
    const e = f(state.earth);
    const m = f(state.moon);
    return { earth: e, moon: m, overlap: e && m ? histogramOverlap(e.hist, m.hist) : null };
  }, [state]);

  // ---- controls ------------------------------------------------------------------------------
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [layout, setLayout] = useState<Layout>('side');
  const [t, setT] = useState(0);
  const [exag, setExag] = useState(1.5);
  const [sunEl, setSunEl] = useState(28);
  const [sunAz, setSunAz] = useState(135);
  const [contours, setContours] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(!reduced);
  const [morphAnim, setMorphAnim] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const effLayout: Layout = both ? layout : 'side';
  const params = { layout: effLayout, t, exag, sunEl, sunAz, contours, autoOrbit, morphAnim: morphAnim && both && effLayout === 'morph' };
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LabScene | null>(null);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    if (state.status !== 'done' || (!earth && !moon) || !hostRef.current) return;
    let scene: LabScene;
    try {
      const pe = earth ? prepareHeights(earth.elev, earth.w, earth.h) : null;
      const pm = moon ? prepareHeights(moon.elev, moon.w, moon.h) : null;
      scene = new LabScene({
        host: hostRef.current,
        earth: pe,
        other: pm,
        body,
        snowFrac: Number(featured?.values?.snow_frac ?? 0) || 0,
        reducedMotion: reduced,
        onInteract: () => setAutoOrbit(false),
        onT: (v) => setT(v),
      });
    } catch (e) {
      console.warn(e);
      setWebglError(true);
      return;
    }
    sceneRef.current = scene;
    scene.set(paramsRef.current);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [state, earth, moon, body, featured, reduced]);

  useEffect(() => {
    sceneRef.current?.set(params);
  });

  const stopAnim = () => setMorphAnim(false);
  const toggleAnim = useCallback(() => {
    if (!both) return;
    setLayout('morph');
    setMorphAnim((a) => !a);
  }, [both]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'slider')) return;
      switch (e.key) {
        case '1':
          setLayout('side');
          setMorphAnim(false);
          break;
        case '2':
          if (both) setLayout('morph');
          break;
        case 'm':
        case 'M':
          toggleAnim();
          break;
        case 'ArrowLeft':
          setSunAz((a) => (a + 355) % 360);
          break;
        case 'ArrowRight':
          setSunAz((a) => (a + 5) % 360);
          break;
        case 'ArrowUp':
          setSunEl((v) => Math.min(75, +(v + (v < 5 ? 0.5 : 2)).toFixed(1)));
          break;
        case 'ArrowDown':
          setSunEl((v) => Math.max(0.5, +(v - (v <= 5 ? 0.5 : 2)).toFixed(1)));
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [both, toggleAnim]);

  // ---- guards --------------------------------------------------------------------------------
  if (!data) return <Shell>Loading site data</Shell>;
  if (!featured)
    return (
      <Shell>
        <p className="mb-2">Unknown site.</p>
        <Link to="/" className="underline">
          Back to the globe
        </Link>
      </Shell>
    );

  const sceneReady = state.status === 'done' && (earth || moon) && !webglError;
  const fmtNum = (v: number | null) => (v === null ? 'n/a' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en') : String(Math.round(v * 100) / 100));
  const gaps = (
    featured.gaps.length
      ? featured.gaps.map((g) => `${g.label}: ${fmtNum(g.earth)} vs ${fmtNum(g.target)}${g.unit ? ' ' + g.unit : ''}`)
      : featured.shortfalls
  ).slice(0, 4);
  const nameOther = target?.name ?? `${bodyName} region`;
  const mock = !!(earth?.isMock || moon?.isMock);

  return (
    <div data-body={body === 'mars' ? 'mars' : 'moon'} className="absolute inset-0 z-10 overflow-hidden bg-[var(--void)] text-[var(--ink)]">
      <div ref={hostRef} className="absolute inset-0" aria-hidden={!sceneReady} />

      {state.status === 'loading' && (
        <div className="grid-paper absolute inset-0 grid place-items-center" role="status">
          <p className="panel px-4 py-2 text-[13px] text-[var(--dim)]">Loading the two terrain blocks</p>
        </div>
      )}
      {state.status === 'done' && !earth && !moon && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="panel max-w-md p-5" role="alert">
            <p className="font-display mb-1 text-lg">No terrain data for this site yet</p>
            <p className="text-sm text-[var(--dim)]">Neither the Earth block nor the {bodyName} region could be loaded.</p>
          </div>
        </div>
      )}
      {webglError && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="panel max-w-md p-5" role="alert">
            <p className="font-display mb-1 text-lg">The 3D view could not start</p>
            <p className="text-sm text-[var(--dim)]">WebGL 2 with float textures is needed. Try another browser or turn on hardware acceleration.</p>
          </div>
        </div>
      )}

      {/* HUD, top left */}
      <header className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 md:left-4 md:top-4">
        <Link
          to={`/site/${featured.id}${search}`}
          aria-label="Back to the site"
          className="panel pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[var(--dim)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={14} aria-hidden /> Back to site
        </Link>
        <div className="panel pointer-events-auto px-3.5 py-2.5">
          <h1 className="font-display text-[19px] leading-tight md:text-[22px]">{featured.name}</h1>
          <p className="font-display mt-0.5 flex flex-wrap items-center gap-2 text-[14px] text-[var(--dim)]">
            <span>vs {nameOther}</span>
            <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-2 py-px text-[11px] text-[var(--accent)]">
              {bodyName}
            </span>
            {mock && <span className="rounded-full border border-[var(--mid)] px-2 py-px text-[11px] text-[var(--mid)]">Sample data</span>}
          </p>
        </div>
        {state.status === 'done' && !earth && moon && (
          <div className="panel pointer-events-auto flex max-w-[300px] items-start gap-2 px-3 py-2 text-[13px]" role="status">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[var(--mid)]" aria-hidden />
            <span>
              Earth terrain twin not built yet. Showing the {bodyName} region on its own.
              <span className="hand mt-0.5 block text-[17px]">the Earth half is on its way</span>
            </span>
          </div>
        )}
        {state.status === 'done' && earth && !moon && (
          <div className="panel pointer-events-auto flex max-w-[300px] items-start gap-2 px-3 py-2 text-[13px]" role="status">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[var(--mid)]" aria-hidden />
            <span>No {bodyName} elevation grid for this pairing. Showing the Earth block on its own.</span>
          </div>
        )}
      </header>

      {/* HUD, bottom left */}
      <div className="pointer-events-none absolute bottom-[158px] left-3 z-10 hidden max-w-[300px] md:bottom-4 md:left-4 md:block">
        <div className="mb-1.5 flex items-center gap-2" aria-hidden>
          <div className="h-[7px] w-24 border-x border-b border-[var(--ink)]/70" />
          <span className="num text-[13px]">10.24 km</span>
        </div>
        <p className="num text-[10.5px] leading-snug text-[var(--dim)]">
          40 m per pixel, real elevation
          <br />
          Copernicus GLO-30 / {body === 'mars' ? 'MOLA' : 'LRO LOLA'}
        </p>
        {body !== 'mars' && <p className="mt-1 text-[11px] leading-snug text-[var(--faint)]">Moon grid is polar stereographic, not north-up.</p>}
      </div>

      {/* Fingerprint panel */}
      <aside
        aria-label="Terrain fingerprint"
        className={`panel scroll-thin absolute z-30 flex flex-col overflow-y-auto
          inset-x-2 bottom-2 rounded-b-[4px] transition-[max-height] duration-300 ease-[var(--ease-out-quint)]
          md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:w-[316px] md:max-h-none
          ${drawer ? 'max-h-[62vh]' : 'max-h-[46px] overflow-hidden'} md:overflow-y-auto`}
      >
        <button
          type="button"
          onClick={() => setDrawer((d) => !d)}
          aria-expanded={drawer}
          aria-label={drawer ? 'Collapse fingerprint' : 'Expand fingerprint'}
          className="flex w-full shrink-0 items-center justify-between px-3.5 py-3 text-left md:hidden"
        >
          <span className="font-display text-[15px]">Fingerprint overlap {fp?.overlap != null ? <span className="num">{Math.round(fp.overlap * 100)} %</span> : null}</span>
          {drawer ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
        </button>
        <div className="space-y-3.5 px-3.5 pb-4 md:pt-4">
          <FingerprintBody fp={fp} bodyName={bodyName} otherName={nameOther} hasEarth={!!earth} hasOther={!!moon} gaps={gaps} />
        </div>
      </aside>

      {/* Dock */}
      <Dock
        both={both}
        layout={effLayout}
        setLayout={(l) => {
          setLayout(l);
          if (l === 'side') setMorphAnim(false);
        }}
        t={t}
        setT={(v) => {
          stopAnim();
          setT(v);
        }}
        morphAnim={morphAnim && effLayout === 'morph'}
        toggleAnim={toggleAnim}
        exag={exag}
        setExag={setExag}
        sunEl={sunEl}
        setSunEl={setSunEl}
        sunAz={sunAz}
        setSunAz={setSunAz}
        contours={contours}
        setContours={setContours}
        autoOrbit={autoOrbit}
        setAutoOrbit={setAutoOrbit}
        replay={() => sceneRef.current?.replayScan()}
        bodyName={bodyName}
        reduced={reduced}
      />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--void)]">
      <div className="panel p-5 text-sm text-[var(--dim)]">{children}</div>
    </div>
  );
}

// ---- fingerprint ---------------------------------------------------------------------------

function FingerprintBody({
  fp,
  bodyName,
  otherName,
  hasEarth,
  hasOther,
  gaps,
}: {
  fp: { earth: Fingerprint | null; moon: Fingerprint | null; overlap: number | null } | null;
  bodyName: string;
  otherName: string;
  hasEarth: boolean;
  hasOther: boolean;
  gaps: string[];
}) {
  const overlap = fp?.overlap;
  const note =
    overlap == null ? 'one half of the pair is missing' : overlap >= 0.7 ? 'same slopes, different sky' : overlap >= 0.45 ? 'close in places, honest about the rest' : 'the slopes only partly agree';
  return (
    <>
      <div>
        <h2 className="font-display text-[15px] leading-tight">Slope fingerprint</h2>
        <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--dim)]">How much of each block sits at each slope, from the same 40 m elevation grid.</p>
      </div>
      {fp && <SlopeChart earth={fp.earth} other={fp.moon} bodyName={bodyName} />}
      <div className="flex items-baseline justify-between gap-3 border-y border-[var(--rule)] py-2">
        <span className="text-[13px]">Fingerprint overlap</span>
        <span className="num text-[24px] leading-none text-[var(--accent)]" aria-live="polite">
          {overlap != null ? `${Math.round(overlap * 100)} %` : 'n/a'}
        </span>
      </div>
      {fp && (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--dim)]">
              <th className="pb-1 font-normal" />
              <th className="pb-1 text-right font-normal" style={{ color: SAND }}>
                Earth
              </th>
              <th className="pb-1 text-right font-normal text-[var(--moon)]">{bodyName}</th>
            </tr>
          </thead>
          <tbody className="num">
            <Row label="Slope p50" a={fp.earth && `${fmt(fp.earth.p50)}°`} b={fp.moon && `${fmt(fp.moon.p50)}°`} />
            <Row label="Slope p90" a={fp.earth && `${fmt(fp.earth.p90)}°`} b={fp.moon && `${fmt(fp.moon.p90)}°`} />
            <Row label="Relief" a={fp.earth && `${Math.round(fp.earth.reliefM)} m`} b={fp.moon && `${Math.round(fp.moon.reliefM)} m`} />
          </tbody>
        </table>
      )}
      {!hasEarth && <p className="text-[12px] text-[var(--mid)]">Earth terrain twin not built yet, so there is nothing to overlap.</p>}
      {!hasOther && <p className="text-[12px] text-[var(--mid)]">No {bodyName} elevation grid for {otherName}.</p>}
      <p className="hand -rotate-1 text-[22px]">{note}</p>
      {gaps.length > 0 && (
        <div>
          <h3 className="font-display mb-1 text-[13px]">What does not carry over</h3>
          <ul className="space-y-1">
            {gaps.map((g) => (
              <li key={g} className="flex gap-2 text-[12px] leading-snug text-[var(--dim)]">
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bad)]" aria-hidden />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Row({ label, a, b }: { label: string; a: string | null | undefined; b: string | null | undefined }) {
  return (
    <tr className="border-t border-[var(--rule)]">
      <td className="py-1 font-sans text-[var(--dim)]">{label}</td>
      <td className="py-1 text-right">{a ?? 'n/a'}</td>
      <td className="py-1 text-right">{b ?? 'n/a'}</td>
    </tr>
  );
}

function SlopeChart({ earth, other, bodyName }: { earth: Fingerprint | null; other: Fingerprint | null; bodyName: string }) {
  const W = 288;
  const H = 96;
  const pad = { l: 4, r: 4, t: 6, b: 16 };
  const hists = [earth?.hist, other?.hist].filter(Boolean) as number[][];
  if (!hists.length) return null;
  const smoothed = (h: number[]) => h.map((v, i) => (h[i - 1] ?? v) * 0.25 + v * 0.5 + (h[i + 1] ?? v) * 0.25);
  const e = earth ? smoothed(earth.hist) : null;
  const m = other ? smoothed(other.hist) : null;
  const bins = hists[0].length;
  const yMax = Math.max(0.02, ...(e ?? []), ...(m ?? [])) * 1.08;
  const x = (i: number) => pad.l + ((i + 0.5) / bins) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const base = H - pad.b;
  const line = (h: number[]) => h.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = (h: number[]) => `${line(h)} L${x(h.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`;
  const inter = e && m ? e.map((v, i) => Math.min(v, m[i])) : null;
  const ticks = [0, 15, 30, 45, 60];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Slope histograms, Earth against the ${bodyName}, from 0 to 60 degrees`}>
        {ticks.map((tk) => {
          const tx = pad.l + (tk / (bins * BIN_DEG)) * (W - pad.l - pad.r);
          return (
            <g key={tk}>
              <line x1={tx} x2={tx} y1={pad.t} y2={base} stroke="var(--rule)" strokeWidth={1} />
              <text x={tx} y={H - 3} textAnchor={tk === 0 ? 'start' : tk === 60 ? 'end' : 'middle'} fontSize={9} fill="var(--dim)" className="num">
                {tk}°
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} stroke="var(--rule-hi)" />
        {e && <path d={area(e)} fill={SAND} fillOpacity={0.28} />}
        {m && <path d={area(m)} fill="var(--moon)" fillOpacity={0.24} />}
        {inter && <path d={area(inter)} fill="#fff" fillOpacity={0.16} />}
        {e && <path d={line(e)} fill="none" stroke={SAND} strokeWidth={1.5} strokeLinejoin="round" />}
        {m && <path d={line(m)} fill="none" stroke="var(--moon)" strokeWidth={1.5} strokeLinejoin="round" />}
      </svg>
      <figcaption className="mt-1 flex items-center gap-3 text-[11px] text-[var(--dim)]">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm" style={{ background: SAND }} /> Earth
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm bg-[var(--moon)]" /> {bodyName}
        </span>
        {inter && (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm bg-white/30" /> Overlap
          </span>
        )}
      </figcaption>
    </figure>
  );
}

// ---- dock ----------------------------------------------------------------------------------

interface DockProps {
  both: boolean;
  layout: Layout;
  setLayout: (l: Layout) => void;
  t: number;
  setT: (v: number) => void;
  morphAnim: boolean;
  toggleAnim: () => void;
  exag: number;
  setExag: (v: number) => void;
  sunEl: number;
  setSunEl: (v: number) => void;
  sunAz: number;
  setSunAz: (v: number) => void;
  contours: boolean;
  setContours: (v: boolean) => void;
  autoOrbit: boolean;
  setAutoOrbit: (v: boolean) => void;
  replay: () => void;
  bodyName: string;
  reduced: boolean;
}

const chip =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors whitespace-nowrap';
const chipOff = 'border-[var(--rule-hi)] text-[var(--dim)] hover:text-[var(--ink)]';
const chipOn = 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--ink)]';

function Dock(p: DockProps) {
  const fill = (v: number, lo: number, hi: number) => ({ ['--fill' as string]: `${((v - lo) / (hi - lo)) * 100}%` }) as React.CSSProperties;
  const lunar = p.sunEl <= 2;
  const noon = Math.abs(p.sunEl - 70) < 0.6;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[58px] z-20 flex justify-center px-2 md:bottom-4 md:pl-[336px] md:pr-[348px]">
      <div
        role="toolbar"
        aria-label="Lab controls"
        className="panel scroll-thin pointer-events-auto flex w-full max-w-[1040px] flex-nowrap items-center gap-x-4 gap-y-2 overflow-x-auto rounded-[22px] px-3.5 py-2.5 md:flex-wrap md:justify-center md:overflow-visible"
      >
        <div role="group" aria-label="Layout" className="flex shrink-0 gap-1">
          <button type="button" aria-pressed={p.layout === 'side'} aria-label="Side by side layout, shortcut 1" onClick={() => p.setLayout('side')} className={`${chip} ${p.layout === 'side' ? chipOn : chipOff}`}>
            Side by side
          </button>
          <button
            type="button"
            aria-pressed={p.layout === 'morph'}
            aria-label="Morph layout, shortcut 2"
            disabled={!p.both}
            title={p.both ? undefined : 'Needs both terrain blocks'}
            onClick={() => p.setLayout('morph')}
            className={`${chip} ${p.layout === 'morph' ? chipOn : chipOff} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Morph
          </button>
        </div>

        {p.layout === 'morph' && p.both && (
          <div className="flex min-w-[280px] shrink-0 items-center gap-2.5 md:min-w-[300px]">
            <span className="font-display text-[13px]" style={{ color: SAND }}>
              Earth
            </span>
            <input
              type="range"
              className="metric flex-1"
              min={0}
              max={1}
              step={0.005}
              value={p.t}
              aria-label={`Morph from Earth to ${p.bodyName}`}
              style={fill(p.t, 0, 1)}
              onChange={(e) => p.setT(Number(e.target.value))}
            />
            <span className="font-display text-[13px] text-[var(--accent)]">{p.bodyName}</span>
            <button
              type="button"
              aria-label={p.morphAnim ? 'Pause morph animation, shortcut M' : 'Play morph animation, shortcut M'}
              aria-pressed={p.morphAnim}
              onClick={p.toggleAnim}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${p.morphAnim ? chipOn : chipOff}`}
            >
              {p.morphAnim ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            </button>
          </div>
        )}

        <Labeled label="Vertical" value={`${p.exag.toFixed(1)}x`}>
          <input type="range" className="metric w-[110px]" min={1} max={3} step={0.1} value={p.exag} aria-label="Vertical exaggeration" style={fill(p.exag, 1, 3)} onChange={(e) => p.setExag(Number(e.target.value))} />
        </Labeled>

        <Labeled label="Sun elevation" value={`${p.sunEl.toFixed(1)}°`}>
          <input type="range" className="metric w-[130px]" min={0.5} max={75} step={0.5} value={p.sunEl} aria-label="Sun elevation in degrees" style={fill(p.sunEl, 0.5, 75)} onChange={(e) => p.setSunEl(Number(e.target.value))} />
        </Labeled>

        <AzDial az={p.sunAz} setAz={p.setSunAz} />

        <div role="group" aria-label="Sun presets" className="flex shrink-0 gap-1">
          <button type="button" aria-pressed={lunar} onClick={() => p.setSunEl(1.5)} className={`${chip} ${lunar ? chipOn : chipOff}`}>
            Lunar south pole sun <span className="num text-[11.5px]">1.5°</span>
          </button>
          <button type="button" aria-pressed={noon} onClick={() => p.setSunEl(70)} className={`${chip} ${noon ? chipOn : chipOff}`}>
            Midday here <span className="num text-[11.5px]">70°</span>
          </button>
        </div>

        <div role="group" aria-label="View options" className="flex shrink-0 gap-1">
          <button type="button" aria-pressed={p.contours} onClick={() => p.setContours(!p.contours)} aria-label="Contour lines every 50 metres" className={`${chip} ${p.contours ? chipOn : chipOff}`}>
            Contours
          </button>
          <button type="button" aria-pressed={p.autoOrbit} onClick={() => p.setAutoOrbit(!p.autoOrbit)} aria-label="Auto orbit" className={`${chip} ${p.autoOrbit ? chipOn : chipOff}`}>
            <Orbit size={14} aria-hidden /> Orbit
          </button>
          {!p.reduced && (
            <button type="button" onClick={p.replay} aria-label="Replay the scan intro" className={`${chip} ${chipOff}`}>
              <ScanLine size={14} aria-hidden /> Scan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <div className="flex items-baseline justify-between text-[11px] text-[var(--dim)]">
        <span>{label}</span>
        <span className="num text-[var(--ink)]">{value}</span>
      </div>
      {children}
    </div>
  );
}

/** Compass dial: drag or use arrow keys when focused. 0 is north, 90 is east. */
function AzDial({ az, setAz }: { az: number; setAz: (v: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const fromEvent = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    setAz(Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360));
  };
  const a = (az * Math.PI) / 180;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <svg
        ref={ref}
        width={42}
        height={42}
        viewBox="-21 -21 42 42"
        role="slider"
        tabIndex={0}
        aria-label="Sun azimuth in degrees, 0 is north"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(az)}
        className="cursor-grab touch-none rounded-full active:cursor-grabbing"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          fromEvent(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) fromEvent(e);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 15 : 5;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setAz((az + step) % 360);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setAz((az + 360 - step) % 360);
          else return;
          e.preventDefault();
        }}
      >
        <circle r={19} fill="rgba(255,255,255,0.04)" stroke="var(--rule-hi)" />
        <text y={-11} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="var(--dim)">
          N
        </text>
        <line x1={0} y1={0} x2={Math.sin(a) * 14} y2={-Math.cos(a) * 14} stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={Math.sin(a) * 14} cy={-Math.cos(a) * 14} r={4} fill="#FFE9B0" stroke="var(--accent)" />
      </svg>
      <div className="text-[11px] leading-tight text-[var(--dim)]">
        <div>Sun azimuth</div>
        <div className="num text-[var(--ink)]">{Math.round(az)}°</div>
      </div>
    </div>
  );
}
