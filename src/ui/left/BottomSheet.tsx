import { ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const SNAPS = [0.3, 0.85] as const;

/** Mobile bottom sheet with a drag handle. Snaps at 30 % and 85 % of the viewport height. */
export function BottomSheet({
  children,
  expanded,
  onExpandedChange,
  onHeight,
}: {
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  onHeight?: (px: number) => void;
}) {
  const [vh, setVh] = useState(() => window.innerHeight);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null);

  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const snapH = (e: boolean) => Math.round(vh * SNAPS[e ? 1 : 0]);
  const height = dragH ?? snapH(expanded);
  useEffect(() => onHeight?.(height), [height, onHeight]);

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: snapH(expanded), moved: false, lastY: e.clientY, lastT: performance.now(), v: 0 };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const now = performance.now();
    d.v = (d.lastY - e.clientY) / Math.max(1, now - d.lastT);
    d.lastY = e.clientY;
    d.lastT = now;
    setDragH(Math.min(vh * 0.9, Math.max(vh * 0.2, d.h + dy)));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setDragH(null);
      onExpandedChange(!expanded);
      return;
    }
    const cur = dragH ?? d.h;
    let next: boolean;
    if (Math.abs(d.v) > 0.5) next = d.v > 0;
    else next = Math.abs(cur - vh * SNAPS[1]) < Math.abs(cur - vh * SNAPS[0]);
    setDragH(null);
    onExpandedChange(next);
  };

  return (
    <section
      aria-label="Search and site details"
      className="console notch pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex flex-col"
      style={{ height, transition: dragH === null ? 'height 250ms var(--ease-out-quint)' : 'none' }}
    >
      <div
        className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
          aria-expanded={expanded}
          onClick={(e) => {
            // Pointer taps are handled by the drag logic; detail 0 means keyboard or assistive tech.
            if (e.detail === 0) onExpandedChange(!expanded);
          }}
          className="group flex h-8 w-24 flex-col items-center justify-center gap-0.5 rounded-[2px]"
        >
          <span className="h-1 w-10 rounded-full bg-[var(--rule-hi)] transition-colors group-hover:bg-[var(--accent)]" />
          <ChevronUp
            size={12}
            aria-hidden
            className={`text-[var(--faint)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
