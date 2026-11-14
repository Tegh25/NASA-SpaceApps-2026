import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadHeightmap } from '../data/loaders';
import type { Target } from '../data/schemas';

interface Props {
  target: Target;
  sunAz: number;
  sunEl: number;
  exaggeration: number;
  groundView: boolean;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  mesh: THREE.Mesh;
  base: Float32Array;
  midElev: number;
  widthKm: number;
  heightKm: number;
  W: number;
  H: number;
}

const NICE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

export function TargetScene({ target, sunAz, sunEl, exaggeration, groundView }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);
  const look = useRef({ yaw: 0, pitch: 0 });
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [isMock, setIsMock] = useState(false);
  const [scale, setScale] = useState<{ px: number; km: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const propsRef = useRef({ sunAz, sunEl, exaggeration, groundView });
  propsRef.current = { sunAz, sunEl, exaggeration, groundView };

  useEffect(() => {
    if (!target.heightmap) {
      setState('missing');
      return;
    }
    let disposed = false;
    let raf = 0;
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    const camera = new THREE.PerspectiveCamera(55, 1, 0.001, 5000);

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(4000 * 3);
    for (let i = 0; i < 4000; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      starPos.set([r * Math.cos(th) * 1500, u * 1500, r * Math.sin(th) * 1500], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
    scene.add(stars);

    const ambient = new THREE.AmbientLight(0xffffff, target.body === 'mars' ? 0.18 : 0.03);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, target.body === 'mars' ? 2.2 : 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    loadHeightmap(target.heightmap)
      .then(({ hm, elev, isMock: mock }) => {
        if (disposed) return;
        setIsMock(mock);
        const W = hm.width;
        const H = hm.height;
        const widthKm = ((W - 1) * hm.metersPerPixel) / 1000;
        const heightKm = ((H - 1) * hm.metersPerPixel) / 1000;
        const geo = new THREE.PlaneGeometry(widthKm, heightKm, W - 1, H - 1);
        geo.rotateX(-Math.PI / 2);
        const midElev = (hm.minElevation + hm.maxElevation) / 2;
        const colors = new Float32Array(W * H * 3);
        const base = target.body === 'mars' ? new THREE.Color('#b8693f') : new THREE.Color('#9a9a9a');
        const span = Math.max(1, hm.maxElevation - hm.minElevation);
        for (let i = 0; i < W * H; i++) {
          const t = (elev[i] - hm.minElevation) / span;
          const c = base.clone().multiplyScalar(0.7 + 0.45 * t);
          colors.set([c.r, c.g, c.b], i * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        refs.current = { renderer, scene, camera, controls, sun, mesh, base: elev, midElev, widthKm, heightKm, W, H };
        applyExaggeration(propsRef.current.exaggeration);
        const d = Math.max(widthKm, heightKm);
        const sc = sun.shadow.camera;
        sc.left = sc.bottom = -d * 0.75;
        sc.right = sc.top = d * 0.75;
        sc.near = 0.1;
        sc.far = d * 6;
        sc.updateProjectionMatrix();
        camera.position.set(d * 0.15, d * 0.55, d * 0.85);
        controls.target.set(0, 0, 0);
        controls.maxDistance = d * 4;
        controls.minDistance = d * 0.02;
        setState('ready');
      })
      .catch((e) => {
        console.warn(e);
        if (!disposed) setState('missing');
      });

    let lastHud = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const r = refs.current;
      const p = propsRef.current;
      const az = THREE.MathUtils.degToRad(p.sunAz);
      const el = THREE.MathUtils.degToRad(p.sunEl);
      const dist = r ? Math.max(r.widthKm, r.heightKm) * 2.5 : 100;
      sun.position.set(Math.cos(el) * Math.sin(az) * dist, Math.sin(el) * dist, -Math.cos(el) * Math.cos(az) * dist);
      sun.target.position.set(0, 0, 0);
      if (r && p.groundView) {
        camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ');
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
      if (r && now - lastHud > 200) {
        lastHud = now;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        setHeading(Math.atan2(dir.x, -dir.z));
        const a = controls.target.clone();
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        const pa = (p.groundView ? camera.position.clone().add(dir.clone().multiplyScalar(0.5)) : a).project(camera);
        const pb = (p.groundView ? camera.position.clone().add(dir.clone().multiplyScalar(0.5)).add(right) : a.clone().add(right)).project(camera);
        const pxPerKm = (Math.abs(pb.x - pa.x) * host.clientWidth) / 2;
        if (pxPerKm > 0 && Number.isFinite(pxPerKm)) {
          const km = NICE.find((n) => n * pxPerKm >= 60) ?? 100;
          setScale({ km, px: km * pxPerKm });
        }
      }
    };
    raf = requestAnimationFrame(tick);

    let dragging = false;
    const onDown = () => (dragging = true);
    const onUp = () => (dragging = false);
    const onMove = (e: PointerEvent) => {
      if (!dragging || !propsRef.current.groundView) return;
      look.current.yaw -= e.movementX * 0.004;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - e.movementY * 0.004, -1.3, 1.3);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      refs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);

  function applyExaggeration(ex: number) {
    const r = refs.current;
    if (!r) return;
    const pos = r.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < r.W * r.H; i++) pos.setY(i, ((r.base[i] - r.midElev) / 1000) * ex);
    pos.needsUpdate = true;
    r.mesh.geometry.computeVertexNormals();
    r.mesh.geometry.computeBoundingSphere();
  }

  useEffect(() => applyExaggeration(exaggeration), [exaggeration, state]);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    if (groundView) {
      const ci = Math.floor(r.H / 2) * r.W + Math.floor(r.W / 2);
      const y = ((r.base[ci] - r.midElev) / 1000) * exaggeration + 0.002;
      r.camera.position.set(0, y, 0);
      look.current = { yaw: THREE.MathUtils.degToRad(-sunAz) + Math.PI, pitch: 0.02 };
      r.controls.enabled = false;
    } else {
      const d = Math.max(r.widthKm, r.heightKm);
      r.camera.position.set(d * 0.15, d * 0.55, d * 0.85);
      r.controls.target.set(0, 0, 0);
      r.controls.enabled = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundView, state]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={hostRef} className="absolute inset-0" role="img" aria-label={`3D terrain of ${target.name}`} />
      {state === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-[var(--muted)]">Loading terrain...</div>}
      {state === 'missing' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[var(--muted)]">
          No heightmap is available for this target yet.
        </div>
      )}
      {state === 'ready' && (
        <>
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-end gap-4">
            {scale && (
              <div className="font-mono text-[11px] text-white/80">
                <div className="h-1.5 border-x-2 border-b-2 border-white/80" style={{ width: scale.px }} />
                {scale.km >= 1 ? `${scale.km} km` : `${scale.km * 1000} m`}
              </div>
            )}
          </div>
          <div
            className="pointer-events-none absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/50"
            aria-label="North arrow"
            role="img"
          >
            <div style={{ transform: `rotate(${-heading}rad)` }} className="flex flex-col items-center">
              <span className="text-[10px] font-semibold leading-none">N</span>
              <span className="mt-0.5 h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent border-b-[var(--bad)]" />
            </div>
          </div>
          {isMock && (
            <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-[var(--mid)] px-2 py-0.5 text-[10px] font-semibold uppercase text-black">
              Procedural mock terrain
            </div>
          )}
        </>
      )}
    </div>
  );
}
