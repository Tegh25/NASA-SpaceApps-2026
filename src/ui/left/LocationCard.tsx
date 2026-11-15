import { useLocation, useNavigate } from 'react-router-dom';
import type { CardModel } from '../../lib/cards';
import { useApp } from '../../state/store';
import { Badge } from '../kit/Badge';
import { HandNote, PencilLoop } from '../kit/HandNote';
import { ScoreRing } from '../kit/ScoreRing';

interface Props {
  card: CardModel;
  index: number;
  selected: boolean;
  best?: boolean;
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

export function LocationCard({ card, index, selected, best = false, layout = 'rail' }: Props) {
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
              <span className="font-display block truncate text-[15px] font-medium leading-5 text-[var(--ink)]">{card.name}</span>
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
        </span>
      </button>
      {selected && <PencilLoop />}
      {selected && best && (
        <HandNote
          size={17}
          delayMs={500}
          className="pointer-events-none absolute -bottom-2.5 right-3 rotate-[-3deg] rounded-full bg-[rgba(8,13,22,0.8)] px-2"
        >
          best match
        </HandNote>
      )}
    </div>
  );
}
