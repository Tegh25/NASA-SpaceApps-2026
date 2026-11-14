import { ArrowLeft, ChevronDown, ChevronUp, HelpCircle, MapPinned, Moon, Orbit, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPhotorealTileset, HAS_ION, whenViewer } from '../globe/viewer';
import { formatLatLon } from '../lib/geo';
import { useSiteAnalysis } from '../lib/useSite';
import { useApp, type Fidelity, type TargetViewProfile } from '../state/store';
import { FeatureTable } from '../ui/FeatureTable';
import { Chip, Segmented } from '../ui/common';
import { TourController, type TourPose } from './controller';
import { Minimap } from './Minimap';
import { TargetViewController } from './targetViewProfile';

const FIDELITY_LABEL: Record<Fidelity, string> = {
  photoreal: 'Photorealistic',
  terrain: 'Terrain and satellite',
  low: 'Low detail',
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function TourView() {
  const { id } = useParams();
  const info = useSiteAnalysis(id);
  const navigate = useNavigate();
  const fidelity = useApp((s) => s.fidelity);
  const profile = useApp((s) => s.targetViewProfile);
  const { setFidelity, setTargetViewProfile } = useApp.getState();
  const [ctl, setCtl] = useState<TourController | null>(null);
  const [pose, setPose] = useState<TourPose | null>(null);
  const [locked, setLocked] = useState(false);
  const [help, setHelp] = useState(false);
  const [matchOpen, setMatchOpen] = useState(true);
  const [wpOpen, setWpOpen] = useState(false);
  const [note, setNote] = useState<{ name: string; note: string } | null>(null);
  const tvRef = useRef<TargetViewController | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const siteKey = info?.site.id;
  const spawn = info?.site.featured?.tour?.spawn ?? (info ? { lat: info.site.lat, lon: info.site.lon, heading: 0 } : null);

  useEffect(() => {
    if (!siteKey || !spawn) return;
    let cancelled = false;
    let controller: TourController | null = null;
    let tileset: Awaited<ReturnType<typeof getPhotorealTileset>> = null;
    (async () => {
      const v = await whenViewer();
      if (cancelled) return;
      tileset = await getPhotorealTileset(v);
      if (cancelled) return;
      if (tileset) {
        tileset.show = true;
        v.scene.globe.show = false;
        setFidelity('photoreal');
      } else {
        setFidelity(HAS_ION ? 'terrain' : 'low');
      }
      tvRef.current = new TargetViewController(v);
      controller = new TourController(v, { spawn, tileset, onPointerLock: setLocked });
      setCtl(controller);
      await controller.start();
      if (cancelled) controller.stop();
    })();
    return () => {
      cancelled = true;
      controller?.stop();
      tvRef.current?.dispose();
      tvRef.current = null;
      if (tileset) tileset.show = false;
      whenViewer().then((v) => {
        v.scene.globe.show = true;
      });
      setTargetViewProfile('off');
      setCtl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  useEffect(() => {
    if (!ctl) return;
    const t = setInterval(() => setPose({ ...ctl.pose }), 100);
    return () => clearInterval(t);
  }, [ctl]);

  useEffect(() => {
    tvRef.current?.apply(profile);
  }, [profile, ctl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) setHelp((h) => !h);
      if (e.key === 'Escape' && !document.pointerLockElement) setHelp(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!info) {
    return (
      <div className="absolute inset-0 z-10 grid place-items-center">
        <div className="panel p-5">
          <p className="mb-2">Loading site...</p>
          <button type="button" className="underline" onClick={() => navigate('/')}>
            Back to the globe
          </button>
        </div>
      </div>
    );
  }

  const { site, data, cmp, analysis } = info;
  const analogTargets = (site.featured?.analogFor ?? []).map((t) => data.targets.find((x) => x.id === t)).filter((t) => !!t);
  const waypoints = site.featured?.tour?.waypoints ?? [];
  const headingDeg = pose ? (pose.heading * 180) / Math.PI : 0;
  const exit = () => navigate(`/site/${site.id}`);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Top-left: site info */}
      <div className="panel pointer-events-auto absolute left-4 top-4 max-w-[min(420px,calc(100vw-2rem))] p-3">
        <button
          type="button"
          onClick={exit}
          className="mb-2 flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-sm hover:bg-white/10"
        >
          <ArrowLeft size={15} aria-hidden /> Exit tour
        </button>
        <h1 className="text-lg font-semibold leading-tight">{site.name}</h1>
        <p className="text-xs text-[var(--muted)]">{site.region}</p>
        {analogTargets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="self-center text-[11px] text-[var(--muted)]">Analog for</span>
            {analogTargets.map((t) => (
              <Chip key={t.id} tone={t.body}>
                {t.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Top-right: target view + fidelity */}
      <div className="pointer-events-auto absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="panel flex items-center gap-2 p-1.5">
          <span className="pl-1.5 text-xs text-[var(--muted)]">Target View</span>
          <Segmented<TargetViewProfile>
            size="sm"
            label="Target View"
            value={profile}
            onChange={setTargetViewProfile}
            options={[
              { value: 'off', label: 'Earth' },
              { value: 'moon', label: 'Moon' },
              { value: 'mars', label: 'Mars' },
            ]}
          />
          <button
            type="button"
            onClick={() => setHelp(true)}
            aria-label="Show controls help"
            className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10"
          >
            <HelpCircle size={16} aria-hidden />
          </button>
        </div>
        <span
          className="panel px-2.5 py-1 text-[11px] font-medium"
          style={{ color: fidelity === 'photoreal' ? 'var(--good)' : fidelity === 'terrain' ? 'var(--moon)' : 'var(--mid)' }}
          title="Imagery fidelity actually loaded"
        >
          {FIDELITY_LABEL[fidelity]}
        </span>
        {profile !== 'off' && (
          <span className="panel px-2.5 py-1 text-[11px] text-[var(--muted)]" role="note">
            Simulated look. Not a physical render of the target.
          </span>
        )}
      </div>

      {/* Right: match card */}
      {analysis && cmp && (
        <div className="panel pointer-events-auto absolute right-4 top-1/2 hidden w-[300px] -translate-y-1/2 lg:block">
          <button
            type="button"
            onClick={() => setMatchOpen(!matchOpen)}
            aria-expanded={matchOpen}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
          >
            Match vs {cmp.label}
            {matchOpen ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
          </button>
          {matchOpen && (
            <div className="px-3 pb-3">
              <FeatureTable rows={analysis.rows} features={data.features} siteRaw={site.raw} target={cmp.target} targetLabel={cmp.label} limit={5} compact />
            </div>
          )}
        </div>
      )}

      {/* Bottom-left: minimap + waypoints */}
      <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-col gap-2">
        {waypoints.length > 0 && (
          <div className="panel p-1.5">
            <button
              type="button"
              onClick={() => setWpOpen(!wpOpen)}
              aria-expanded={wpOpen}
              className="flex w-full items-center gap-1.5 px-1.5 py-1 text-xs font-medium"
            >
              <MapPinned size={14} aria-hidden /> Waypoints
            </button>
            {wpOpen && (
              <ul className="mt-1">
                {waypoints.map((w) => (
                  <li key={w.name}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-left text-xs hover:bg-white/10"
                      onClick={() => {
                        ctl?.teleportTo(w.lat, w.lon);
                        setNote({ name: w.name, note: w.note });
                      }}
                    >
                      {w.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Minimap ctl={ctl} waypoints={waypoints} />
      </div>

      {/* Bottom-centre: coordinates */}
      {pose && (
        <div className="panel absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 font-mono text-xs tabular">
          <span>{formatLatLon(pose.lat, pose.lon, 4)}</span>
          <span className="mx-3 text-[var(--muted)]">|</span>
          <span>{Math.round(pose.ground).toLocaleString('en-CA')} m</span>
          <span className="mx-3 text-[var(--muted)]">|</span>
          <span>
            {Math.round(headingDeg)}° {COMPASS[Math.round(headingDeg / 45) % 8]}
          </span>
          <span className="mx-3 text-[var(--muted)]">|</span>
          <span className="inline-flex items-center gap-1">
            {pose.mode === 'walk' ? <Moon size={11} aria-hidden /> : <Orbit size={11} aria-hidden />}
            {pose.mode === 'walk' ? 'Walk' : `Fly ${Math.round(pose.flySpeed)} m/s`}
          </span>
        </div>
      )}

      {!locked && ctl && !help && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 px-4 py-2 text-sm text-white/90">
          Click to look around. W A S D to move. Press ? for help.
        </div>
      )}

      {note && (
        <div className="panel pointer-events-auto absolute bottom-24 left-1/2 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 p-3" role="status">
          <div className="mb-1 flex items-center justify-between">
            <strong className="text-sm">{note.name}</strong>
            <button type="button" onClick={() => setNote(null)} aria-label="Close note" className="rounded p-1 hover:bg-white/10">
              <X size={14} aria-hidden />
            </button>
          </div>
          <p className="text-sm text-[var(--muted)]">{note.note}</p>
        </div>
      )}

      {touch && (
        <div className="panel pointer-events-auto absolute inset-x-4 top-40 p-3 text-sm" role="note">
          Tour mode is best on desktop with a keyboard and mouse.
        </div>
      )}

      {help && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/50" role="dialog" aria-modal="true" aria-label="Tour controls">
          <div className="panel w-[min(420px,calc(100vw-2rem))] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tour controls</h2>
              <button type="button" onClick={() => setHelp(false)} aria-label="Close help" className="rounded p-1 hover:bg-white/10" autoFocus>
                <X size={18} aria-hidden />
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {[
                ['Click', 'Lock the mouse and look around'],
                ['W A S D', 'Move (arrow keys also work)'],
                ['Shift', 'Sprint (3x)'],
                ['Space', 'Toggle walk and fly'],
                ['Q / E', 'Fly down / up'],
                ['Scroll', 'Change fly speed'],
                ['Minimap', 'Click to teleport within 5 km'],
                ['Esc', 'Release the mouse'],
                ['?', 'Toggle this help'],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                  </dt>
                  <dd className="text-[var(--muted)]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-[var(--muted)]">Street-view style tour on Cesium terrain and imagery. Not Google Street View.</p>
          </div>
        </div>
      )}
    </div>
  );
}
