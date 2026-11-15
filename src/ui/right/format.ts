/** Unit formatting for the right panel. Render every result inside an element with the `.num` class. */

export const MINUS = '−';

export const kToC = (k: number) => k - 273.15;

type Kind = 'K' | 'mm_yr' | 'frac' | 'deg' | 'm' | 'per_km2' | 'index' | 'other';

export function unitKind(key: string, unit: string): Kind {
  const u = unit.trim().toLowerCase();
  if (key.includes('ndvi')) return 'index';
  if (/(_frac|_fraction)$/.test(key) || key === 'ice_proxy' || key === 'ice_signal' || u === '0 to 1' || u === '0..1' || u === 'fraction') return 'frac';
  if (u === 'k') return 'K';
  if (u.includes('mm/yr')) return 'mm_yr';
  if (u === 'deg' || u === '°' || u === 'degrees') return 'deg';
  if (u.includes('km')) return 'per_km2';
  if (u === 'm' || u.startsWith('m ')) return 'm';
  if (u === 'index') return 'index';
  return 'other';
}

function digits(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, '');
  if (a >= 1) return v.toFixed(1);
  if (a === 0) return '0';
  return v.toFixed(2);
}

export function signed(n: number): string {
  return n < 0 ? `${MINUS}${digits(-n)}` : digits(n);
}

export function formatCelsius(k: number): string {
  const c = kToC(k);
  return `${c < 0 ? MINUS : ''}${Math.abs(c).toFixed(0)} °C`;
}

/** "141 K", "0.4 mm/yr", "35%", "5.2 deg", "12 m". */
export function formatValue(key: string, unit: string, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  switch (unitKind(key, unit)) {
    case 'K':
      return `${Math.round(v)} K`;
    case 'mm_yr':
      return `${digits(v)} mm/yr`;
    case 'frac': {
      const p = v * 100;
      return `${p < 10 && p !== 0 ? p.toFixed(1) : p.toFixed(0)}%`;
    }
    case 'deg':
      return `${v.toFixed(1)}°`;
    case 'm':
      return `${digits(v)} m`;
    case 'per_km2':
      return `${digits(v)} per km²`;
    case 'index':
      return v.toFixed(2);
    default:
      return unit ? `${digits(v)} ${unit}` : digits(v);
  }
}

/** Value with a faint secondary part (Celsius for kelvin). */
export function formatWithAside(key: string, unit: string, v: number): { main: string; aside?: string } {
  const main = formatValue(key, unit, v);
  if (unitKind(key, unit) === 'K') return { main, aside: `(${formatCelsius(v)})` };
  return { main };
}

/** Plain-text number plus unit for arbitrary gap rows ("274 K", "5 h"). */
export function formatUnit(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  const u = unit.trim();
  if (u === '%') return `${digits(v)}%`;
  return u ? `${digits(v)} ${u}` : digits(v);
}

export function formatDelta(a: number | null, b: number | null, unit: string): string | null {
  if (a === null || b === null) return null;
  const d = a - b;
  const sign = d < 0 ? MINUS : '+';
  const u = unit.trim();
  const body = digits(Math.abs(d));
  return `${sign}${body}${u === '%' ? '%' : u ? ` ${u}` : ''}`;
}
