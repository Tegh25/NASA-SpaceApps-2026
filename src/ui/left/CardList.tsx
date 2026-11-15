import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { CardModel } from '../../lib/cards';
import { LocationCard } from './LocationCard';

export function CardSkeletons({ n = 3 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-1.5" role="status" aria-label="Loading candidates">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rise-in flex gap-2.5 rounded-[3px] border border-[var(--rule)] p-2.5" style={{ ['--i' as string]: i }}>
          <div className="skeleton h-16 w-16 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="skeleton h-3.5 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The rail's card stack plus the "More candidates" disclosure. */
export function CardList({
  cards,
  reserves,
  selectedId,
  bodyKey,
}: {
  cards: CardModel[];
  reserves: CardModel[];
  selectedId: string | null;
  bodyKey: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5" key={bodyKey}>
      {cards.length === 0 && (
        <p className="rounded-[3px] border border-dashed border-[var(--rule-hi)] p-3 text-[12.5px] leading-5 text-[var(--dim)]">
          Nothing scores above zero for this description. Loosen a slider or clear the search.
        </p>
      )}
      {cards.map((c, i) => (
        <LocationCard key={c.id} card={c} index={i} selected={selectedId === c.id} best={i === 0 && cards.length > 1} />
      ))}
      {reserves.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="more-candidates"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 flex h-8 items-center justify-between rounded-[2px] border border-[var(--rule)] px-2.5 text-[12.5px] text-[var(--dim)] transition-colors hover:border-[var(--rule-hi)] hover:text-[var(--ink)]"
          >
            <span>
              More candidates <span className="num">({reserves.length})</span>
            </span>
            <ChevronDown size={15} aria-hidden className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div id="more-candidates" className="flex flex-col gap-1.5">
              {reserves.map((c, i) => (
                <LocationCard key={c.id} card={c} index={i} selected={selectedId === c.id} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
