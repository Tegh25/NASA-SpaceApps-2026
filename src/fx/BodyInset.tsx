import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { defaultTarget } from '../globe/heatField';
import { activeBody } from '../lib/cards';
import { getSite } from '../lib/sites';
import { useApp } from '../state/store';

type Body = 'moon' | 'mars';
const SIZE = 168;
const BASE = import.meta.env.BASE_URL;
const TEX = {
  moon: `${BASE}textures/moon_color_2k.jpg`,
  moonBump: `${BASE}textures/moon_ldem_1k.jpg`,
  mars: `${BASE}textures/mars_color_2k.jpg`,
};
const ACCENT: Record<Body, string> = { moon: '#9EE7F2', mars: '#FF7A3D' };
// Pole tilt toward the camera: the Moon shows its south pole at about 3/4 view.
const TILT: Record<Body, number> = { moon: -1.05, mars: 0.42 };

/** lat/lon degrees to a point on the unit sphere matching three's SphereGeometry UV layout. */
function toVec(lat: number, lon: number, r = 1): THREE.Vector3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}

/** Procedural fallback texture so the inset still works if a map fails to load. */
function proceduralTexture(body: Body): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = body === 'moon' ? '#8a8d92' : '#a5532f';
  g.fillRect(0, 0, 512, 256);
  let seed = body === 'moon' ? 7 : 19;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 700; i++) {
    const x = rnd() * 512;
    const y = rnd() * 256;
    const r = 1 + rnd() * rnd() * 14;
    g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rnd() * 0.1})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Planet {
  group: THREE.Group; // tilt pivot
  spin: THREE.Group; // rotates around the planet axis
  markers: { id: string; mesh: THREE.Mesh; ring: THREE.Mesh; lat: number; lon: number }[];
  dispose: () => void;
}

function buildPlanet(body: Body, targets: { id: string; lat: number; lon: number }[], loader: THREE.TextureLoader): Planet {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.rotation.x = TILT[body];
  group.add(spin);
  const disposables: { dispose: () => void }[] = [];

  const fallback = proceduralTexture(body);
  disposables.push(fallback);
  const mat = new THREE.MeshStandardMaterial({ map: fallback, roughness: 1, metalness: 0, bumpScale: body === 'moon' ? 0.8 : 0 });
  const load = (url: string, cb: (t: THREE.Texture) => void) =>
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        disposables.push(t);
        cb(t);
      },
      undefined,
      () => {
        /* keep procedural fallback */
      },
    );
  load(body === 'moon' ? TEX.moon : TEX.mars, (t) => {
    mat.map = t;
    mat.needsUpdate = true;
  });
  if (body === 'moon') {
    loader.load(TEX.moonBump, (t) => {
      disposables.push(t);
      mat.bumpMap = t;
      mat.needsUpdate = true;
    });
  }
  const geo = new THREE.SphereGeometry(1, 64, 48);
  disposables.push(geo, mat);
  spin.add(new THREE.Mesh(geo, mat));

  if (body === 'mars') {
    const rimMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { c: { value: new THREE.Color('#ff9a66') } },
      vertexShader: 'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 n;uniform vec3 c;void main(){float i=pow(max(0.,0.72-dot(n,vec3(0.,0.,1.))),2.4);gl_FragColor=vec4(c,1.)*i*1.15;}',
    });
    const rimGeo = new THREE.SphereGeometry(1.1, 48, 32);
    disposables.push(rimMat, rimGeo);
    group.add(new THREE.Mesh(rimGeo, rimMat));
  }

  const markers: Planet['markers'] = [];
  const mGeo = new THREE.SphereGeometry(0.03, 12, 8);
  const rGeo = new THREE.RingGeometry(0.05, 0.062, 32);
  disposables.push(mGeo, rGeo);
  for (const t of targets) {
    const mm = new THREE.MeshBasicMaterial({ color: ACCENT[body], transparent: true, opacity: 0.8, depthTest: true });
    const rm = new THREE.MeshBasicMaterial({ color: ACCENT[body], transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    disposables.push(mm, rm);
    const p = toVec(t.lat, t.lon, 1.012);
    const mesh = new THREE.Mesh(mGeo, mm);
    mesh.position.copy(p);
    const ring = new THREE.Mesh(rGeo, rm);
    ring.position.copy(p);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
    spin.add(mesh, ring);
    markers.push({ id: t.id, mesh, ring, lat: t.lat, lon: t.lon });
  }
  return { group, spin, markers, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/**
 * 168 px three.js mini-globe of the active body with glowing target markers.
 * Own WebGL context; pauses when off screen or the tab is hidden. Decorative.
 */
export function BodyInset() {
  const hostRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const data = useApp((s) => s.data);
  const query = useApp((s) => s.query);
  const selectedId = useApp((s) => s.selectedId);
  const presetId = useApp((s) => s.presetId);
  const body = activeBody(query.body);

  // Which target to emphasise: selected site's first analog of this body, else the preset, else the default target.
  const focus = useMemo(() => {
    if (!data) return null;
    const site = getSite(data, selectedId);
    const fromSite = site?.featured?.analogFor.map((id) => data.targets.find((t) => t.id === id)).find((t) => t && t.body === body);
    const preset = presetId ? data.targets.find((t) => t.id === presetId && t.body === body) : undefined;
    return fromSite ?? preset ?? defaultTarget(data, body);
  }, [data, selectedId, presetId, body]);

  const stateRef = useRef({ body, focusId: focus?.id ?? null });
  stateRef.current = { body, focusId: focus?.id ?? null };
  const targetsRef = useRef(data?.targets ?? []);
  targetsRef.current = data?.targets ?? [];
  const hasData = !!data;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the inset is decorative, skip silently
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);
    const cv = renderer.domElement;
    cv.style.display = 'block';
    cv.style.borderRadius = '50%';
    host.appendChild(cv);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 0, 4.4);
    const sun = new THREE.DirectionalLight(0xfff3e0, 3.1);
    sun.position.set(-3, 1.6, 2.6);
    scene.add(sun, new THREE.AmbientLight(0x1a2438, 1.1));
    const loader = new THREE.TextureLoader();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const planets = new Map<Body, Planet>();
    const ensure = (b: Body) => {
      let p = planets.get(b);
      if (!p) {
        p = buildPlanet(b, targetsRef.current.filter((t) => t.body === b), loader);
        planets.set(b, p);
      }
      return p;
    };
    let shown: Body = stateRef.current.body;
    let current = ensure(shown);
    scene.add(current.group);
    let builtFor = targetsRef.current.length;

    // Body switch: shrink + dip out for 200 ms, swap, grow back for 200 ms.
    let swap: { t0: number; to: Body; done: boolean } | null = null;
    let visible = true;
    let raf = 0;
    let last = performance.now();
    let spinAngle = 0;

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      // Targets arrive after first paint: rebuild the markers once.
      if (targetsRef.current.length !== builtFor) {
        builtFor = targetsRef.current.length;
        scene.remove(current.group);
        planets.forEach((p) => p.dispose());
        planets.clear();
        current = ensure(shown);
        scene.add(current.group);
      }
      if (!swap && st.body !== shown) swap = { t0: now, to: st.body, done: false };
      let k = 1;
      if (swap) {
        const e = (now - swap.t0) / 400;
        if (e >= 0.5 && !swap.done) {
          scene.remove(current.group);
          shown = swap.to;
          current = ensure(shown);
          scene.add(current.group);
          swap.done = true;
        }
        k = e < 0.5 ? 1 - e * 2 : e < 1 ? (e - 0.5) * 2 : 1;
        if (e >= 1) swap = null;
      }
      cv.style.opacity = String(0.15 + 0.85 * k);
      current.group.scale.setScalar(0.8 + 0.2 * k);
      if (!reduced) spinAngle += dt * 0.16;
      current.spin.rotation.y = spinAngle;
      // Focus marker pulses; others sit quiet.
      const pulse = reduced ? 0.5 : (Math.sin(now / 340) + 1) / 2;
      for (const m of current.markers) {
        const isFocus = m.id === st.focusId;
        const mat = m.mesh.material as THREE.MeshBasicMaterial;
        const rmat = m.ring.material as THREE.MeshBasicMaterial;
        mat.opacity = isFocus ? 1 : 0.55;
        mat.color.set(isFocus ? '#FFFFFF' : ACCENT[shown]);
        m.mesh.scale.setScalar(isFocus ? 1.5 : 1);
        rmat.opacity = isFocus ? 0.85 * (1 - pulse) : 0;
        m.ring.scale.setScalar(1 + (isFocus ? pulse * 2.4 : 0));
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf && visible && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const io = new IntersectionObserver((es) => {
      visible = es[es.length - 1].isIntersecting;
      kick();
    });
    io.observe(host);
    document.addEventListener('visibilitychange', kick);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      visible = false;
      io.disconnect();
      document.removeEventListener('visibilitychange', kick);
      planets.forEach((p) => p.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      cv.remove();
    };
  }, [hasData]);

  const coord = focus ? `${Math.abs(focus.lat).toFixed(2)}${focus.lat < 0 ? 'S' : 'N'}, ${Math.abs(focus.lon).toFixed(2)}${focus.lon < 0 ? 'W' : 'E'}` : '';
  return (
    <div
      ref={capRef}
      role="img"
      aria-label={`Decorative globe of the ${body === 'moon' ? 'Moon' : 'Mars'} with candidate target regions marked${focus ? `, highlighting ${focus.name} at ${coord}` : ''}`}
      data-body={body}
      className="pointer-events-none absolute bottom-24 right-6 z-10 hidden w-[168px] select-none flex-col items-center md:flex"
    >
      <div
        ref={hostRef}
        className="rounded-full"
        style={{ width: SIZE, height: SIZE, boxShadow: '0 0 0 1px var(--rule-hi), 0 0 28px -6px var(--accent)', background: 'radial-gradient(circle at 50% 50%, rgba(11,17,27,0.0) 60%, rgba(11,17,27,0.0) 100%)' }}
      />
      {focus && (
        <div className="num mt-2 max-w-[200px] text-center text-[11px] leading-snug text-[var(--dim)]">
          <div className="truncate text-[var(--ink)]">{focus.name}</div>
          <div>{coord}</div>
        </div>
      )}
    </div>
  );
}
