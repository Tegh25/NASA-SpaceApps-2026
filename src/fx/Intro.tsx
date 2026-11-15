import * as Cesium from 'cesium';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { INITIAL_VIEW, prefersReducedMotion, whenViewer } from '../globe/viewer';
import { useApp } from '../state/store';

const FLAG = 'terralog.intro.v1';
const FLIGHT_S = 3.2;
const START = { lon: INITIAL_VIEW.lon + 42, lat: INITIAL_VIEW.lat - 22, height: 6e7, heading: Cesium.Math.toRadians(28) };

function seen(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    sessionStorage.setItem(FLAG, '1');
  } catch {
    /* private mode: just play again next load */
  }
}

const ease = (t: number) => 1 - Math.pow(1 - t, 4); // quartic out: fast departure, soft arrival
const nf = (n: number) => n.toLocaleString('en-US');

/** Real lines from the loaded data. Returns null for a line whose data is not there. */
function bootLines(): string[] {
  const d = useApp.getState().data;
  const lines = ['Linking LRO LOLA 40 m south-pole elevation'];
  if (!d) return lines;
  const moon = d.targets.filter((t) => t.body === 'moon').length;
  const mars = d.targets.filter((t) => t.body === 'mars').length;
  const fresh = d.featured.filter((f) => f.kind === 'new' && f.body !== 'mars').length;
  const freshMars = d.featured.filter((f) => f.kind === 'new' && f.body === 'mars').length;
  if (moon) lines.push(`${moon} Artemis III candidate regions fingerprinted`);
  lines.push(`${nf(d.cells.count)} Earth blocks of ${Math.round(d.cells.cellSizeDeg * 111)} x ${Math.round(d.cells.cellSizeDeg * 111)} km scored`);
  if (fresh) lines.push(`${fresh} new Moon analog candidates passed the novelty check`);
  if (mars) lines.push(`Mars: ${mars} landing sites, ${freshMars} new candidates`);
  return lines;
}

/**
 * First-load cinematic: the camera swoops in from deep space while a terminal-style boot log types.
 * Plays once per session, never on deep links or under reduced motion. Skip button and Esc end it.
 */
export function Intro() {
  const { pathname } = useLocation();
  const [play] = useState(() => !seen() && !prefersReducedMotion() && !pathname.startsWith('/site/'));
  const [phase, setPhase] = useState<'run' | 'fade' | 'done'>('run');
  const [typed, setTyped] = useState<string[]>([]);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!play) return;
    let cancelled = false;
    let ended = false;
    let remove: (() => void) | null = null;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let viewer: Cesium.Viewer | null = null;
    const dest = Cesium.Cartesian3.fromDegrees(INITIAL_VIEW.lon, INITIAL_VIEW.lat, INITIAL_VIEW.height);

    const end = () => {
      if (ended) return;
      ended = true;
      remove?.();
      timers.forEach(clearTimeout);
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.setView({ destination: dest, orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
      }
      setPhase('fade');
      timers = [setTimeout(() => !cancelled && setPhase('done'), 500)];
    };
    finishRef.current = end;

    // Typing: ~4 lines over ~2.9 s, chars appear at a steady pace.
    const typeAll = () => {
      const lines = bootLines();
      const gap = 2900 / lines.length;
      lines.forEach((line, li) => {
        const per = Math.max(10, Math.min(26, (gap * 0.72) / line.length));
        for (let c = 1; c <= line.length; c++) {
          timers.push(
            setTimeout(() => {
              if (cancelled || ended) return;
              setTyped((prev) => {
                const next = prev.slice();
                next[li] = line.slice(0, c);
                return next;
              });
            }, li * gap + c * per),
          );
        }
      });
    };

    whenViewer().then((v) => {
      if (cancelled) return;
      viewer = v;
      markSeen();
      const cam = v.camera;
      const setCam = (lon: number, lat: number, h: number, heading: number) =>
        cam.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, h), orientation: { heading, pitch: -Math.PI / 2, roll: 0 } });
      setCam(START.lon, START.lat, START.height, START.heading);
      typeAll();
      const t0 = performance.now();
      const onTick = () => {
        const k = Math.min(1, (performance.now() - t0) / (FLIGHT_S * 1000));
        const e = ease(k);
        setCam(
          START.lon + (INITIAL_VIEW.lon - START.lon) * e,
          START.lat + (INITIAL_VIEW.lat - START.lat) * e,
          // Interpolate height in log space so the zoom feels even.
          Math.exp(Math.log(START.height) + (Math.log(INITIAL_VIEW.height) - Math.log(START.height)) * e),
          START.heading * (1 - e),
        );
        if (k >= 1) timers.push(setTimeout(end, 350));
      };
      v.clock.onTick.addEventListener(onTick);
      remove = () => v.clock.onTick.removeEventListener(onTick);
      // Hard cap: never hold the camera past ~3.5 s.
      timers.push(setTimeout(end, 3500));
      // Taking the camera yourself ends the flight.
      const grab = () => end();
      v.canvas.addEventListener('pointerdown', grab, { once: true });
      v.canvas.addEventListener('wheel', grab, { once: true, passive: true });
    });

    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', key);
      remove?.();
      timers.forEach(clearTimeout);
    };
  }, [play]);

  if (!play || phase === 'done') return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-3 bottom-40 z-30 md:inset-x-6 md:bottom-auto md:top-16"
      style={{ opacity: phase === 'fade' ? 0 : 1, transition: 'opacity 450ms var(--ease-out-quint)' }}
      role="status"
      aria-label="Loading mission data"
    >
      <div className="panel num pointer-events-auto max-w-[460px] px-4 py-3 text-[12px] leading-relaxed text-[var(--accent)]">
        {typed.map((l, i) => (
          <div key={i} className="whitespace-nowrap overflow-hidden text-ellipsis">
            <span className="text-[var(--dim)]">{'> '}</span>
            {l}
            {i === typed.length - 1 && <span className="intro-caret" aria-hidden />}
          </div>
        ))}
        {!typed.length && <span className="intro-caret" aria-hidden />}
        <button
          type="button"
          onClick={() => finishRef.current()}
          className="mt-2 rounded-[3px] border border-[var(--rule-hi)] px-2 py-0.5 text-[11px] text-[var(--dim)] hover:border-[var(--accent)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Skip (Esc)
        </button>
      </div>
      <style>{`.intro-caret{display:inline-block;width:7px;height:13px;margin-left:3px;vertical-align:-2px;background:var(--accent);animation:intro-blink 1s steps(1) infinite}@keyframes intro-blink{50%{opacity:0}}`}</style>
    </div>
  );
}
