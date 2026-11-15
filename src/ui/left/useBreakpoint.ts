import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const read = (): Breakpoint => {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  return w >= 1280 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile';
};

/** Matches Tailwind md (768) and xl (1280): below 1280 px the right panel is a drawer so the globe keeps room. */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(read);
  useEffect(() => {
    const on = () => setBp(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return bp;
}
