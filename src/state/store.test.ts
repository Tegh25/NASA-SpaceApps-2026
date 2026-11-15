import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../data/loaders';
import type { ParseOutcome } from '../parse/client';
import { emptyQuery } from '../scoring/types';

vi.mock('../parse/client', () => ({ parseText: vi.fn() }));

import { parseText } from '../parse/client';
import { useApp } from './store';

type Resolve = (o: ParseOutcome) => void;

/** Each call to the mocked parser returns a promise the test resolves by hand. */
function deferParser() {
  const pending: Resolve[] = [];
  vi.mocked(parseText).mockImplementation(
    () =>
      new Promise<ParseOutcome>((resolve) => {
        pending.push(resolve);
      }),
  );
  return pending;
}

const outcome = (body: 'moon' | 'mars' | 'either', marker: string): ParseOutcome => ({
  query: { ...emptyQuery(), body, notes: marker },
  mode: 'llm',
  unknown: [],
});

// No numeric targets are used, so scoring never runs and the cells can be empty.
const fakeData = { features: [], targets: [{ id: 'moon-x', body: 'moon', values: {} }], cells: {} } as unknown as AppData;

beforeEach(() => {
  vi.mocked(parseText).mockReset();
  useApp.setState({
    data: fakeData,
    status: 'ready',
    query: { ...emptyQuery(), body: 'moon' },
    queryText: '',
    source: 'none',
    presetId: null,
    parsing: false,
    parserMode: null,
    unknownWords: [],
    results: [],
    showFeatured: true,
  });
});

describe('search race handling', () => {
  it('applies a normal parse result and clears parsing', async () => {
    const pending = deferParser();
    const p = useApp.getState().search('cold dry');
    expect(useApp.getState().parsing).toBe(true);
    pending[0](outcome('moon', 'first'));
    await p;
    expect(useApp.getState().parsing).toBe(false);
    expect(useApp.getState().query.notes).toBe('first');
    expect(useApp.getState().source).toBe('text');
  });

  it('reset during a pending parse clears parsing and the late result is dropped', async () => {
    const pending = deferParser();
    const p = useApp.getState().search('cold dry');
    useApp.getState().reset();
    expect(useApp.getState().parsing).toBe(false);
    pending[0](outcome('moon', 'late'));
    await p;
    expect(useApp.getState().parsing).toBe(false);
    expect(useApp.getState().query.notes).toBe('');
    expect(useApp.getState().source).toBe('none');
    expect(useApp.getState().queryText).toBe('');
  });

  it('a preset applied during a pending parse is not overwritten', async () => {
    const pending = deferParser();
    const p = useApp.getState().search('cold dry');
    useApp.getState().applyPreset('moon-x');
    expect(useApp.getState().parsing).toBe(false);
    pending[0](outcome('moon', 'late'));
    await p;
    expect(useApp.getState().source).toBe('preset');
    expect(useApp.getState().presetId).toBe('moon-x');
    expect(useApp.getState().query.notes).not.toBe('late');
  });

  it('a slider edit during a pending parse is not overwritten', async () => {
    const pending = deferParser();
    const p = useApp.getState().search('cold dry');
    useApp.getState().setTarget('temp_mean_k', 0.3);
    expect(useApp.getState().parsing).toBe(false);
    pending[0](outcome('moon', 'late'));
    await p;
    expect(useApp.getState().source).toBe('manual');
    expect(useApp.getState().query.targets.temp_mean_k).toBe(0.3);
  });

  it('the newest search wins when an older one resolves last', async () => {
    const pending = deferParser();
    const first = useApp.getState().search('first text');
    const second = useApp.getState().search('second text');
    pending[1](outcome('moon', 'second'));
    await second;
    pending[0](outcome('moon', 'first'));
    await first;
    expect(useApp.getState().query.notes).toBe('second');
    expect(useApp.getState().parsing).toBe(false);
  });

  it('keeps the body the user chose while the parse was in flight', async () => {
    const pending = deferParser();
    const p = useApp.getState().search('cold dry');
    useApp.getState().setBody('mars');
    pending[0](outcome('moon', 'parsed'));
    await p;
    expect(useApp.getState().query.body).toBe('mars');
    expect(useApp.getState().query.notes).toBe('parsed');
  });
});