import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { activeBody, type ActiveBody } from '../../lib/cards';
import { useApp } from '../../state/store';

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10.5 2.2a6 6 0 1 0 3.3 8.6A4.8 4.8 0 0 1 10.5 2.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="6" cy="9.5" r="0.9" fill="currentColor" />
      <circle cx="8.4" cy="11.8" r="0.6" fill="currentColor" />
      <circle cx="5.6" cy="6.2" r="0.6" fill="currentColor" />
    </svg>
  );
}
function MarsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.4 7c2 1.2 4 .6 5.6-.2s3.6-1.2 5.6-.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M4.2 11c1.2.6 2.4.6 3.8.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

const OPTIONS: { id: ActiveBody; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'moon', label: 'Moon', Icon: MoonIcon },
  { id: 'mars', label: 'Mars', Icon: MarsIcon },
];

export function BodyToggle({ className = '' }: { className?: string }) {
  const body = useApp((s) => activeBody(s.query.body));
  const setBody = useApp((s) => s.setBody);
  const navigate = useNavigate();
  const { search } = useLocation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = body === 'moon' ? 0 : 1;

  const choose = (i: number, focus = false) => {
    const b = OPTIONS[i].id;
    if (b !== body) {
      setBody(b);
      navigate({ pathname: '/', search });
    }
    if (focus) refs.current[i]?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      choose((idx + 1) % 2, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      choose((idx + 1) % 2, true);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Target body"
      onKeyDown={onKey}
      className={`glass-capsule relative grid grid-cols-2 p-[3px] ${className}`}
    >
      <span
        aria-hidden
        className="liquid-blob pointer-events-none absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)]"
        style={{ transform: `translateX(${idx * 100}%)`, transition: 'transform 350ms cubic-bezier(0.34, 1.45, 0.64, 1)' }}
      >
        <span key={idx} />
      </span>
      {OPTIONS.map((o, i) => {
        const on = i === idx;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${o.label} analogs`}
            tabIndex={on ? 0 : -1}
            onClick={() => choose(i)}
            className={`relative z-10 flex h-9 items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-colors duration-200 ${
              on ? 'text-[var(--ink)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'
            }`}
          >
            <span className={on ? 'text-[var(--accent)]' : ''}>
              <o.Icon />
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
