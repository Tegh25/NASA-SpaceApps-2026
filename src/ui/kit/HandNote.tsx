import type { CSSProperties, ReactNode } from 'react';

/** Grease-pencil text. Fades in after `delayMs` (default 600). Never used for core data. */
export function HandNote({
  children,
  className = '',
  style,
  delayMs = 600,
  size = 22,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delayMs?: number;
  size?: number;
}) {
  return (
    <span
      className={`hand rise-in inline-block ${className}`}
      style={{ fontSize: size, animationDelay: `${delayMs}ms`, ...style }}
    >
      {children}
    </span>
  );
}

/** An imperfect loop drawn around an element. Parent must be `relative`. */
export function PencilLoop({ className = '', delayMs = 80 }: { className?: string; delayMs?: number }) {
  return (
    <svg
      className={`pointer-events-none absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] overflow-visible ${className}`}
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden
    >
      <path
        className="draw"
        d="M16 7 C80 2 200 3 289 5 C299 7 300 30 298 52 C297 80 296 93 285 95 C200 100 90 99 15 96 C3 94 1 70 2 48 C2 22 4 11 19 5 C31 2 40 3 52 1"
        stroke="var(--pencil)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ ['--len' as string]: 1600, animationDelay: `${delayMs}ms`, animationDuration: '900ms' }}
      />
    </svg>
  );
}

/** Hand-drawn curved arrow. Tip points left-down by default; `flip` mirrors it. */
export function PencilArrow({ className = '', delayMs = 700, flip = false }: { className?: string; delayMs?: number; flip?: boolean }) {
  return (
    <svg
      className={className}
      width="84"
      height="54"
      viewBox="0 0 84 54"
      fill="none"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <path
        className="draw"
        d="M78 8 C56 2 28 10 10 40"
        stroke="var(--pencil)"
        strokeWidth="1.8"
        strokeLinecap="round"
        style={{ ['--len' as string]: 120, animationDelay: `${delayMs}ms` }}
      />
      <path
        className="draw"
        d="M9 41 L8 27 M9 41 L22 36"
        stroke="var(--pencil)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ ['--len' as string]: 40, animationDelay: `${delayMs + 500}ms`, animationDuration: '300ms' }}
      />
    </svg>
  );
}
