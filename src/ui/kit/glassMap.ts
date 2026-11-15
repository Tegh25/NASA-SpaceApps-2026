/**
 * Procedural displacement map for the Liquid Glass edge lens.
 * Technique (after kube.io "Liquid Glass in the browser"): inside a rounded rect, within `bezel` px of the edge,
 * every pixel is pushed along the inward normal by an amount that falls off smoothly toward the interior.
 * Encoded as R = x, G = y, 128 = neutral, so feDisplacementMap bends the backdrop only near the rim.
 */
export function makeDisplacementMap(w: number, h: number, radius: number, bezel: number): string | null {
  if (w < 4 || h < 4 || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(c.width, c.height);
  const d = img.data;
  const hx = c.width / 2;
  const hy = c.height / 2;
  const r = Math.min(radius, hx, hy);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const px = x + 0.5 - hx;
      const py = y + 0.5 - hy;
      const qx = Math.abs(px) - (hx - r);
      const qy = Math.abs(py) - (hy - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const sdf = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
      const depth = -sdf; // distance inside the edge
      let m = 0;
      let nx = 0;
      let ny = 0;
      if (depth < bezel) {
        const t = 1 - Math.max(0, depth) / bezel;
        m = t * t * t; // steep at the rim, gone by the bezel's inner edge
        if (ox > 0 || oy > 0) {
          const len = Math.hypot(ox, oy) || 1;
          nx = (ox / len) * Math.sign(px);
          ny = (oy / len) * Math.sign(py);
        } else if (qx > qy) nx = Math.sign(px);
        else ny = Math.sign(py);
      }
      const i = (y * c.width + x) * 4;
      // inward = -outward normal
      d[i] = Math.round(128 - nx * m * 127);
      d[i + 1] = Math.round(128 - ny * m * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
