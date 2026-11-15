import { useMemo } from 'react';
import { activeBody, formatGap, gapPhrase, useCards } from '../../lib/cards';
import { getSite } from '../../lib/sites';
import { useApp } from '../../state/store';
import { HandNote, PencilArrow } from '../kit/HandNote';

/** The pencil layer on the globe: one note at a time, desktop only. */
export function GlobeNotes({ selectedId }: { selectedId: string | null }) {
  const data = useApp((s) => s.data);
  const body = useApp((s) => activeBody(s.query.body));
  const { cards, mode } = useCards();

  const gapText = useMemo(() => {
    if (!data || !selectedId) return null;
    const f = getSite(data, selectedId)?.featured;
    const g = f?.gaps.find((x) => formatGap(x));
    const p = g ? gapPhrase(g) : null;
    if (!g || !p) return null;
    const v = p.abs >= 100 ? Math.round(p.abs / 10) * 10 : p.abs;
    return `still ~${v}${p.unit ? ' ' + p.unit : ''} ${p.word} than the target`;
  }, [data, selectedId]);

  if (!data) return null;

  if (selectedId) {
    if (!gapText) return null;
    return (
      <div key={'g' + selectedId} className="pointer-events-none absolute bottom-24 left-8 hidden md:block">
        <HandNote size={26}>{gapText}</HandNote>
      </div>
    );
  }

  const fresh = cards.filter((c) => c.kind === 'new').length;
  let text: string;
  if (mode === 'search') text = `${cards.length} ${cards.length === 1 ? 'place matches' : 'places match'} your description`;
  else if (fresh > 0) text = `${fresh} new ${fresh === 1 ? 'place' : 'places'} on Earth that look like ${body === 'moon' ? "the Moon's south pole" : 'Mars'}`;
  else text = body === 'mars' ? 'Mars: known analogs, literature values' : 'Known analogs for the Moon';
  if (!cards.length) return null;

  return (
    <div key={'h' + body + mode} className="pointer-events-none absolute left-7 top-24 hidden max-w-[250px] md:block">
      <HandNote size={25} className="leading-[1.05]">
        {text}
      </HandNote>
      <PencilArrow className="mt-1 -ml-3" />
    </div>
  );
}
