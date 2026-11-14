import { AlertTriangle, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { GlobeView } from './globe/GlobeView';
import { hasWebGL2 } from './globe/viewer';
import { Home } from './pages/Home';
import { Method } from './pages/Method';
import { useApp } from './state/store';
import { TourView } from './tour/TourView';
import { DemoRibbon } from './ui/DemoRibbon';

const TargetPage = lazy(() => import('./target/TargetPage'));
const ComparePage = lazy(() => import('./target/ComparePage'));

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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className={`absolute inset-y-0 left-0 ${isCompare ? 'right-1/2 hidden md:block' : 'right-0'}`}>
        <GlobeView hidden={!isGlobeRoute} interactive={interactive} />
      </div>
      <DemoRibbon />

      {status === 'error' && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-6">
          <div className="panel max-w-xl p-5" role="alert">
            <div className="mb-2 flex items-center gap-2 text-[var(--bad)]">
              <AlertTriangle size={18} aria-hidden />
              <h1 className="text-lg font-semibold">Data failed to load</h1>
            </div>
            <pre className="scroll-thin mb-4 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-xs text-[var(--muted)]">
              {error}
            </pre>
            <p className="mb-4 text-sm text-[var(--muted)]">
              The globe still works, but search and findings need the data files in <code className="font-mono">public/data/</code>.
            </p>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-2 rounded-lg bg-[var(--moon)] px-4 py-2 text-sm font-semibold text-[#0b1220]"
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
        <Route path="/method" element={<Method />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}
