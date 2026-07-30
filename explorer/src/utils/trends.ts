import type { Company, DataBundle } from '../types';

/**
 * Longitudinal trend computation over YC batches.
 *
 * Everything here is derived from the live bundle at render time — no
 * hardcoded batch names, categories, or takeaways — so the Trends view
 * updates automatically as new company data is ingested. Batches below
 * FULL_BATCH_MIN companies are reported as "partial" and excluded from
 * shares/insights until enough of the batch has been scraped.
 */

export const FULL_BATCH_MIN = 30;

const SEASON_ORDER: Record<string, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };
const SEASON_SHORT: Record<string, string> = { Winter: 'W', Spring: 'Sp', Summer: 'Su', Fall: 'F' };

export interface BatchInfo {
  label: string;
  short: string;
  n: number;
  order: number;
  full: boolean;
}

export interface TrendSeries {
  key: string;
  label: string;
  total: number;
  /** Per full batch, aligned with TrendData.batches. */
  counts: number[];
  shares: number[];
  slugsPerBatch: string[][];
  isOther?: boolean;
}

export type TrendDimension = 'bm' | 'sector' | 'family' | 'vertical';

export interface Insight {
  dimension: TrendDimension;
  key: string;
  label: string;
  kind: 'shift' | 'emerging' | 'concentration';
  direction: 'up' | 'down';
  earlyShare: number;
  lateShare: number;
  deltaPts: number;
  z: number;
  /** Per-full-batch share for the sparkline. */
  spark: number[];
  earlyWindow: string;
  lateWindow: string;
  title: string;
  detail: string;
  slugs: string[];
}

export interface TrendData {
  batches: BatchInfo[];
  partialBatches: BatchInfo[];
  bm: TrendSeries[];
  sector: TrendSeries[];
  family: TrendSeries[];
  risingVerticals: TrendSeries[];
  insights: Insight[];
  topVerticalShare: number[];
  totalCompanies: number;
  /** Companies outside the study cohort (stray historical batches), excluded from all trends. */
  offCohortCount: number;
}

/**
 * The canonical set of batches the corpus aims to cover exhaustively, from
 * bundle metadata. Companies outside it (e.g. old-batch strays picked up by
 * the launch/directory sync) are biased subsamples of their batches and must
 * never join the trend axis, no matter how many accumulate.
 */
export function cohortBatchSet(bundle: DataBundle): Set<string> | null {
  const list = bundle.meta.cohort_batches;
  return list && list.length ? new Set(list) : null;
}

export function batchSortKey(label: string): number {
  const [season, yearStr] = label.split(' ');
  const year = Number(yearStr);
  const s = SEASON_ORDER[season];
  if (!Number.isFinite(year) || s === undefined) return Number.MAX_SAFE_INTEGER;
  return year * 10 + s;
}

export function batchShortLabel(label: string): string {
  const [season, yearStr] = label.split(' ');
  const short = SEASON_SHORT[season];
  if (!short || !yearStr) return label;
  return `${short}${yearStr.slice(2)}`;
}

const FAMILY_TOKENS: Record<string, string> = { ai: 'AI', saas: 'SaaS', rd: 'R&D', gtm: 'GTM' };

export function humanizeFamily(id: string): string {
  const label = id
    .split('_')
    .map((w) => FAMILY_TOKENS[w] ?? w)
    .join(' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  if (!n1 || !n2) return 0;
  const p = (x1 + x2) / (n1 + n2);
  if (p <= 0 || p >= 1) return 0;
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (x2 / n2 - x1 / n1) / se;
}

interface CategorySpec {
  key: (c: Company) => string | null;
  label: (key: string) => string;
}

/** Per-batch counts/shares/slugs for one way of categorizing companies. */
function buildSeries(
  byBatch: Company[][],
  spec: CategorySpec,
  { maxSeries, minTotal = 1 }: { maxSeries?: number; minTotal?: number } = {}
): TrendSeries[] {
  const totals = new Map<string, number>();
  for (const cohort of byBatch) {
    for (const c of cohort) {
      const k = spec.key(c);
      if (k) totals.set(k, (totals.get(k) ?? 0) + 1);
    }
  }
  let keys = [...totals.entries()]
    .filter(([, total]) => total >= minTotal)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  let otherKeys: string[] = [];
  if (maxSeries && keys.length > maxSeries) {
    otherKeys = keys.slice(maxSeries - 1);
    keys = keys.slice(0, maxSeries - 1);
  }

  const make = (key: string, label: string, member: (c: Company) => boolean): TrendSeries => {
    const counts = byBatch.map((cohort) => cohort.filter(member).length);
    const slugsPerBatch = byBatch.map((cohort) => cohort.filter(member).map((c) => c.slug));
    const shares = byBatch.map((cohort, i) => (cohort.length ? counts[i] / cohort.length : 0));
    return {
      key,
      label,
      counts,
      shares,
      slugsPerBatch,
      total: counts.reduce((a, b) => a + b, 0),
    };
  };

  const series = keys.map((k) => make(k, spec.label(k), (c) => spec.key(c) === k));
  if (otherKeys.length) {
    const otherSet = new Set(otherKeys);
    const other = make('__other', 'Other', (c) => {
      const k = spec.key(c);
      return k !== null && otherSet.has(k);
    });
    other.isOther = true;
    series.push(other);
  }
  return series;
}

function windowStats(series: TrendSeries, batchNs: number[], idx: number[]) {
  const x = idx.reduce((a, i) => a + series.counts[i], 0);
  const n = idx.reduce((a, i) => a + batchNs[i], 0);
  return { x, n, share: n ? x / n : 0 };
}

function windowLabel(batches: BatchInfo[], idx: number[]): string {
  if (!idx.length) return '';
  const first = batches[idx[0]].short;
  const last = batches[idx[idx.length - 1]].short;
  return first === last ? first : `${first}–${last}`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function shiftInsights(
  dimension: TrendDimension,
  dimensionNoun: string,
  series: TrendSeries[],
  batches: BatchInfo[],
  earlyIdx: number[],
  lateIdx: number[]
): Insight[] {
  const batchNs = batches.map((b) => b.n);
  const out: Insight[] = [];
  for (const s of series) {
    if (s.isOther) continue;
    const early = windowStats(s, batchNs, earlyIdx);
    const late = windowStats(s, batchNs, lateIdx);
    const deltaPts = (late.share - early.share) * 100;
    const z = twoProportionZ(early.x, early.n, late.x, late.n);
    if (Math.abs(deltaPts) < 3 || Math.abs(z) < 1.6) continue;
    const direction = deltaPts > 0 ? 'up' : 'down';
    out.push({
      dimension,
      key: s.key,
      label: s.label,
      kind: 'shift',
      direction,
      earlyShare: early.share,
      lateShare: late.share,
      deltaPts,
      z,
      spark: s.shares,
      earlyWindow: windowLabel(batches, earlyIdx),
      lateWindow: windowLabel(batches, lateIdx),
      title: direction === 'up' ? `${s.label} is gaining ground` : `${s.label} is losing ground`,
      detail: `${pct(early.share)} of companies in ${windowLabel(batches, earlyIdx)} → ${pct(
        late.share
      )} in ${windowLabel(batches, lateIdx)} (${dimensionNoun})`,
      slugs: s.slugsPerBatch.flat(),
    });
  }
  return out;
}

/** Batches that are fully scraped, judged on the unfiltered corpus (cohort batches only). */
export function fullBatchLabels(companies: Company[], bundle: DataBundle): Set<string> {
  const cohort = cohortBatchSet(bundle);
  const counts = new Map<string, number>();
  for (const c of companies) {
    if (!c.batch || (cohort && !cohort.has(c.batch))) continue;
    counts.set(c.batch, (counts.get(c.batch) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n >= FULL_BATCH_MIN).map(([b]) => b));
}

/**
 * `fullLabels` — the set of fully-scraped batches, computed from the
 * unfiltered corpus. Passing it keeps the time axis stable when `companies`
 * is a filtered subset: partial-batch exclusion guards against incomplete
 * scraping, not against small filtered slices.
 */
export function computeTrends(
  companies: Company[],
  bundle: DataBundle,
  fullLabels?: Set<string>
): TrendData {
  const cohort = cohortBatchSet(bundle);
  const inCohort = cohort ? companies.filter((c) => cohort.has(c.batch)) : companies;
  const offCohortCount = companies.length - inCohort.length;
  companies = inCohort;

  const bmLabel = new Map(bundle.facets.businessModels.map((m) => [m.id, m.label]));
  const sectorLabel = new Map<string, string>();
  for (const v of bundle.facets.verticals) sectorLabel.set(v.sector_id, v.sector_label);

  const byBatchMap = new Map<string, Company[]>();
  for (const c of companies) {
    if (!c.batch) continue;
    if (!byBatchMap.has(c.batch)) byBatchMap.set(c.batch, []);
    byBatchMap.get(c.batch)!.push(c);
  }

  const allLabels = new Set([...byBatchMap.keys(), ...(fullLabels ?? [])]);
  const all: BatchInfo[] = [...allLabels]
    .map((label) => {
      const cohort = byBatchMap.get(label) ?? [];
      return {
        label,
        short: batchShortLabel(label),
        n: cohort.length,
        order: batchSortKey(label),
        full: fullLabels ? fullLabels.has(label) : cohort.length >= FULL_BATCH_MIN,
      };
    })
    .sort((a, b) => a.order - b.order);

  const batches = all.filter((b) => b.full);
  const partialBatches = all.filter((b) => !b.full && b.n > 0);
  const byBatch = batches.map((b) => byBatchMap.get(b.label) ?? []);
  const batchNs = batches.map((b) => b.n);
  const totalCompanies = companies.length;

  const bm = buildSeries(
    byBatch,
    {
      key: (c) => c.primary_bm ?? c.business_models[0] ?? null,
      label: (k) => bmLabel.get(k) ?? k,
    },
    { maxSeries: 8 }
  );

  const sector = buildSeries(
    byBatch,
    {
      key: (c) => c.vertical_sector_id || null,
      label: (k) => sectorLabel.get(k) ?? k,
    },
    { maxSeries: 8 }
  );

  const family = buildSeries(
    byBatch,
    {
      key: (c) => c.phenotype_family || null,
      label: humanizeFamily,
    },
    { maxSeries: 8 }
  );

  const verticalLabels = new Map(companies.map((c) => [c.vertical_id, c.vertical_label]));
  const verticals = buildSeries(
    byBatch,
    {
      key: (c) => c.vertical_id || null,
      label: (k) => verticalLabels.get(k) ?? k,
    },
    { minTotal: 5 }
  );

  // Insight windows: first k vs last k full batches.
  const k = batches.length >= 4 ? 2 : 1;
  const earlyIdx = batches.map((_, i) => i).slice(0, k);
  const lateIdx = batches.map((_, i) => i).slice(-k);
  const enoughHistory = batches.length >= 2;

  let insights: Insight[] = [];
  if (enoughHistory) {
    insights = [
      ...shiftInsights('bm', 'business model', bm, batches, earlyIdx, lateIdx),
      ...shiftInsights('sector', 'sector', sector, batches, earlyIdx, lateIdx),
      ...shiftInsights('family', 'phenotype family', family, batches, earlyIdx, lateIdx),
    ];
  }

  // Emerging verticals: enough companies overall, concentrated in the late window.
  if (enoughHistory) {
    for (const v of verticals) {
      const lateCount = lateIdx.reduce((a, i) => a + v.counts[i], 0);
      if (v.total >= 5 && lateCount / v.total >= 0.6) {
        const late = windowStats(v, batchNs, lateIdx);
        const early = windowStats(v, batchNs, earlyIdx);
        insights.push({
          dimension: 'vertical',
          key: v.key,
          label: v.label,
          kind: 'emerging',
          direction: 'up',
          earlyShare: early.share,
          lateShare: late.share,
          deltaPts: (late.share - early.share) * 100,
          z: twoProportionZ(early.x, early.n, late.x, late.n),
          spark: v.shares,
          earlyWindow: windowLabel(batches, earlyIdx),
          lateWindow: windowLabel(batches, lateIdx),
          title: `Emerging vertical: ${v.label}`,
          detail: `${lateCount} of its ${v.total} companies arrived in ${windowLabel(
            batches,
            lateIdx
          )}`,
          slugs: v.slugsPerBatch.flat(),
        });
      }
    }
  }

  // Concentration: share of each batch absorbed by its top 5 verticals.
  const topVerticalShare = byBatch.map((cohort) => {
    const counts = new Map<string, number>();
    for (const c of cohort) counts.set(c.vertical_id, (counts.get(c.vertical_id) ?? 0) + 1);
    const top = [...counts.values()].sort((a, b) => b - a).slice(0, 5);
    return cohort.length ? top.reduce((a, b) => a + b, 0) / cohort.length : 0;
  });
  if (enoughHistory) {
    const early = earlyIdx.reduce((a, i) => a + topVerticalShare[i], 0) / earlyIdx.length;
    const late = lateIdx.reduce((a, i) => a + topVerticalShare[i], 0) / lateIdx.length;
    const deltaPts = (late - early) * 100;
    if (Math.abs(deltaPts) >= 3) {
      insights.push({
        dimension: 'vertical',
        key: '__concentration',
        label: 'Concentration',
        kind: 'concentration',
        direction: deltaPts > 0 ? 'up' : 'down',
        earlyShare: early,
        lateShare: late,
        deltaPts,
        z: 0,
        spark: topVerticalShare,
        earlyWindow: windowLabel(batches, earlyIdx),
        lateWindow: windowLabel(batches, lateIdx),
        title: deltaPts > 0 ? 'YC bets are concentrating' : 'YC bets are diversifying',
        detail: `Top 5 verticals absorb ${pct(late)} of the latest batches vs ${pct(
          early
        )} in ${windowLabel(batches, earlyIdx)}`,
        slugs: [],
      });
    }
  }

  // Rank: biggest absolute shifts first, cap per dimension so one axis
  // doesn't crowd out the rest, cap overall at 8.
  const ranked = insights.sort((a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts));
  const perDim = new Map<TrendDimension, number>();
  const picked: Insight[] = [];
  for (const ins of ranked) {
    const used = perDim.get(ins.dimension) ?? 0;
    if (used >= 3) continue;
    perDim.set(ins.dimension, used + 1);
    picked.push(ins);
    if (picked.length >= 8) break;
  }

  // Rising verticals for the line chart: biggest early→late share gains.
  const risingVerticals = enoughHistory
    ? verticals
        .filter((v) => !v.isOther && v.total >= 5)
        .map((v) => {
          const early = windowStats(v, batchNs, earlyIdx);
          const late = windowStats(v, batchNs, lateIdx);
          return { v, gain: late.share - early.share };
        })
        .filter((r) => r.gain > 0)
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 4)
        .map((r) => r.v)
    : [];

  return {
    batches,
    partialBatches,
    bm,
    sector,
    family,
    risingVerticals,
    insights: picked,
    topVerticalShare,
    totalCompanies,
    offCohortCount,
  };
}
