import { ArrowLeft, Search, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatLatLon } from '../lib/geo';
import { useApp } from '../state/store';
import { SectionTitle } from '../ui/common';
import { TargetScene } from './TargetScene';

export default function TargetPage() {
  const { id } = useParams();
  const data = useApp((s) => s.data);
  const navigate = useNavigate();
  const target = data?.targets.find((t) => t.id === id);
  const polar = target ? Math.abs(target.lat) > 75 : false;
  const [sunAz, setSunAz] = useState(120);
  const [sunEl, setSunEl] = useState(polar ? 1.5 : 20);
  const [ex, setEx] = useState(1.5);
  const [ground, setGround] = useState(false);

  useEffect(() => {
    if (target) setSunEl(Math.abs(target.lat) > 75 ? 1.5 : 20);
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="grid h-full place-items-center text-sm text-[var(--muted)]">Loading...</div>;
  if (!target)
    return (
      <div className="grid h-full place-items-center">
        <div className="panel p-5">
          <p className="mb-2">Unknown target.</p>
          <Link to="/" className="underline">
            Back to the globe
          </Link>
        </div>
      </div>
    );

  const findAnalogs = () => {
    useApp.getState().applyPreset(target.id);
    useApp.getState().setBody(target.body);
    navigate('/');
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col md:flex-row">
      <aside className="panel scroll-thin z-10 m-2 flex max-h-[45vh] flex-col overflow-y-auto md:m-4 md:max-h-none md:w-[340px]">
        <div className="border-b border-white/10 p-4">
          <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-white">
            <ArrowLeft size={15} aria-hidden /> Globe
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: `var(--${target.body})` }}>
            {target.body === 'moon' ? 'Moon' : 'Mars'} target
          </p>
          <h1 className="text-xl font-semibold leading-tight">{target.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">{formatLatLon(target.lat, target.lon)}</p>
        </div>
        <div className="space-y-5 p-4">
          <section>
            <SectionTitle>Why it matters</SectionTitle>
            <p className="text-sm leading-relaxed">{target.whyItMatters || target.summary}</p>
          </section>
          <section className="space-y-3">
            <SectionTitle>Sun and view</SectionTitle>
            <Slider label="Sun azimuth" value={sunAz} min={0} max={360} step={1} unit="°" onChange={setSunAz} />
            <Slider label="Sun elevation" value={sunEl} min={0} max={30} step={0.5} unit="°" onChange={setSunEl} />
            <Slider label="Vertical exaggeration" value={ex} min={1} max={3} step={0.1} unit="x" onChange={setEx} />
            <button
              type="button"
              aria-pressed={ground}
              onClick={() => setGround(!ground)}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                ground ? 'border-white/30 bg-white/15' : 'border-white/15 hover:bg-white/10'
              }`}
            >
              <User size={15} aria-hidden /> {ground ? 'Back to orbit view' : 'Ground view (2 m)'}
            </button>
            {ground && <p className="text-xs text-[var(--muted)]">Drag to look around.</p>}
          </section>
          <section>
            <SectionTitle>Datasets</SectionTitle>
            <ul className="list-disc pl-5 text-sm text-[var(--muted)]">
              {target.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
          <button
            type="button"
            onClick={findAnalogs}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--good)] px-4 py-2.5 text-sm font-semibold text-[#06231b] hover:brightness-110"
          >
            <Search size={16} aria-hidden /> Find Earth analogs
          </button>
        </div>
      </aside>
      <main className="relative min-h-0 flex-1">
        <TargetScene target={target} sunAz={sunAz} sunEl={sunEl} exaggeration={ex} groundView={ground} />
      </main>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const id = `s-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <label htmlFor={id}>{label}</label>
        <span className="font-mono text-xs text-[var(--muted)] tabular">
          {value}
          {unit}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}
