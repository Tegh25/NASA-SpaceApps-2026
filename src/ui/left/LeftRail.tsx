import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { activeBody, useCards } from '../../lib/cards';
import { useApp } from '../../state/store';
import { Glass } from '../kit/Glass';
import { BodyToggle } from './BodyToggle';
import { CardList, CardSkeletons } from './CardList';
import { Logo } from './Logo';

export function LeftRail({ selectedId }: { selectedId: string | null }) {
  const status = useApp((s) => s.status);
  const body = useApp((s) => activeBody(s.query.body));
  const { cards, reserves, mode } = useCards();
  const heading =
    mode === 'search' ? 'Closest matches to your description' : body === 'moon' ? 'Earth sites that resemble the Moon' : 'Earth sites that resemble Mars';

  return (
    <Glass as="aside" className="flex h-full w-[320px] flex-col" aria-label="Candidate locations">
      <div className="px-4 pb-3 pt-4">
        <Logo />
      </div>
      <div className="px-4 pb-3">
        <BodyToggle />
      </div>
      <div className="flex items-baseline justify-between border-t border-[var(--rule)] px-4 pb-1 pt-3">
        <h2 className="text-[11.5px] font-medium tracking-wide text-[var(--dim)]">{heading}</h2>
        {status === 'ready' && mode === 'search' && <span className="num text-[11px] text-[var(--dim)]">{cards.length}</span>}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
        {status === 'ready' ? (
          <CardList cards={cards} reserves={reserves} selectedId={selectedId} bodyKey={body + mode} body={body} mode={mode} />
        ) : (
          <CardSkeletons />
        )}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-[var(--rule)] px-4 py-3">
        <p className="text-[11px] leading-4 text-[var(--dim)]">Data: NASA LRO, MGS, MODIS, Copernicus DEM, Landsat, Sentinel-2.</p>
        <Link
          to="/method"
          className="glass-capsule flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[12px] text-[var(--ink)]"
        >
          <BookOpen size={13} aria-hidden /> Method
        </Link>
      </footer>
    </Glass>
  );
}
