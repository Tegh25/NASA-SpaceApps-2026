import * as Cesium from 'cesium';

export const COLORS = {
  moon: '#9FB4C7',
  mars: '#D1603D',
  good: '#3CC8A0',
  mid: '#E3B23C',
  dim: '#5B6577',
};

const ringCache = new Map<string, HTMLCanvasElement>();

/** Ring image for featured pins. Two-colour ring when a site is an analog for both bodies. */
export function ringImage(colors: string[], size = 40, selected = false): HTMLCanvasElement {
  const key = `${colors.join(',')}-${size}-${selected}`;
  const hit = ringCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2 - 5;
  g.lineWidth = selected ? 6 : 4.5;
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowBlur = 4;
  const seg = (Math.PI * 2) / colors.length;
  colors.forEach((col, i) => {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(size / 2, size / 2, r, -Math.PI / 2 + i * seg, -Math.PI / 2 + (i + 1) * seg);
    g.stroke();
  });
  g.fillStyle = selected ? '#ffffff' : 'rgba(232,237,245,0.9)';
  g.beginPath();
  g.arc(size / 2, size / 2, selected ? 4 : 3, 0, Math.PI * 2);
  g.fill();
  ringCache.set(key, c);
  return c;
}

const hex = (h: string) => Cesium.Color.fromCssColorString(h);
const lerpColor = (a: Cesium.Color, b: Cesium.Color, t: number) => Cesium.Color.lerp(a, b, t, new Cesium.Color());

/** Score ramp from dim grey through amber to teal, t in 0..1. */
export function scoreColor(t: number): Cesium.Color {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? lerpColor(hex(COLORS.dim), hex(COLORS.mid), x / 0.5) : lerpColor(hex(COLORS.mid), hex(COLORS.good), (x - 0.5) / 0.5);
}

export function scoreCss(t: number): string {
  return scoreColor(t).toCssColorString();
}
