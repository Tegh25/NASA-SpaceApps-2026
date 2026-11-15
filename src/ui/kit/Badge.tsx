import type { CardKind } from '../../lib/cards';

interface Props {
  kind: CardKind;
  valueSource?: 'computed' | 'literature';
  className?: string;
}

/** Small status capsule on a location card. Sentence case, hairline outline. */
export function Badge({ kind, valueSource, className = '' }: Props) {
  let label = 'Known analog';
  let style = 'border-white/20 bg-white/[0.06] text-[var(--dim)]';
  if (kind === 'new') {
    label = 'New candidate';
    style = 'border-[color-mix(in_srgb,var(--accent)_60%,transparent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]';
  } else if (kind === 'engine') {
    label = 'Engine match';
    style = 'border-dashed border-white/25 text-[var(--dim)]';
  } else if (valueSource === 'literature') {
    label = 'Literature values';
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-[1px] text-[11px] leading-4 ${style} ${className}`}
    >
      {label}
    </span>
  );
}
