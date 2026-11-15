import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GLOBAL_LIMITS } from '../lib/sites';
import { useApp } from '../state/store';

const PIPELINE = [
  {
    title: 'Earth blocks',
    body: 'The Earth side is 12,362 blocks of 20 × 20 km cut from 235 Copernicus GLO-30 tiles. The tiles were shortlisted for cold, dry and rugged ground, so this is not a search of the whole planet.',
  },
  {
    title: 'Score against the Moon',
    body: 'Each block gets 10 scores (terrain, multi-scale roughness, craters, landing slopes, shadow under a low sun, thermal, ice, circling-sun days, surface type, geology) and is compared with the nine Artemis III Moon regions.',
  },
  {
    title: 'Bare-rock gate',
    body: 'Blocks that are not bare rock in ESA WorldCover are dropped before ranking.',
  },
  {
    title: 'Novelty check',
    body: 'A block only counts as new if it is at least 150 km from the 166 catalogued analog sites. "New" here is provisional.',
  },
  {
    title: 'Surface check',
    body: 'The finalists are checked against Landsat 8/9 and Sentinel-2 imagery for bare ground, snow and vegetation.',
  },
];

const DATASETS: { name: string; use: string; side: 'Moon' | 'Earth' | 'Mars' }[] = [
  { name: 'LRO LOLA, LDEM_80S_40M (NASA PDS)', use: 'Slope, roughness, relief, crater-like pits, landing fractions and shadow for the Moon regions', side: 'Moon' },
  { name: 'LRO Diviner Polar Resource Product', use: 'Moon temperature and water-ice stable depth targets', side: 'Moon' },
  { name: 'LRO Mini-RF', use: 'Radar characterisation only. Not scored', side: 'Moon' },
  { name: 'USGS Artemis III region outlines', use: 'The nine Moon regions', side: 'Moon' },
  { name: 'Copernicus DEM GLO-30', use: 'Earth terrain for every block', side: 'Earth' },
  { name: 'MODIS C6.1 MYD11A2, MCD43A4, MYD13Q1, MYD10A2 (via Microsoft Planetary Computer)', use: 'Land surface temperature, albedo, NDVI and snow, 2019 to 2023', side: 'Earth' },
  { name: 'NASA POWER', use: 'Precipitation climatology', side: 'Earth' },
  { name: 'ESA WorldCover', use: 'Bare-rock surface gate', side: 'Earth' },
  { name: 'JAXA ALOS PALSAR-2 (via Planetary Computer)', use: 'Radar characterisation only. Not scored', side: 'Earth' },
  { name: 'Landsat 8/9 and Sentinel-2', use: 'Surface verification of finalists', side: 'Earth' },
  { name: 'USGS HRSC and MOLA blended DEM, 200 m', use: 'Mars terrain', side: 'Mars' },
  { name: 'TES albedo and thermal inertia (Putzig and Mellon, 2007)', use: 'Mars surface properties, from literature values', side: 'Mars' },
];

const RESOURCES: { name: string; status: 'Used' | 'Indirectly' | 'Not used'; note: string }[] = [
  { name: 'NASA Earthdata Search', status: 'Indirectly', note: 'MODIS products read anonymously through Planetary Computer, no login needed.' },
  { name: 'NASA Worldview and GIBS', status: 'Not used', note: 'Image tiles only, and the analysis needs numbers. GIBS is a map imagery fallback in the app.' },
  { name: 'NASA PDS', status: 'Used', note: 'The archive that supplied the LOLA and Diviner products.' },
  { name: 'LRO (LOLA, Mini-RF)', status: 'Used', note: 'LOLA is core. Mini-RF is for characterisation only.' },
  { name: 'LRO Diviner', status: 'Used', note: 'Core temperature and ice targets for the Moon.' },
  { name: 'CSA RCM', status: 'Not used', note: 'Needs an account and is aimed at maritime and disaster use.' },
  { name: 'CSA RADARSAT-1', status: 'Not used', note: 'Not needed for the ranking.' },
  { name: 'CSA SAR Python tutorial', status: 'Not used', note: 'Not needed.' },
  { name: 'ESA Copernicus Data Space', status: 'Used', note: 'Copernicus DEM GLO-30 for all Earth terrain, and Sentinel-2 for verification.' },
  { name: 'ESA Open Science Catalog', status: 'Not used', note: 'The ESA CCI permafrost layer was not used. Ice is a MODIS proxy.' },
  { name: 'JAXA G-Portal', status: 'Indirectly', note: 'PALSAR-2 radar through Planetary Computer, for characterisation only.' },
];

const LIMITS = [
  'No Earth block closes the temperature gap. Finalists sit at about 271 to 278 K annual mean, against 105 to 153 K on the Moon regions.',
  'No Earth block gets circling-sun days, so none matches the lighting gap (0 days).',
  'Earth blocks have far fewer craters: 0.0 to 0.02 per km², against 0.1 to 0.2 on the Moon.',
  '"New" is provisional. It rests on the 150 km distance check and on web searches only. Google Scholar, ADS and CNKI were not searched. Place names are approximate.',
  'Prior art exists for ranking Earth sites against Moon and Mars terrain. Do not call this approach unprecedented.',
  'Terrain alone gives the same validation as the full 10-category composite (AUC 0.82 for both). The ice and crater categories have no validation support (AUC 0.44 and 0.50).',
  'Among the known analogs, only Mauna Kea (98th percentile) and Wright Valley (85th) rank high on terrain. The engine finds terrain look-alikes, not the established analog list.',
  'Mars sites use 200 m terrain and literature values. They are indicative only.',
  'Hot deserts, Antarctica and the far north were outside the search pool.',
];

const STATUS_STYLE: Record<'Used' | 'Indirectly' | 'Not used', string> = {
  Used: 'text-[var(--good)]',
  Indirectly: 'text-[var(--mid)]',
  'Not used': 'text-[var(--faint)]',
};

export function Method() {
  const data = useApp((s) => s.data);

  return (
    <div className="scroll-thin absolute inset-0 z-10 overflow-y-auto bg-[var(--void)]">
      <div className="mx-auto max-w-[70ch] px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-[var(--dim)] hover:text-[var(--ink)]">
          <ArrowLeft size={15} aria-hidden /> Back to the globe
        </Link>

        <header className="mb-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Method</h1>
          <p className="mt-3 leading-relaxed text-[var(--dim)]">
            Terralog finds Earth places that look like candidate Moon base sites and Mars landing sites. This page covers the scoring, the
            pipeline, the data and what the results cannot show.
          </p>
        </header>

        {data?.isMock && (
          <div className="console mb-10 p-4 text-sm" style={{ borderColor: 'var(--mid)' }}>
            <strong className="font-medium text-[var(--mid)]">Demo data is loaded.</strong>{' '}
            <span className="text-[var(--dim)]">Every number currently comes from a synthetic generator and is not a finding.</span>
          </div>
        )}

        <Section title="What Terralog does">
          <p>
            You describe a place in plain language, or move the sliders, and Terralog ranks Earth sites by how closely their measured terrain,
            temperature, ice and lighting match a Moon or Mars target. Each site page shows why it matches and where it falls short.
          </p>
          <p>
            Typed descriptions become feature targets and weights. A language model proposes them when it is available. If it is not, or it is
            too slow, a keyword parser takes over. The chips under the search bar show how the text was read.
          </p>
        </Section>

        <Section title="How the score works">
          <p>
            Every place, on Earth or elsewhere, is described by the same features. Each feature is rescaled to 0 to 1 using fixed limits, some
            on a log scale. A site scores <span className="num">100 × (1 − Σ wᵢ|tᵢ − cᵢ| / Σ wᵢ)</span>, where <span className="num">w</span> is
            the importance weight from 0 (ignore) to 3 (high). Features marked "must match" remove any place more than 0.15 away on that feature.
          </p>
          <p>
            Missing values drop that feature for that place, and its confidence falls by the share of weight it carried. Results are thinned so
            that no two are within 300 km of each other.
          </p>
          <p>
            Match badges use the gap on the 0 to 1 scale: <span className="num">strong</span> under 0.15, <span className="num">partial</span> from
            0.15 to 0.35, <span className="num">weak</span> above 0.35.
          </p>
        </Section>

        <Section title="Pipeline">
          <ol className="space-y-4">
            {PIPELINE.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.25rem_1fr] gap-3">
                <span className="num grid h-8 w-8 place-items-center rounded-full border border-[var(--accent)] text-sm text-[var(--accent)]">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display font-medium text-[var(--ink)]">{step.title}</h3>
                  <p className="mt-1 text-[var(--dim)]">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Datasets">
          <div className="console overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-[var(--rule)] text-[var(--dim)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Dataset</th>
                  <th className="px-3 py-2 font-medium">Used for</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                </tr>
              </thead>
              <tbody>
                {DATASETS.map((d) => (
                  <tr key={d.name} className="border-b border-[var(--rule)] align-top last:border-0">
                    <td className="px-3 py-2">{d.name}</td>
                    <td className="px-3 py-2 text-[var(--dim)]">{d.use}</td>
                    <td className="num px-3 py-2 text-xs text-[var(--dim)]">{d.side}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Challenge resources">
          <p>Which of the 11 NASA Space Apps resources the analysis used, and how.</p>
          <div className="console overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-[var(--rule)] text-[var(--dim)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Resource</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((r) => (
                  <tr key={r.name} className="border-b border-[var(--rule)] align-top last:border-0">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</td>
                    <td className="px-3 py-2 text-[var(--dim)]">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {data && Object.keys(data.provenance).length > 0 && (
          <Section title="Data files">
            <ul className="console divide-y divide-[var(--rule)] text-sm">
              {Object.entries(data.provenance).map(([file, p]) => (
                <li key={file} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="num text-xs text-[var(--ink)]">{file}</code>
                    {p?.mock && <span className="num rounded-sm bg-[var(--mid)] px-1.5 text-[10px] font-semibold text-black">MOCK</span>}
                    {p?.generatedAt && (
                      <span className="num text-xs text-[var(--faint)]">{new Date(p.generatedAt).toLocaleDateString('en-CA')}</span>
                    )}
                  </div>
                  {p?.processing && <p className="mt-1 text-[var(--dim)]">{p.processing}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Limitations">
          <ul className="space-y-2">
            {LIMITS.map((l) => (
              <li key={l} className="relative pl-4 text-[var(--dim)] before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2 before:bg-[var(--accent)]">
                {l}
              </li>
            ))}
          </ul>
          <p>Every analog also falls short on the following, which apply to all sites:</p>
          <ul className="space-y-1.5 text-sm text-[var(--dim)]">
            {GLOBAL_LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="text-sm text-[var(--dim)]">
            Tour and Target View colours and sky suggest the target. They are a simulated look, not a physical render.
          </p>
        </Section>

        <Section title="How to cite">
          <p className="console num p-3 text-xs leading-relaxed text-[var(--dim)]">
            Terralog team (2026). Terralog: Earth analogs for candidate Moon base and Mars exploration sites. NASA Space Apps Challenge 2026,
            Toronto.
          </p>
        </Section>

        <Section title="Credits">
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--dim)]">
            <li>NASA: LRO LOLA, Diviner and Mini-RF, the Planetary Data System, MODIS, POWER, Landsat, and GIBS imagery.</li>
            <li>ESA and Copernicus: GLO-30 DEM, Sentinel-2 and WorldCover.</li>
            <li>JAXA: ALOS PALSAR-2.</li>
            <li>USGS: Artemis III region outlines and the HRSC and MOLA blended DEM. TES data from Mars Global Surveyor.</li>
            <li>Cesium ion and Cesium World Terrain. Google Photorealistic 3D Tiles appear when a token is present.</li>
            <li>Natural Earth (public domain) for the land mask, and OpenStreetMap contributors where used.</li>
          </ul>
          <p className="text-xs text-[var(--faint)]">Terralog does not use Google Street View imagery. Tours use Cesium terrain, imagery and 3D Tiles.</p>
          <p className="text-xs text-[var(--faint)]">Built in 48 hours for the NASA Space Apps Challenge 2026, Toronto.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12 space-y-4 leading-relaxed text-[var(--ink)]">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
