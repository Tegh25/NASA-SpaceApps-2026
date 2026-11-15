import { createElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { makeDisplacementMap } from './glassMap';

/** True on Chromium engines, the only ones that accept `backdrop-filter: url(#svg)`. */
export function supportsRefraction(): boolean {
  if (typeof navigator === 'undefined' || typeof CSS === 'undefined') return false;
  if (!CSS.supports('backdrop-filter', 'url(#x)') && !CSS.supports('-webkit-backdrop-filter', 'url(#x)')) return false;
  const nav = navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } };
  const brands = nav.userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium/i.test(b.brand));
  return /Chrome\//.test(navigator.userAgent) && !/(Edg|OPR)\/.*Mobile|iPhone|iPad/.test(navigator.userAgent);
}

interface Props {
  as?: 'div' | 'aside' | 'section' | 'header' | 'nav';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Corner radius in px (must match the CSS radius). */
  radius?: number;
  /** Width in px of the refracting edge band. */
  bezel?: number;
  /** Max backdrop shift in px at the very edge. */
  strength?: number;
  [k: string]: unknown;
}

/**
 * Big Liquid Glass panel. Measures itself and, on Chromium, builds an edge-lens displacement filter sized to
 * the element. Everywhere else it is plain blur + saturate glass (pure CSS). Use sparingly: each one is a
 * full-size refraction surface over the WebGL globe.
 */
export function Glass({ as = 'div', className = '', style, children, radius = 22, bezel = 30, strength = 22, ...rest }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = `glass-${uid}`;
  const [map, setMap] = useState<{ url: string; w: number; h: number } | null>(null);
  const [on] = useState(supportsRefraction);

  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    let t = 0;
    const build = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w < 8 || h < 8) return;
      const url = makeDisplacementMap(w, h, radius, bezel);
      if (url) setMap((m) => (m && m.w === w && m.h === h ? m : { url, w, h }));
    };
    build();
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(build, 140);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [on, radius, bezel]);

  const active = on && map !== null;
  return createElement(
    as,
    {
      ...rest,
      ref,
      className: `glass ${className}`,
      'data-sheen': '',
      'data-refract': active ? '' : undefined,
      style: { ...style, ['--glass-filter' as string]: active ? `url(#${id})` : undefined },
    },
    active && map && (
      <svg aria-hidden width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="soft" />
          <feImage href={map.url} x="0" y="0" width={map.w} height={map.h} preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="soft" in2="map" scale={strength * 2} xChannelSelector="R" yChannelSelector="G" result="bent" />
          <feColorMatrix in="bent" type="saturate" values="1.5" result="sat" />
          <feComponentTransfer in="sat">
            <feFuncR type="linear" slope="0.82" />
            <feFuncG type="linear" slope="0.82" />
            <feFuncB type="linear" slope="0.82" />
          </feComponentTransfer>
        </filter>
      </svg>
    ),
    children,
  );
}
