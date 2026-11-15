import * as Cesium from 'cesium';

export const COLORS = {
  moon: '#9EE7F2',
  mars: '#FF7A3D',
  pencil: '#F3E3A2',
  good: '#4FE0B0',
  mid: '#F2C14E',
  dim: '#56657A',
};

const cache = new Map<string, HTMLCanvasElement>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/**
 * Pin: core dot + ring (split ring when an analog for both bodies). Drawn at 2x for sharpness,
 * display with scale 0.5 (see PIN_SCALE).
 */
export function pinImage(colors: string[], hovered = false, selected = false): HTMLCanvasElement {
  const key = `pin|${colors.join(',')}|${hovered}|${selected}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 64;
  const [c, g] = canvas(size);
  const m = size / 2;
  const r = hovered || selected ? 17 : 14;
  g.shadowColor = 'rgba(5,7,12,0.9)';
  g.shadowBlur = 6;
  g.lineWidth = hovered || selected ? 5 : 4;
  const seg = (Math.PI * 2) / colors.length;
  colors.forEach((col, i) => {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(m, m, r, -Math.PI / 2 + i * seg + (colors.length > 1 ? 0.12 : 0), -Math.PI / 2 + (i + 1) * seg - (colors.length > 1 ? 0.12 : 0));
    g.stroke();
  });
  g.shadowBlur = hovered ? 14 : 0;
  g.shadowColor = colors[0];
  g.fillStyle = hovered || selected ? '#FFFFFF' : colors[0];
  g.beginPath();
  g.arc(m, m, hovered || selected ? 6 : 5, 0, Math.PI * 2);
  g.fill();
  cache.set(key, c);
  return c;
}
export const PIN_SCALE = 0.5;

/** White ring that the tick loop tints/scales for the pulse. */
export function pulseImage(): HTMLCanvasElement {
  const hit = cache.get('pulse');
  if (hit) return hit;
  const [c, g] = canvas(64);
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.stroke();
  cache.set('pulse', c);
  return c;
}

/** Imperfect double ellipse, like a grease-pencil mark. Deterministic wobble so it does not flicker. */
export function pencilImage(): HTMLCanvasElement {
  const hit = cache.get('pencil');
  if (hit) return hit;
  const size = 192;
  const [c, g] = canvas(size);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(5,7,12,0.7)';
  g.shadowBlur = 3;
  const pass = (rx: number, ry: number, rot: number, start: number, wob: number, w: number, alpha: number) => {
    g.strokeStyle = COLORS.pencil;
    g.globalAlpha = alpha;
    g.lineWidth = w;
    g.beginPath();
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = start + (i / steps) * Math.PI * 2.16; // overshoots so the ends cross
      const k = 1 + wob * Math.sin(t * 3 + 0.8) + wob * 0.6 * Math.sin(t * 5 + 2.1) - (i / steps) * 0.04;
      const x = Math.cos(t) * rx * k;
      const y = Math.sin(t) * ry * k;
      const px = size / 2 + x * Math.cos(rot) - y * Math.sin(rot);
      const py = size / 2 + x * Math.sin(rot) + y * Math.cos(rot);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  };
  pass(66, 58, -0.2, -2.2, 0.025, 4, 0.95);
  pass(72, 62, 0.14, -1.4, 0.03, 2.6, 0.75);
  g.globalAlpha = 1;
  cache.set('pencil', c);
  return c;
}

const hex = (h: string) => Cesium.Color.fromCssColorString(h);
const lerpColor = (a: Cesium.Color, b: Cesium.Color, t: number) => Cesium.Color.lerp(a, b, t, new Cesium.Color());

/** Score ramp: dim -> mid -> good, t in 0..1. */
export function scoreColor(t: number): Cesium.Color {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? lerpColor(hex(COLORS.dim), hex(COLORS.mid), x / 0.5) : lerpColor(hex(COLORS.mid), hex(COLORS.good), (x - 0.5) / 0.5);
}

export function scoreCss(t: number): string {
  return scoreColor(t).toCssColorString();
}
