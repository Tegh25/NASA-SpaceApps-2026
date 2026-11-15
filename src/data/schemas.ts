import { z } from 'zod';

export const ProvenanceSchema = z
  .object({
    mock: z.boolean().optional(),
    datasets: z
      .array(
        z.object({
          name: z.string(),
          version: z.string().optional(),
          dateRange: z.string().optional(),
          url: z.string().optional(),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    processing: z.string().optional(),
    generatedAt: z.string().optional(),
  })
  .passthrough();

export const BodySchema = z.enum(['moon', 'mars']);

export const FeatureDefSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  unit: z.string(),
  group: z.string(),
  description: z.string().default(''),
  norm: z.object({
    min: z.number(),
    max: z.number(),
    scale: z.enum(['linear', 'log']),
  }),
  higherIs: z.string().optional(),
  sources: z.array(z.string()).default([]),
});

export const FeaturesFileSchema = z.object({
  version: z.number(),
  features: z.array(FeatureDefSchema).min(1),
  provenance: ProvenanceSchema.optional(),
});

const ValuesSchema = z.record(z.string(), z.number().nullable());

export const TargetSchema = z.object({
  id: z.string(),
  body: BodySchema,
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  summary: z.string().default(''),
  whyItMatters: z.string().default(''),
  values: ValuesSchema,
  heightmap: z.string().optional(),
  imagery: z.string().optional(),
  sources: z.array(z.string()).default([]),
  /** Short code from the discovery tables, e.g. "SP" for Slater Plain. */
  code: z.string().optional(),
  /** computed = from orbital data by our pipeline; literature = cited values. */
  valueSource: z.enum(['computed', 'literature']).optional(),
});

export const TargetsFileSchema = z.object({
  targets: z.array(TargetSchema),
  provenance: ProvenanceSchema.optional(),
});

export const EarthCellsFileSchema = z
  .object({
    cellSizeDeg: z.number(),
    count: z.number().int().nonnegative(),
    lat: z.array(z.number()),
    lon: z.array(z.number()),
    values: z.record(z.string(), z.array(z.number().nullable())),
    region: z.array(z.string()).optional(),
    provenance: ProvenanceSchema.optional(),
  })
  .superRefine((f, ctx) => {
    const n = f.count;
    if (f.lat.length !== n) ctx.addIssue({ code: 'custom', path: ['lat'], message: `length ${f.lat.length} != count ${n}` });
    if (f.lon.length !== n) ctx.addIssue({ code: 'custom', path: ['lon'], message: `length ${f.lon.length} != count ${n}` });
    if (f.region && f.region.length !== n)
      ctx.addIssue({ code: 'custom', path: ['region'], message: `length ${f.region.length} != count ${n}` });
    for (const [k, arr] of Object.entries(f.values)) {
      if (arr.length !== n) ctx.addIssue({ code: 'custom', path: ['values', k], message: `length ${arr.length} != count ${n}` });
    }
  });

export const FeaturedSiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string().default(''),
  lat: z.number(),
  lon: z.number(),
  analogFor: z.array(z.string()).default([]),
  score: z.record(z.string(), z.number()).optional(),
  headline: z.string().default(''),
  description: z.string().default(''),
  matches: z.array(z.string()).default([]),
  shortfalls: z.array(z.string()).default([]),
  values: ValuesSchema.default({}),
  tour: z
    .object({
      spawn: z.object({
        lat: z.number(),
        lon: z.number(),
        heading: z.number().default(0),
        heightM: z.number().default(1.7),
      }),
      waypoints: z
        .array(z.object({ name: z.string(), lat: z.number(), lon: z.number(), note: z.string().default('') }))
        .default([]),
    })
    .optional(),
  references: z.array(z.object({ title: z.string(), url: z.string() })).default([]),

  // ---- Redesign extensions (all optional; see data/README.md) ----
  /** Which body this card is listed under on the home page. Falls back to the body of analogFor[0]. */
  body: BodySchema.optional(),
  /** new = engine-found candidate, known = established analog, reserve = behind "More candidates". */
  kind: z.enum(['new', 'known', 'reserve']).optional(),
  /** Free-text status, e.g. "Confirmed", "Conditional: glacier in one corner". */
  status: z.string().optional(),
  /** Display order on the home page (lower first). */
  rank: z.number().optional(),
  /** Curated "why it matches" text, 3 to 4 sentences, from real numbers. */
  why: z.string().optional(),
  /** Hero images, paths relative to the site root (e.g. "/img/twin_D1.webp"). */
  images: z
    .object({
      earth: z.string().optional(),
      target: z.string().optional(),
      twin: z.string().optional(),
      eo: z.string().optional(),
    })
    .optional(),
  /** Numeric gaps stated plainly, e.g. temperature and lighting. */
  gaps: z
    .array(
      z.object({
        label: z.string(),
        earth: z.number().nullable(),
        target: z.number().nullable(),
        unit: z.string().default(''),
        note: z.string().default(''),
      }),
    )
    .default([]),
  /** Honesty caveats (approximate names, vegetation share, etc.). */
  caveats: z.array(z.string()).default([]),
  /** Provenance of the values: computed from EO data, or literature values. */
  valueSource: z.enum(['computed', 'literature']).optional(),
  /** Free-form extra numbers (composite, stability, nearest known km, surface check). */
  stats: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
});

export const FeaturedFileSchema = z.object({
  featured: z.array(FeaturedSiteSchema),
  provenance: ProvenanceSchema.optional(),
});

export const HeightmapSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  metersPerPixel: z.number().positive(),
  minElevation: z.number(),
  maxElevation: z.number(),
  encoding: z.literal('int16-base64'),
  data: z.string(),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Body = z.infer<typeof BodySchema>;
export type FeatureDef = z.infer<typeof FeatureDefSchema>;
export type FeaturesFile = z.infer<typeof FeaturesFileSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type TargetsFile = z.infer<typeof TargetsFileSchema>;
export type EarthCellsFile = z.infer<typeof EarthCellsFileSchema>;
export type FeaturedSite = z.infer<typeof FeaturedSiteSchema>;
export type FeaturedFile = z.infer<typeof FeaturedFileSchema>;
export type Heightmap = z.infer<typeof HeightmapSchema>;

export function formatZodError(file: string, err: z.ZodError): string {
  const lines = err.issues.slice(0, 8).map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)';
    return `  ${file} -> ${path}: ${i.message}`;
  });
  const more = err.issues.length > 8 ? `\n  ...and ${err.issues.length - 8} more issues` : '';
  return `Data contract error in ${file}:\n${lines.join('\n')}${more}`;
}
