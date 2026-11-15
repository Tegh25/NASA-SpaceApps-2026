/** Grease-pencil note with a hand-drawn arrow. Decorative; one per screen. */
export function HandNote({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none flex items-start gap-0.5 ${className}`}>
      <span className="hand -rotate-3 pt-0.5 text-[19px] leading-[1.05]">{children}</span>
      <svg width="54" height="46" viewBox="0 0 54 46" fill="none" stroke="var(--pencil)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path className="draw" style={{ ['--len' as string]: 80, animationDelay: '600ms' }} d="M3 6 C 22 2, 40 12, 46 36" />
        <path className="draw" style={{ ['--len' as string]: 30, animationDelay: '1100ms' }} d="M37 31 L46 37 L50 26" />
      </svg>
    </div>
  );
}
