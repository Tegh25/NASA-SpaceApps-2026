import { useEffect, useState } from 'react';
import { formatLatLon } from '../../lib/geo';

export interface HeroView {
  id: 'earth' | 'target' | 'twin';
  label: string;
  src?: string;
  caption: string;
}

/** 16:10 hero with a crossfading toggle between Earth site, target and twin. */
export function HeroImage({ views, lat, lon, name }: { views: HeroView[]; lat: number; lon: number; name: string }) {
  const [active, setActive] = useState(views[0]?.id ?? 'earth');
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  useEffect(() => setActive(views[0]?.id ?? 'earth'), [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = views.find((v) => v.id === active) ?? views[0];
  const anyImage = views.some((v) => v.src && !failed[v.id]);

  return (
    <figure className="m-0">
      <div className="notch relative aspect-[16/10] overflow-hidden border border-[var(--rule)] bg-[var(--void)]">
        {!anyImage && (
          <div className="grid-paper absolute inset-0 grid place-items-center">
            <span className="num rounded-sm bg-[var(--hull)] px-2 py-1 text-xs text-[var(--dim)]">{formatLatLon(lat, lon)}</span>
          </div>
        )}
        {views.map(
          (v) =>
            v.src &&
            !failed[v.id] && (
              <img
                key={v.id}
                src={v.src}
                alt={`${v.label} view of ${name}`}
                loading="lazy"
                onError={() => setFailed((f) => ({ ...f, [v.id]: true }))}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ opacity: v.id === current?.id ? 1 : 0, transition: 'opacity 300ms var(--ease-out-quint)' }}
              />
            ),
        )}
        {anyImage && current && (!current.src || failed[current.id]) && (
          <div className="grid-paper absolute inset-0 grid place-items-center">
            <span className="num rounded-sm bg-[var(--hull)] px-2 py-1 text-xs text-[var(--dim)]">No image for this view</span>
          </div>
        )}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        {(['tl', 'bl', 'br'] as const).map((c) => (
          <span
            key={c}
            aria-hidden
            className="pointer-events-none absolute h-3 w-3 border-[var(--accent)]"
            style={{
              top: c === 'tl' ? 8 : undefined,
              bottom: c !== 'tl' ? 8 : undefined,
              left: c !== 'br' ? 8 : undefined,
              right: c === 'br' ? 8 : undefined,
              borderWidth: c === 'tl' ? '1px 0 0 1px' : c === 'bl' ? '0 0 1px 1px' : '0 1px 1px 0',
              opacity: 0.8,
            }}
          />
        ))}
        {views.length > 1 && (
          <div role="radiogroup" aria-label="Image view" className="absolute left-3 top-3 inline-flex overflow-hidden rounded-sm border border-[var(--rule-hi)] bg-[var(--hull)]/85 backdrop-blur-sm">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === current?.id}
                onClick={() => setActive(v.id)}
                className={`px-2.5 py-1 text-xs transition-colors duration-200 ${
                  v.id === current?.id ? 'bg-[var(--accent)] text-[var(--void)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <figcaption className="num absolute inset-x-3 bottom-2.5 text-[10.5px] leading-tight text-[var(--ink)]/80">{current?.caption}</figcaption>
      </div>
    </figure>
  );
}
