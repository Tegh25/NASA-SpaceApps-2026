import { Mountain } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CardModel } from '../../lib/cards';
import { useApp } from '../../state/store';
import { Badge } from '../kit/Badge';
import { ScoreRing } from '../kit/ScoreRing';

interface Props {
  card: CardModel;
  index: number;
  selected: boolean;
  /** 1-based rank among our new finds; shown as a small index. */
  rank?: number;
  /** 'carousel' is the compact fixed-width variant used on mobile. */
  layout?: 'rail' | 'carousel';
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border border-white/15 bg-[var(--void)]">
      {src ? (
        <>
          <img src={src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
          <span
            aria-hidden
            className="absolute inset-0 bg-[var(--accent)]"
            style={{ mixBlendMode: 'color', opacity: 0.28 }}
          />
          <span aria-hidden className="absolute inset-0 bg-[var(--accent)]" style={{ mixBlendMode: 'soft-light', opacity: 0.25 }} />
        </>
      ) : (
        <span className="grid-paper absolute inset-0 opacity-70" aria-hidden />
      )}
    </span>
  );
}

export function LocationCard({ card, index, selected, rank, layout = 'rail' }: Props) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const hover = useApp((s) => s.hover);
  const carousel = layout === 'carousel';

  return (
    <div
      className={`rise-in relative ${carousel ? 'w-[min(82vw,320px)] shrink-0 snap-start' : ''}`}
      style={{ ['--i' as string]: index }}
    >
      <button
        type="button"
        onClick={() => navigate('/site/' + card.id + search)}
        onMouseEnter={() => hover(card.id)}
        onMouseLeave={() => hover(null)}
        onFocus={() => hover(card.id)}
        onBlur={() => hover(null)}
        aria-label={`${card.name}, ${card.region}${card.score !== null ? `, match score ${card.score}` : ''}`}
        aria-current={selected ? 'true' : undefined}
        data-selected={selected ? '' : undefined}
        className={`glass-thin group relative block w-full p-2.5 text-left ${carousel ? 'glass-blur' : ''}`}
      >
        <span className="flex gap-2.5">
          <Thumb src={card.thumb} />
          <span className="relative block min-w-0 flex-1">
            <span className="block pr-11">
              <span className="font-display flex items-baseline gap-1.5 text-[15px] font-medium leading-5 text-[var(--ink)]">
                {rank !== undefined && <span className="num shrink-0 text-[11px] font-normal text-[var(--accent)]">{String(rank).padStart(2, '0')}</span>}
                <span className="truncate">{card.name}</span>
              </span>
              <span className="block truncate text-[12px] leading-4 text-[var(--dim)]">{card.region}</span>
            </span>
            <ScoreRing score={card.score} size={40} className="absolute right-0 top-0" />
            <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-[var(--dim)]">{card.headline}</span>
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-1.5">
          <Badge kind={card.kind} valueSource={card.valueSource} />
          {card.shortfall && (
            <span
              title={`Falls short: ${card.shortfall}`}
              className="num min-w-0 truncate rounded-full border border-[color-mix(in_srgb,var(--bad)_45%,transparent)] bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] px-2 py-[1px] text-[11px] leading-4 text-[#ff8a9a]"
            >
              <span className="sr-only">Falls short: </span>
              {card.shortfall}
            </span>
          )}
          {card.hasTwin && (
            <span title="3D terrain twin available" className="ml-auto flex shrink-0 items-center gap-1 text-[11px] leading-4 text-[var(--dim)]">
              <Mountain size={12} aria-hidden /> 3D twin
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
