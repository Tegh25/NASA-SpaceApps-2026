import type { CardKind } from '../../lib/cards';

interface Props {
  kind: CardKind;
  valueSource?: 'computed' | 'literature';
  className?: string;
}

/** Small status tag on a location card. Sentence case, hairline outline. */
export function Badge({ kind, valueSource, className = '' }: Props) {
  let label = 'Known analog';
  let style = 'border-[var(--rule-hi)] text-[var(--dim)]';
  if (kind === 'new') {
    label = 'New candidate';
    style = 'border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]';
  } else if (kind === 'engine') {
    label = 'Engine match';
    style = 'border-dashed border-[var(--rule-hi)] text-[var(--dim)]';
  } else if (valueSource === 'literature') {
    label = 'Literature values';
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-[2px] border px-1.5 py-[1px] text-[11px] leading-4 ${style} ${className}`}
    >
      {label}
    </span>
  );
}
