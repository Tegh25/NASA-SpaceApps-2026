import * as Cesium from 'cesium';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackCamera } from '../lib/camera';
import { getSite } from '../lib/sites';
import { isSearchActive, useApp } from '../state/store';
import { COLORS, PIN_SCALE, pencilImage, pinImage, pulseImage, scoreColor } from './pins';
import { createViewer, HAS_ION, prefersReducedMotion } from './viewer';

interface Props {
  hidden: boolean;
  interactive: boolean;
}

export function featuredBodies(analogFor: string[], targets: { id: string; body: 'moon' | 'mars' }[]): ('moon' | 'mars')[] {
  const set = new Set<'moon' | 'mars'>();
  for (const id of analogFor) {
    const t = targets.find((x) => x.id === id);
    if (t) set.add(t.body);
  }
  return [...set];
}

interface Shown {
  show: boolean;
}
interface Item {
  p: Shown;
  pos: Cesium.Cartesian3;
}
interface Pulse {
  b: Cesium.Billboard;
  color: Cesium.Color;
  phase: number;
}

const PIN_HEIGHT = 0;
const ORBIT_RETURN_M = 1.6e7;
const SITE_RANGE_M = 120000;
const SITE_PITCH = Cesium.Math.toRadians(-45);

export function GlobeView({ hidden, interactive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const featuredRef = useRef<Cesium.BillboardCollection | null>(null);
  const overlayRef = useRef<Cesium.BillboardCollection | null>(null);
  const labelsRef = useRef<Cesium.LabelCollection | null>(null);
  const resultsRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const items = useRef<{ featured: Item[]; results: Item[]; overlay: Item[] }>({ featured: [], results: [], overlay: [] });
  const pulses = useRef<Pulse[]>([]);
  const applyOcclusionRef = useRef<() => void>(() => {});
  const flownRef = useRef<string | null>(null);
  const lastSiteRef = useRef<{ lat: number; lon: number } | null>(null);
  const interactiveRef = useRef(interactive);
  const rotatingRef = useRef(!prefersReducedMotion());
  const [ready, setReady] = useState(false);
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
    let untrack: (() => void) | null = null;
    const el = containerRef.current!;
    createViewer(el).then((v) => {
      if (disposed) return;
      viewerRef.current = v;
      const sp = v.scene.primitives;
      resultsRef.current = sp.add(new Cesium.PointPrimitiveCollection());
      featuredRef.current = sp.add(new Cesium.BillboardCollection({ scene: v.scene }));
      overlayRef.current = sp.add(new Cesium.BillboardCollection({ scene: v.scene }));
      labelsRef.current = sp.add(new Cesium.LabelCollection({ scene: v.scene }));
      untrack = trackCamera(v);

      const stopRotate = () => {
        rotatingRef.current = false;
      };
      v.canvas.addEventListener('pointerdown', stopRotate);
      v.canvas.addEventListener('wheel', stopRotate, { passive: true });
      window.addEventListener('keydown', stopRotate);

      // Hide pins on the far side of the globe (they are drawn without depth test).
      const applyOcclusion = () => {
        const occ = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, v.camera.positionWC);
        const all = items.current;
        for (const list of [all.featured, all.results, all.overlay]) {
          for (const it of list) it.p.show = occ.isPointVisible(it.pos);
        }
      };
      applyOcclusionRef.current = applyOcclusion;

      let last = performance.now();
      let frame = 0;
      v.clock.onTick.addEventListener(() => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (rotatingRef.current && interactiveRef.current) v.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.035 * dt);
        if ((frame++ & 3) === 0) applyOcclusion();
        const reduced = prefersReducedMotion();
        for (const pl of pulses.current) {
          if (reduced) {
            pl.b.scale = 0.9;
            pl.b.color = pl.color.withAlpha(0.18);
          } else {
            const t = ((now / 1800 + pl.phase) % 1 + 1) % 1;
            pl.b.scale = PIN_SCALE * (0.8 + 1.7 * t);
            pl.b.color = pl.color.withAlpha(0.6 * (1 - t) * (1 - t));
          }
        }
      });

      const handler = new Cesium.ScreenSpaceEventHandler(v.canvas);
      handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
        if (!interactiveRef.current) return;
        const picked = v.scene.pick(e.endPosition);
        const id = typeof picked?.id === 'string' ? (picked.id as string) : null;
        if (useApp.getState().hoveredId !== id) useApp.getState().hover(id);
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
      untrack?.();
    };
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.useDefaultRenderLoop = !hidden;
    if (!hidden) v.resize();
  }, [hidden, ready]);

  // Featured pins: core + ring, plus an animated pulse billboard underneath each.
  useEffect(() => {
    const bc = featuredRef.current;
    if (!bc || !data) return;
    bc.removeAll();
    items.current.featured = [];
    pulses.current = [];
    const visible = interactive && (!searchActive || showFeatured);
    if (!visible) return;
    let n = 0;
    for (const f of data.featured) {
      const bodies = featuredBodies(f.analogFor, data.targets);
      if (query.body !== 'either' && !bodies.includes(query.body)) continue;
      const colors = bodies.length ? bodies.map((b) => COLORS[b]) : [COLORS.moon];
      const hovered = f.id === hoveredId;
      const selected = f.id === selectedId;
      const pos = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, PIN_HEIGHT);
      const common = { id: f.id, position: pos, disableDepthTestDistance: Number.POSITIVE_INFINITY };
      const pulse = bc.add({ ...common, image: pulseImage(), scale: PIN_SCALE, color: Cesium.Color.fromCssColorString(colors[0]).withAlpha(0.4) });
      const pin = bc.add({ ...common, image: pinImage(colors, hovered, selected), scale: PIN_SCALE * (hovered ? 1.15 : 1) });
      pulses.current.push({ b: pulse, color: Cesium.Color.fromCssColorString(colors[0]), phase: n++ * 0.23 });
      items.current.featured.push({ p: pulse, pos }, { p: pin, pos });
    }
    applyOcclusionRef.current();
  }, [data, ready, searchActive, showFeatured, query.body, selectedId, hoveredId, interactive]);

  // Search result cells: small score-coloured points. Selection/hover are drawn by the overlay effect.
  useEffect(() => {
    const pc = resultsRef.current;
    if (!pc || !data) return;
    pc.removeAll();
    items.current.results = [];
    if (!interactive || !searchActive || !results.length) return;
    const scores = results.map((r) => r.score);
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    const edge = Cesium.Color.fromCssColorString('#05070C').withAlpha(0.85);
    for (const r of results) {
      const t = hi > lo ? (r.score - lo) / (hi - lo) : 1;
      const pos = Cesium.Cartesian3.fromDegrees(data.cells.lon[r.index], data.cells.lat[r.index], PIN_HEIGHT);
      const p = pc.add({
        id: r.id,
        position: pos,
        color: scoreColor(t),
        pixelSize: 6 + 6 * t,
        outlineColor: edge,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      items.current.results.push({ p, pos });
    }
    applyOcclusionRef.current();
  }, [data, ready, results, searchActive, interactive]);

  // Selected = pencil circle + label; hovered = label.
  useEffect(() => {
    const ob = overlayRef.current;
    const lc = labelsRef.current;
    if (!ob || !lc || !data) return;
    ob.removeAll();
    lc.removeAll();
    items.current.overlay = [];
    if (!interactive) return;
    const ids = [...new Set([selectedId, hoveredId].filter((x): x is string => !!x))];
    for (const id of ids) {
      const site = getSite(data, id);
      if (!site) continue;
      const pos = Cesium.Cartesian3.fromDegrees(site.lon, site.lat, PIN_HEIGHT);
      if (id === selectedId) {
        const b = ob.add({
          id,
          position: pos,
          image: pencilImage(),
          scale: 0.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
        items.current.overlay.push({ p: b, pos });
      }
      const label = lc.add({
        id,
        position: pos,
        text: site.name,
        font: '12px JetBrains Mono, ui-monospace, monospace',
        fillColor: Cesium.Color.fromCssColorString('#E6EEF6'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(0, id === selectedId ? -34 : -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      items.current.overlay.push({ p: label, pos });
    }
    applyOcclusionRef.current();
  }, [data, ready, selectedId, hoveredId, interactive]);

  // Camera: fly in to a tilted ~120 km view on selection, back out to orbit when cleared.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !data || !interactive) return;
    const site = getSite(data, selectedId);
    const reduced = prefersReducedMotion();
    if (selectedId && site) {
      if (flownRef.current === selectedId) return;
      flownRef.current = selectedId;
      lastSiteRef.current = { lat: site.lat, lon: site.lon };
      rotatingRef.current = false;
      v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(site.lon, site.lat), 1), {
        offset: new Cesium.HeadingPitchRange(v.camera.heading, SITE_PITCH, SITE_RANGE_M),
        duration: reduced ? 0 : 2.4,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      });
    } else if (!selectedId && flownRef.current) {
      flownRef.current = null;
      const last = lastSiteRef.current;
      if (!last) return;
      v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(last.lon, last.lat), 1), {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), ORBIT_RETURN_M),
        duration: reduced ? 0 : 2,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      });
    }
  }, [data, selectedId, ready, interactive]);

  return (
    <div className="absolute inset-0" style={{ visibility: hidden ? 'hidden' : 'visible' }} aria-hidden={hidden}>
      <div ref={containerRef} className="absolute inset-0" role="application" aria-label="3D globe of Earth analog sites" />
      {!HAS_ION && !hidden && interactive && (
        <span className="sr-only">NASA Blue Marble imagery, no terrain: no Cesium ion token configured.</span>
      )}
    </div>
  );
}
