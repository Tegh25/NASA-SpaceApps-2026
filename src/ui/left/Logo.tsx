import { Link } from 'react-router-dom';
import { useApp } from '../../state/store';

/** Contour-line disc with a crescent: terrain on Earth, a body in the sky. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="15" cy="17" r="13" stroke="var(--rule-hi)" strokeWidth="1" />
      <path d="M4.5 20c2-5.5 7.5-8.5 12.5-7.5s8 5 7.5 9.5" stroke="var(--dim)" strokeWidth="1" strokeLinecap="round" />
      <path d="M8 23c2-3.5 5.5-5.5 9-4.5s5 3 4.5 6" stroke="var(--dim)" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 26.5c1.5-1.8 3.5-2.5 6-2" stroke="var(--dim)" strokeWidth="1" strokeLinecap="round" />
      <path d="M25 3.2a7.5 7.5 0 1 0 3.8 10.4 6 6 0 0 1-3.8-10.4z" fill="var(--accent)" stroke="var(--hull)" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ tagline = true }: { tagline?: boolean }) {
  return (
    <Link to="/" onClick={() => useApp.getState().goHome()} className="flex items-center gap-2.5 rounded-[2px]" aria-label="Terralog home">
      <LogoMark />
      <span className="min-w-0">
        <span className="font-display block text-[19px] font-semibold leading-none tracking-tight text-[var(--ink)]">Terralog</span>
        {tagline && <span className="mt-1 block text-[11.5px] leading-none text-[var(--dim)]">Earth places that look like the Moon and Mars</span>}
      </span>
    </Link>
  );
}
