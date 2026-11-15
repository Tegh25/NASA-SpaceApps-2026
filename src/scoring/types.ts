export type FeatureKey = string;
export type Weight = 0 | 1 | 2 | 3;
export type BodyChoice = 'moon' | 'mars' | 'either';

export interface ParsedQuery {
  body: BodyChoice;
  targets: Partial<Record<FeatureKey, number>>;
  weights: Partial<Record<FeatureKey, Weight>>;
  required: FeatureKey[];
  notes: string;
  tags?: string[];
  /**
   * Share (0..1) of the features that the target actually has a value for. Set by target-first
   * queries when some features are unknown (for example Mars temperature), so confidence can say so.
   * Absent means every feature was used.
   */
  coverage?: number;
}

export const emptyQuery = (): ParsedQuery => ({
  body: 'either',
  targets: {},
  weights: {},
  required: [],
  notes: '',
  tags: [],
});

/** Columnar, normalized Earth cells. Missing values are NaN. */
export interface NormCells {
  count: number;
  cellSizeDeg: number;
  lat: Float32Array;
  lon: Float32Array;
  norm: Record<FeatureKey, Float32Array>;
  raw: Record<FeatureKey, Float32Array>;
  region?: string[];
}

export interface ScoredCell {
  index: number;
  score: number;
  confidence: number;
  partial: boolean;
  strongMean: number;
}

export type MatchLevel = 'strong' | 'partial' | 'weak';

export interface BreakdownRow {
  key: FeatureKey;
  weight: Weight;
  site: number | null;
  target: number | null;
  diff: number | null;
  level: MatchLevel | null;
}
