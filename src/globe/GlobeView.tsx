import * as Cesium from 'cesium';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSite } from '../lib/sites';
import { isSearchActive, useApp } from '../state/store';
import { COLORS, ringImage, scoreColor } from './pins';
import { createViewer, HAS_ION, prefersReducedMotion } from './viewer';

interface Props {
  hidden: boolean;
  interactive: boolean;
}

interface Tip {
  x: number;
  y: number;
  id: string;
}

export function featuredBodies(analogFor: string[], targets: { id: string; body: 'moon' | 'mars' }[]): ('moon' | 'mars')[] {
  const set = new Set<'moon' | 'mars'>();
  for (const id of analogFor) {
    const t = targets.find((x) => x.id === id);
    if (t) set.add(t.body);
  }
  return [...set];
}

export function GlobeView({ hidden, interactive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const featuredRef = useRef<Cesium.BillboardCollection | null>(null);
  const resultsRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const highlightRef = useRef<Cesium.Entity | null>(null);
  const interactiveRef = useRef(interactive);
  const rotatingRef = useRef(!prefersReducedMotion());
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  interactiveRef.current = interactive;

  const data = useApp((s) => s.data);
  const results = useApp((s) => s.results);
  const query = useApp((s) => s.query);
  const showFeatured = useApp((s) => s.showFeatured);
  const selectedId = useApp((s) => s.selectedId);
  const hoveredId = useApp((s) => s.hoveredId);
  const searchActive = isSearchActive(query);

  useEffect(() => {
    let disposed = false;
    const el = containerRef.current!;
    createViewer(el).then((v) => {
      if (disposed) return;
      viewerRef.current = v;
      featuredRef.current = v.scene.primitives.add(new Cesium.BillboardCollection({ scene: v.scene }));
      resultsRef.current = v.scene.primitives.add(new Cesium.PointPrimitiveCollection());

      const stopRotate = () => {
        rotatingRef.current = false;
      };
      v.canvas.addEventListener('pointerdown', stopRotate);
      v.canvas.addEventListener('wheel', stopRotate, { passive: true });
      window.addEventListener('keydown', stopRotate);
      let last = performance.now();
      v.clock.onTick.addEventListener(() => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (rotatingRef.current && interactiveRef.current) v.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.035 * dt);
      });

      const handler = new Cesium.ScreenSpaceEventHandler(v.canvas);
      handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
        if (!interactiveRef.current) return;
        const picked = v.scene.pick(e.endPosition);
        const id = typeof picked?.id === 'string' ? (picked.id as string) : null;
        useApp.getState().hover(id);
        setTip(id ? { x: e.endPosition.x, y: e.endPosition.y, id } : null);
        v.canvas.style.cursor = id ? 'pointer' : '';
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        if (!interactiveRef.current) return;
        const picked = v.scene.pick(e.position);
        const id = typeof picked?.id === 'string' ? (picked.id as string) : null;
        if (id) navRef.current(`/site/${id}${window.location.search}`);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      setReady(true);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.useDefaultRenderLoop = !hidden;
    if (!hidden) v.resize();
  }, [hidden, ready]);

  // Featured pins
  useEffect(() => {
    const bc = featuredRef.current;
    if (!bc || !data) return;
    bc.removeAll();
    const visible = interactive && (!searchActive || showFeatured);
    if (!visible) return;
    for (const f of data.featured) {
      const bodies = featuredBodies(f.analogFor, data.targets);
      if (query.body !== 'either' && !bodies.includes(query.body)) continue;
      const colors = bodies.length ? bodies.map((b) => COLORS[b]) : [COLORS.moon];
      const active = f.id === selectedId || f.id === hoveredId;
      bc.add({
        id: f.id,
        position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat),
        image: ringImage(colors, active ? 48 : 40, active),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  }, [data, ready, searchActive, showFeatured, query.body, selectedId, hoveredId, interactive]);

  // Search result pins
  useEffect(() => {
    const pc = resultsRef.current;
    if (!pc || !data) return;
    pc.removeAll();
    if (!interactive || !searchActive || !results.length) return;
    const scores = results.map((r) => r.score);
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    for (const r of results) {
      const t = hi > lo ? (r.score - lo) / (hi - lo) : 1;
      const active = r.id === selectedId || r.id === hoveredId;
      pc.add({
        id: r.id,
        position: Cesium.Cartesian3.fromDegrees(data.cells.lon[r.index], data.cells.lat[r.index]),
        color: scoreColor(t),
        pixelSize: active ? 18 : 12,
        outlineColor: active ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#070A10'),
        outlineWidth: active ? 3 : 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  }, [data, ready, results, searchActive, selectedId, hoveredId, interactive]);

  // Selected-site highlight and camera flight
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !data) return;
    if (highlightRef.current) {
      v.entities.remove(highlightRef.current);
      highlightRef.current = null;
    }
    if (!interactive) return;
    const site = getSite(data, selectedId);
    if (!site) return;
    rotatingRef.current = false;
    highlightRef.current = v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat),
      ellipse: {
        semiMajorAxis: 60000,
        semiMinorAxis: 60000,
        material: Cesium.Color.WHITE.withAlpha(0.08),
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
        height: 0,
      },
    });
    const reduced = prefersReducedMotion();
    v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(site.lon, site.lat), 1), {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-70), 600000),
      duration: reduced ? 0 : 1.2,
    });
  }, [data, selectedId, ready, interactive]);

  const tipSite = tip && data ? getSite(data, tip.id) : null;
  const tipResult = tip ? results.find((r) => r.id === tip.id) : null;

  return (
    <div className="absolute inset-0" style={{ visibility: hidden ? 'hidden' : 'visible' }} aria-hidden={hidden}>
      <div ref={containerRef} className="absolute inset-0" role="application" aria-label="3D globe of Earth analog sites" />
      {tip && tipSite && interactive && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-white/10 bg-[var(--panel-solid)] px-3 py-2 text-sm shadow-xl"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <div className="font-medium text-[var(--text)]">{tipSite.name}</div>
          <div className="text-xs text-[var(--muted)]">
            {tipResult ? (
              <>
                Score <span className="font-mono text-[var(--text)]">{Math.round(tipResult.score)}</span>
              </>
            ) : (
              tipSite.featured?.headline
            )}
          </div>
        </div>
      )}
      {!HAS_ION && !hidden && interactive && (
        <span className="sr-only">Low detail imagery: no Cesium ion token configured.</span>
      )}
    </div>
  );
}
