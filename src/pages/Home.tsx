import { BookOpen } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HAS_ION } from '../globe/viewer';
import { useUrlSync } from '../lib/urlState';
import { useApp } from '../state/store';
import { FineTuneDrawer } from '../ui/FineTuneDrawer';
import { Legend } from '../ui/Legend';
import { ResultsList } from '../ui/ResultsList';
import { SearchBar } from '../ui/SearchBar';
import { SiteDetailPanel } from '../ui/SiteDetailPanel';

export function Logo() {
  return (
    <Link to="/" onClick={() => useApp.getState().goHome()} className="flex items-center gap-2.5" aria-label="Terralog home">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span>
        <span className="block text-lg font-semibold leading-none tracking-tight">Terralog</span>
        <span className="mt-0.5 hidden text-xs text-[var(--muted)] lg:block">Find Earth's Moon and Mars lookalikes.</span>
      </span>
    </Link>
  );
}

export function Home() {
  const { id } = useParams();
  const select = useApp((s) => s.select);
  const status = useApp((s) => s.status);
  useUrlSync();

  useEffect(() => {
    select(id ?? null);
  }, [id, select, status]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <header className="pointer-events-auto absolute inset-x-2 top-2 md:inset-x-4 md:top-4">
        <div className="mb-2 flex items-center justify-between md:hidden">
          <Logo />
          <Link to="/method" className="panel px-3 py-1.5 text-sm">
            Method
          </Link>
        </div>
        <div className="flex items-start gap-4">
          <div className="hidden shrink-0 pt-1.5 md:block md:w-[330px]">
            <Logo />
          </div>
          <div className="min-w-0 flex-1 md:max-w-[720px] min-[1500px]:mx-auto">
            <SearchBar />
          </div>
          <div className="hidden shrink-0 items-center gap-2 pt-1.5 md:flex">
            {!HAS_ION && (
              <span className="panel px-2.5 py-1 text-[11px] text-[var(--mid)]" title="No Cesium ion token configured">
                Low detail
              </span>
            )}
            <Link to="/method" className="panel flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-white/10">
              <BookOpen size={15} aria-hidden /> Method
            </Link>
          </div>
        </div>
      </header>

      <FineTuneDrawer />

      {/* Results: left sidebar on desktop, bottom sheet on mobile */}
      <div
        className={`absolute bottom-2 left-2 right-2 max-h-[42vh] md:bottom-24 md:left-4 md:right-auto md:top-[88px] md:max-h-none md:w-[330px] lg:top-[84px] ${
          id ? 'hidden md:flex' : 'flex'
        } flex-col justify-start`}
      >
        <ResultsList />
      </div>

      {id && (
        <div className="absolute inset-0 flex md:inset-auto md:bottom-4 md:right-4 md:top-[132px] md:w-[400px] lg:top-[84px]">
          <div className="flex w-full flex-col bg-[var(--bg)]/60 md:bg-transparent">
            <SiteDetailPanel id={id} />
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 hidden md:block">
        <Legend />
      </div>
    </div>
  );
}
