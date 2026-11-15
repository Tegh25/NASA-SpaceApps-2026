import { AlertTriangle, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { GlobeView } from './globe/GlobeView';
import { hasWebGL2 } from './globe/viewer';
import { Home } from './pages/Home';
import { Method } from './pages/Method';
import { useApp } from './state/store';
import { TourView } from './tour/TourView';
import { GlassFilters } from './ui/kit/GlassFilters';
import { CardSkeletons } from './ui/left/CardList';
import { Logo } from './ui/left/Logo';

const TargetPage = lazy(() => import('./target/TargetPage'));
const ComparePage = lazy(() => import('./target/ComparePage'));
const LabPage = lazy(() => import('./lab/LabPage'));

/** Instant first paint while data and Cesium load. */
function BootSkeleton() {
  return (
    <div className="grid-paper absolute inset-0 z-40 bg-[var(--void)]" role="status" aria-label="Loading Terralog">
      <div className="console absolute inset-y-0 left-0 hidden w-[320px] flex-col gap-4 bg-[var(--hull)] p-4 md:flex">
        <Logo tagline={false} />
        <div className="skeleton h-[38px] w-full" />
        <CardSkeletons n={4} />
      </div>
      <div className="absolute inset-0 grid place-items-center md:left-[320px] lg:right-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="md:hidden">
            <Logo tagline={false} />
          </div>
          <div className="relative h-24 w-24 rounded-full border border-[var(--rule-hi)]">
            <div className="absolute inset-3 rounded-full border border-[var(--rule)]" />
            <div className="absolute inset-7 rounded-full border border-[var(--rule)]" />
            <div className="skeleton absolute inset-0 rounded-full opacity-60" />
          </div>
          <p className="text-[13px] text-[var(--dim)]">Loading the globe and site data</p>
        </div>
      </div>
      <div className="console absolute inset-y-0 right-0 hidden w-[400px] p-4 lg:block">
        <div className="skeleton mb-3 h-6 w-1/2" />
        <div className="skeleton mb-2 h-10 w-full" />
        <div className="skeleton mb-2 h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-[var(--muted)]" role="status">
      {label}
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const load = useApp((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  if (!hasWebGL2()) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-md">
          <h1 className="mb-2 text-xl font-semibold">WebGL 2 is not available</h1>
          <p className="text-[var(--muted)]">
            Terralog needs WebGL 2 to draw the globe. Try a current version of Chrome, Edge, Firefox or Safari, and make sure hardware
            acceleration is turned on.
          </p>
        </div>
      </div>
    );
  }

  const isGlobeRoute = pathname === '/' || pathname.startsWith('/site/') || pathname.startsWith('/tour/') || pathname.startsWith('/compare/');
  const interactive = pathname === '/' || pathname.startsWith('/site/');
  const isCompare = pathname.startsWith('/compare/');
  // /lab/ draws its own full-screen three.js scene, so the globe stays hidden there (not in isGlobeRoute).

  return (
    <div className="relative h-full w-full overflow-hidden">
      <GlassFilters />
      <div
        className={`absolute inset-y-0 ${
          isCompare ? 'left-0 right-1/2 hidden md:block' : 'left-0 right-0'
        }`}
      >
        <GlobeView hidden={!isGlobeRoute} interactive={interactive} />
      </div>
      {status === 'loading' && interactive && <BootSkeleton />}

      {status === 'error' && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-6">
          <div className="console notch max-w-xl p-5" role="alert">
            <div className="mb-2 flex items-center gap-2 text-[var(--bad)]">
              <AlertTriangle size={18} aria-hidden />
              <h1 className="text-lg font-semibold">Data failed to load</h1>
            </div>
            <pre className="scroll-thin mb-4 max-h-60 overflow-auto whitespace-pre-wrap rounded-[2px] border border-[var(--rule)] bg-[var(--void)] p-3 font-mono text-xs text-[var(--muted)]">
              {error}
            </pre>
            <p className="mb-4 text-sm text-[var(--muted)]">
              The globe still works, but search and findings need the data files in <code className="font-mono">public/data/</code>.
            </p>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-2 rounded-[3px] bg-[var(--moon)] px-4 py-2 text-sm font-semibold text-[#0b1220]"
            >
              <RefreshCw size={15} aria-hidden /> Retry
            </button>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/site/:id" element={<Home />} />
        <Route path="/tour/:id" element={<TourView />} />
        <Route
          path="/target/:id"
          element={
            <Suspense fallback={<Loading label="Loading target viewer..." />}>
              <TargetPage />
            </Suspense>
          }
        />
        <Route
          path="/compare/:siteId/:targetId"
          element={
            <Suspense fallback={<Loading label="Loading comparison..." />}>
              <ComparePage />
            </Suspense>
          }
        />
        <Route
          path="/lab/:siteId"
          element={
            <Suspense fallback={<Loading label="Loading terrain lab..." />}>
              <LabPage />
            </Suspense>
          }
        />
        <Route path="/method" element={<Method />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}
