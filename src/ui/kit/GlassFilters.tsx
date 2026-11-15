import { useEffect } from 'react';
import { supportsRefraction } from './Glass';

/**
 * Mount once in App. Responsibilities:
 *  1. Flags `html[data-refract]` on engines that accept `backdrop-filter: url(#svg)` (Chromium).
 *  2. Drives the cursor-following specular sheen: sets --mx/--my on every `[data-sheen]` element under the
 *     pointer (rAF-throttled; off for touch and reduced motion).
 *  3. Hosts a hidden <svg> with the shared tone filter. Per-panel edge-lens filters live in <Glass>, because
 *     the displacement map must match each panel's pixel size.
 */
export function GlassFilters() {
  useEffect(() => {
    const root = document.documentElement;
    if (supportsRefraction()) root.setAttribute('data-refract', '1');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hover = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (reduced.matches || !hover.matches) return () => root.removeAttribute('data-refract');

    let raf = 0;
    let x = 0;
    let y = 0;
    const flush = () => {
      raf = 0;
      document.querySelectorAll<HTMLElement>('[data-sheen]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        if (inside) {
          el.style.setProperty('--mx', `${x - r.left}px`);
          el.style.setProperty('--my', `${y - r.top}px`);
          el.setAttribute('data-hot', '');
        } else if (el.hasAttribute('data-hot')) {
          el.removeAttribute('data-hot');
        }
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
      root.removeAttribute('data-refract');
    };
  }, []);

  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        <filter id="glass-tone" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="1.5" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.85" />
            <feFuncG type="linear" slope="0.85" />
            <feFuncB type="linear" slope="0.85" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
