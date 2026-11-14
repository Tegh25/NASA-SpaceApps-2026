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
