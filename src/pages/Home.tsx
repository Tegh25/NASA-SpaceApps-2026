import { SlidersHorizontal, X, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { GlobeHud } from '../globe/GlobeHud';
import { activeBody, useCards } from '../lib/cards';
import { useUrlSync } from '../lib/urlState';
import { useApp } from '../state/store';
import { RightPanel } from '../ui/right/RightPanel';
import { BodyToggle } from '../ui/left/BodyToggle';
import { BottomSheet } from '../ui/left/BottomSheet';
import { CardSkeletons } from '../ui/left/CardList';
import { GlobeNotes } from '../ui/left/GlobeNotes';
import { LeftRail } from '../ui/left/LeftRail';
import { LocationCard } from '../ui/left/LocationCard';
import { Logo } from '../ui/left/Logo';
import { useBreakpoint } from '../ui/left/useBreakpoint';

export { Logo };

function MobileCarousel({ selectedId }: { selectedId: string | null }) {
  const status = useApp((s) => s.status);
  const { cards } = useCards();
  return (
    <div
      className="scroll-thin flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1"
      role="region"
      aria-label="Candidate locations"
    >
      {status !== 'ready' ? (
        <div className="w-[min(82vw,320px)] shrink-0">
          <CardSkeletons n={1} />
        </div>
      ) : (
        cards.map((c, i) => <LocationCard key={c.id} card={c} index={i} selected={selectedId === c.id} layout="carousel" />)
      )}
    </div>
  );
}

export function Home() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const select = useApp((s) => s.select);
  const status = useApp((s) => s.status);
  const body = useApp((s) => activeBody(s.query.body));
  const setBody = useApp((s) => s.setBody);
  const bp = useBreakpoint();
  const [findOpen, setFindOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  useUrlSync();

  useEffect(() => {
    select(id ?? null);
  }, [id, select, status]);

  // Default body is the Moon unless the URL asked for something else.
  useEffect(() => {
    if (status !== 'ready') return;
    const st = useApp.getState();
    if (st.query.body === 'either' && !new URLSearchParams(window.location.search).get('body')) setBody('moon');
  }, [status, setBody]);

  const selectedId = id ?? null;
  const closeDrawer = () => {
    setFindOpen(false);
    if (selectedId) navigate({ pathname: '/', search });
  };

  return (
    <div data-body={body} className="pointer-events-none absolute inset-0 z-10">
      {bp !== 'mobile' && (
        <div className="pointer-events-auto absolute inset-y-0 left-0 z-20">
          <LeftRail selectedId={selectedId} />
        </div>
      )}

      {/* Middle column: the globe shows through; HUD and pencil notes sit on top. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 md:left-[320px] lg:right-[400px]">
        <GlobeHud />
        <GlobeNotes selectedId={selectedId} />
        {bp === 'tablet' && !selectedId && !findOpen && (
          <button
            type="button"
            onClick={() => setFindOpen(true)}
            aria-label="Open find panel"
            className="panel pointer-events-auto absolute right-4 top-4 flex h-9 items-center gap-2 px-3 text-[13px] text-[var(--ink)] hover:border-[var(--accent)]"
          >
            <SlidersHorizontal size={14} aria-hidden /> Find
          </button>
        )}
      </div>

      {bp === 'desktop' && (
        <aside className="console notch pointer-events-auto absolute inset-y-0 right-0 w-[400px]" aria-label="Find and explore">
          <RightPanel siteId={selectedId} />
        </aside>
      )}

      {bp === 'tablet' && (
        <div
          className="pointer-events-auto absolute inset-y-0 right-0 w-[400px] max-w-[calc(100%-320px-16px)]"
          style={{
            transform: selectedId || findOpen ? 'none' : 'translateX(calc(100% + 16px))',
            transition: 'transform 250ms var(--ease-out-quint)',
            visibility: selectedId || findOpen ? 'visible' : 'hidden',
          }}
          aria-hidden={!(selectedId || findOpen)}
        >
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close panel"
            className="console absolute -left-10 top-4 z-10 grid h-9 w-9 place-items-center text-[var(--dim)] hover:text-[var(--ink)]"
          >
            <X size={16} aria-hidden />
          </button>
          <div className="console notch h-full" aria-label="Find and explore">
            <RightPanel siteId={selectedId} />
          </div>
        </div>
      )}

      {bp === 'mobile' && (
        <>
          <header className="pointer-events-auto absolute inset-x-2 top-2 z-20">
            <div className="panel flex items-center justify-between gap-2 px-3 py-2">
              <Logo tagline={false} />
              <div className="flex items-center gap-2">
                <BodyToggle className="w-[150px]" />
                <Link
                  to="/method"
                  aria-label="Method"
                  className="grid h-9 w-9 place-items-center rounded-[3px] border border-[var(--rule-hi)] text-[var(--ink)]"
                >
                  <BookOpen size={15} aria-hidden />
                </Link>
              </div>
            </div>
          </header>
          {!selectedId && !sheetOpen && (
            <div className="pointer-events-auto absolute inset-x-0 z-20" style={{ bottom: sheetH + 8 }}>
              <MobileCarousel selectedId={selectedId} />
            </div>
          )}
          <BottomSheet expanded={sheetOpen} onExpandedChange={setSheetOpen} onHeight={setSheetH}>
            <RightPanel siteId={selectedId} />
          </BottomSheet>
        </>
      )}
    </div>
  );
}
