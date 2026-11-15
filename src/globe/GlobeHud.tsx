import { useMemo } from 'react';
import { resetNorth, setMode, useCamera, zoomIn, zoomOut } from '../lib/camera';
import { getSite } from '../lib/sites';
import { useApp } from '../state/store';

const hemi = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? pos : neg}`;

function fmtAlt(m: number): string {
  const km = m / 1000;
  if (km >= 1000) return `${Math.round(km).toLocaleString('en-US')} km`;
  if (km >= 10) return `${km.toFixed(0)} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/** Pick a round distance (1, 2, 5 x 10^n m) that fits within maxPx. */
function niceScale(metersPerPx: number, maxPx: number): { px: number; label: string } {
  const maxM = metersPerPx * maxPx;
  const pow = 10 ** Math.floor(Math.log10(maxM));
  const f = maxM / pow;
  const step = (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pow;
  const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
  return { px: step / metersPerPx, label };
}

const btn =
  'pointer-events-auto grid h-9 w-9 place-items-center rounded-full text-[var(--ink)] transition-colors duration-200 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:-outline-offset-2';

function Tick({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className={`absolute ${className}`} fill="none" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1">
      <path d="M0.5 17.5V0.5H17.5" />
    </svg>
  );
}

export function GlobeHud({ className = '' }: { className?: string }) {
  const cam = useCamera();
  const data = useApp((s) => s.data);
  const selectedId = useApp((s) => s.selectedId);

  const chip = useMemo(() => {
    if (!data || !selectedId) return null;
    const site = getSite(data, selectedId);
    const tid = site?.featured?.analogFor[0];
    const target = tid ? data.targets.find((t) => t.id === tid) : null;
    if (!target) return null;
    return `${target.body === 'moon' ? 'Moon' : 'Mars'} target vs this site: ${target.name}`;
  }, [data, selectedId]);

  const scale = cam.metersPerPx ? niceScale(cam.metersPerPx, 120) : null;
  const surface = cam.mode === 'surface';

  const seg = (active: boolean) =>
    `pointer-events-auto h-8 rounded-full px-3.5 text-xs transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:-outline-offset-2 ${
      active ? 'bg-[var(--accent)] text-[var(--void)] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_0_14px_-3px_var(--accent)]' : 'text-[var(--ink)]/80 hover:text-[var(--ink)]'
    }`;

  return (
    <div className={`pointer-events-none absolute inset-0 z-10 overflow-hidden ${className}`}>
      {/* Viewfinder corner ticks */}
      <Tick className="left-3 top-3" />
      <Tick className="right-3 top-3 rotate-90" />
      <Tick className="bottom-3 right-3 rotate-180" />
      <Tick className="bottom-3 left-3 -rotate-90" />

      {/* Centre reticle */}
      <svg
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        width="44"
        height="44"
        viewBox="0 0 44 44"
        stroke="var(--accent)"
        strokeOpacity="0.35"
        strokeWidth="1"
        fill="none"
      >
        <path d="M22 2V16M22 28V42M2 22H16M28 22H42" />
        <circle cx="22" cy="22" r="1.5" />
      </svg>

      {/* Selected site chip */}
      {chip && (
        <div className="absolute left-1/2 top-20 md:top-4 -translate-x-1/2">
          <div className="glass-capsule max-w-[70vw] truncate px-4 py-1.5 text-xs text-[var(--accent)]" role="status">
            {chip}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute right-4 top-20 md:top-4 flex flex-col items-end gap-2">
        <div className="glass-capsule pointer-events-auto flex p-[3px]" role="group" aria-label="View mode">
          <button type="button" className={seg(!surface)} aria-pressed={!surface} aria-label="Orbit view" onClick={() => setMode('orbit')}>
            Orbit
          </button>
          <button type="button" className={seg(surface)} aria-pressed={surface} aria-label="Surface view" onClick={() => setMode('surface')}>
            Surface
          </button>
        </div>
        <div className="glass-capsule pointer-events-auto flex flex-col p-[3px]" role="group" aria-label="Zoom">
          <button type="button" className={btn} aria-label="Zoom in" onClick={zoomIn}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M7 1V13M1 7H13" />
            </svg>
          </button>
          <button type="button" className={btn} aria-label="Zoom out" onClick={zoomOut}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M1 7H13" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="glass-capsule pointer-events-auto grid h-11 w-11 place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          aria-label={`Compass, heading ${Math.round(cam.headingDeg)} degrees. Reset north`}
          onClick={resetNorth}
        >
          <svg aria-hidden="true" width="26" height="26" viewBox="-13 -13 26 26" style={{ transform: `rotate(${-cam.headingDeg}deg)`, transition: 'transform 120ms linear' }}>
            <path d="M0 -10L4 2L0 0L-4 2Z" fill="var(--accent)" />
            <path d="M0 10L3 3L0 1L-3 3Z" fill="var(--faint)" />
          </svg>
        </button>
      </div>

      {/* Readout */}
      <div className="glass-capsule num absolute bottom-4 left-4 hidden max-w-[calc(100%-2rem)] !rounded-[18px] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--ink)] md:block" aria-live="off">
        <div>
          {hemi(cam.lat, 'N', 'S')}
          {'  '}
          {hemi(cam.lon, 'E', 'W')}
        </div>
        <div className="text-[var(--dim)]">
          alt {fmtAlt(cam.heightM)}
          {cam.terrainHeightM !== null && <> {'  '}elev {Math.round(cam.terrainHeightM).toLocaleString('en-US')} m</>}
        </div>
        {scale && (
          <div className="mt-1.5 flex items-center gap-2 text-[var(--dim)]" aria-label={`Scale bar ${scale.label}`}>
            <span className="relative block h-[5px] border-x border-b border-[var(--ink)]" style={{ width: Math.max(8, scale.px) }} />
            <span>{scale.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
