import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ActiveBody, CardModel } from '../../lib/cards';
import { LocationCard } from './LocationCard';

/** Catalogued analog sites each run checked novelty against (discovery/HANDOFF.md, MARS_FINDINGS.md). */
const CATALOG = { moon: 166, mars: 251 } as const;

export function CardSkeletons({ n = 3 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-1.5" role="status" aria-label="Loading candidates">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rise-in glass-thin flex gap-2.5 p-2.5" style={{ ['--i' as string]: i }}>
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

function Section({ title, count, note, tone, children }: { title: string; count: number; note: ReactNode; tone?: 'accent'; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5" aria-label={`${title}, ${count}`}>
      <header className="px-1 pt-1">
        <div className="flex items-center gap-2">
          {tone === 'accent' && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />}
          <h3 className="font-display text-[13px] font-medium text-[var(--ink)]">{title}</h3>
          <span className="num ml-auto text-[11px] text-[var(--dim)]">{count}</span>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--dim)]">{note}</p>
      </header>
      {children}
    </section>
  );
}

/** The rail's card stack: our finds, known analogs, then a reserve disclosure. */
export function CardList({
  cards,
  reserves,
  selectedId,
  bodyKey,
  body,
  mode,
}: {
  cards: CardModel[];
  reserves: CardModel[];
  selectedId: string | null;
  bodyKey: string;
  body: ActiveBody;
  mode: 'featured' | 'search';
}) {
  const [open, setOpen] = useState(false);
  const fresh = cards.filter((c) => c.kind === 'new');
  const known = cards.filter((c) => c.kind !== 'new');

  const reserveBlock = reserves.length > 0 && (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="more-candidates"
        onClick={() => setOpen((v) => !v)}
        className="glass-capsule mt-1 flex h-9 items-center justify-between px-4 text-[12.5px] text-[var(--dim)] hover:text-[var(--ink)]"
      >
        <span>
          Reserve candidates <span className="num">({reserves.length})</span>
        </span>
        <ChevronDown size={15} aria-hidden className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id="more-candidates" className="flex flex-col gap-1.5">
          <p className="px-1 text-[11.5px] leading-4 text-[var(--dim)]">Also passed the screen, but ranked lower or have a known weakness.</p>
          {reserves.map((c, i) => (
            <LocationCard key={c.id} card={c} index={i} selected={selectedId === c.id} />
          ))}
        </div>
      )}
    </div>
  );

  if (mode === 'search') {
    return (
      <div className="flex flex-col gap-1.5" key={bodyKey}>
        {cards.length === 0 ? (
          <p className="glass-thin p-3 text-[12.5px] leading-5 text-[var(--dim)]">
            Nothing scores above zero for this description. Loosen a slider or clear the search.
          </p>
        ) : (
          cards.map((c, i) => <LocationCard key={c.id} card={c} index={i} selected={selectedId === c.id} />)
        )}
        {reserveBlock}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" key={bodyKey}>
      {fresh.length > 0 && (
        <Section
          title="Found by our pipeline"
          count={fresh.length}
          tone="accent"
          note={
            <>
              Scored from satellite data, at least <span className="num">150</span> km from the{' '}
              <span className="num">{CATALOG[body]}</span> catalogued analog sites we checked.
            </>
          }
        >
          {fresh.map((c, i) => (
            <LocationCard key={c.id} card={c} index={i} rank={i + 1} selected={selectedId === c.id} />
          ))}
        </Section>
      )}
      {known.length > 0 && (
        <Section title="Known analogs" count={known.length} note="Already studied by others. Shown to check our method against.">
          {known.map((c, i) => (
            <LocationCard key={c.id} card={c} index={i + fresh.length} selected={selectedId === c.id} />
          ))}
        </Section>
      )}
      {reserveBlock}
    </div>
  );
}
