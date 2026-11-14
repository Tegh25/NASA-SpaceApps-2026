import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GLOBAL_LIMITS } from '../lib/sites';
import { useApp } from '../state/store';

export function Method() {
  const data = useApp((s) => s.data);

  return (
    <div className="scroll-thin absolute inset-0 z-10 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-white">
          <ArrowLeft size={15} aria-hidden /> Back to the globe
        </Link>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Method</h1>
        <p className="mb-8 text-[var(--muted)]">
          How Terralog finds Earth places that resemble candidate Moon base sites and Mars landing sites, what the numbers mean, and where they
          come from.
        </p>

        {data?.isMock && (
          <div className="mb-8 rounded-xl border border-[var(--mid)]/40 bg-[var(--mid)]/10 p-4 text-sm">
            <strong className="text-[var(--mid)]">Demo data is loaded.</strong> Every number on this site currently comes from a synthetic
            generator (<code className="font-mono">scripts/mockData.ts</code>) and is not a finding.
          </div>
        )}

        <Section title="How the score works">
          <p>
            Every place is described by the same set of features, whether it is on Earth, the Moon or Mars. Each feature is rescaled to a 0 to 1
            range using fixed limits, so a slope of 12° and a temperature of 70 K can be compared on equal terms. Some features use a log scale
            so that, for example, the difference between 0 and 10 mm of rain counts for more than the difference between 2,000 and 2,010 mm.
          </p>
          <p>
            The score is one minus the weighted average gap between the site and the target, across the features you care about. Importance
            weights run from 0 (ignore) to 3 (high). Features marked "must match" remove any place that is more than 0.15 away on that feature.
          </p>
          <div className="my-4 overflow-x-auto rounded-lg bg-white/5 p-4 font-mono text-sm">
            <div>n(v) = clip((f(v) − f(min)) / (f(max) − f(min)), 0, 1), f = identity or ln(1 + v)</div>
            <div className="mt-2">S = 1 − Σ wᵢ |tᵢ − cᵢ| / Σ wᵢ, reported as 100 × S</div>
          </div>
          <p>
            When a place has no value for a feature, that feature is dropped for that place and its confidence goes down by the share of weight
            that was missing. Places missing more than 25% of the weight are flagged as partial data. Results are thinned so no two are within
            300 km of each other, which stops one large desert filling the whole list.
          </p>
          <p>
            Match badges in the comparison table use the gap on the 0 to 1 scale: Strong under 0.15, Partial from 0.15 to 0.35, Weak above
            0.35.
          </p>
        </Section>

        <Section title="Plain-language search">
          <p>
            Typed descriptions are turned into feature targets and weights. When the language model service is available, a server function
            sends the text and the feature list to Claude Sonnet through Backboard and checks the reply against a strict schema. If that fails or
            takes longer than 6 seconds, a built-in keyword parser takes over. Either way, the chips under the search bar show exactly how your
            text was read, and you can remove or adjust them.
          </p>
        </Section>

        <Section title="Feature definitions">
          {data ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-3">Feature</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Range used</th>
                    <th className="py-2">Definition and sources</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <tr key={f.key} className="border-t border-white/8 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{f.label}</div>
                        <div className="text-xs text-[var(--muted)]">{f.group}</div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{f.unit}</td>
                      <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">
                        {f.norm.min} to {f.norm.max}
                        {f.norm.scale === 'log' ? ' (log)' : ''}
                      </td>
                      <td className="py-2 text-[var(--muted)]">
                        {f.description}
                        {f.sources.length > 0 && <div className="mt-0.5 text-xs">Sources: {f.sources.join(', ')}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[var(--muted)]">Loading feature registry...</p>
          )}
        </Section>

        <Section title="Data sources and provenance">
          {data ? (
            <div className="space-y-3">
              {Object.entries(data.provenance).map(([file, p]) => (
                <div key={file} className="rounded-lg border border-white/8 p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <code className="font-mono text-xs">{file}</code>
                    {p?.mock && <span className="rounded bg-[var(--mid)] px-1.5 text-[10px] font-semibold uppercase text-black">Mock</span>}
                    {p?.generatedAt && <span className="text-xs text-[var(--muted)]">{new Date(p.generatedAt).toLocaleDateString('en-CA')}</span>}
                  </div>
                  {p?.processing && <p className="text-[var(--muted)]">{p.processing}</p>}
                  {p?.datasets && p.datasets.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-[var(--muted)]">
                      {p.datasets.map((d) => (
                        <li key={d.name}>
                          {d.url ? (
                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                              {d.name}
                            </a>
                          ) : (
                            d.name
                          )}
                          {d.version ? `, ${d.version}` : ''}
                          {d.dateRange ? `, ${d.dateRange}` : ''}
                          {d.notes ? `. ${d.notes}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!p && <p className="text-[var(--muted)]">No provenance block supplied.</p>}
                </div>
              ))}
            </div>
          ) : null}
        </Section>

        <Section title="What analogs can and cannot replicate">
          <p>
            Earth analogs are useful for testing equipment, training crews, and studying landforms and processes that also happen on the Moon
            and Mars. No place on Earth is a perfect match. Every analog falls short on:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {GLOBAL_LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p>Each site also lists its own shortfalls. The tour's Target View changes colours and sky to suggest the target; it is not a physical render.</p>
        </Section>

        <Section title="How to cite">
          <p className="rounded-lg bg-white/5 p-3 font-mono text-xs">
            Terralog team (2026). Terralog: Earth analogs for candidate Moon base and Mars exploration sites. NASA Space Apps Challenge 2026,
            Toronto.
          </p>
        </Section>

        <Section title="Team">
          <p>Built in 48 hours for the NASA Space Apps Challenge 2026, "Permanent Moon Base Locations and Mars" challenge, Toronto.</p>
        </Section>

        <Section title="Attributions and licences">
          <ul className="list-disc space-y-1 pl-5 text-[var(--muted)]">
            <li>NASA Planetary Data System, and the LRO LOLA and Diviner teams.</li>
            <li>Mars MOLA, THEMIS and CRISM teams.</li>
            <li>Copernicus ERA5 climate reanalysis and Copernicus DEM GLO-30.</li>
            <li>MODIS vegetation and albedo products.</li>
            <li>Cesium ion, Cesium World Terrain, and Google Photorealistic 3D Tiles. Map data credits are shown on the globe.</li>
            <li>Natural Earth (public domain) for the land mask.</li>
            <li>OpenStreetMap contributors where used.</li>
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Terralog does not use Google Street View imagery. Tours are rendered from Cesium terrain, imagery and 3D Tiles.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      <div className="space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}
