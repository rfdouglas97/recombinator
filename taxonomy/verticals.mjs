import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  SECTORS,
  INDUSTRIES,
  VERTICALS,
  YC_SUBINDUSTRY_DEFAULTS,
  PREDICTION_MARKET_SLUG_VERTICAL,
  SLUG_VERTICAL_OVERRIDES,
} from './verticals-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(dirname(fileURLToPath(import.meta.url)), 'verticals.json');
const EXPANSION_PATH = join(ROOT, 'output', 'verticals', 'expansion-approved.json');

function loadExpansionVerticals() {
  if (!existsSync(EXPANSION_PATH)) return [];
  const data = JSON.parse(readFileSync(EXPANSION_PATH, 'utf8'));
  return data.verticals ?? [];
}

export function getAllVerticalLeaves() {
  return [...VERTICALS, ...loadExpansionVerticals()];
}

export function loadVerticalOntology() {
  if (existsSync(JSON_PATH)) {
    return JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  }
  return buildOntologyDocument();
}

export function buildOntologyDocument() {
  const sectorById = Object.fromEntries(SECTORS.map((s) => [s.id, s]));
  const industryById = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));

  const verticals = getAllVerticalLeaves().map((v) => {
    const industry = industryById[v.industry_id];
    const sector = industry ? sectorById[industry.sector_id] : null;
    return {
      ...v,
      sector_id: sector?.id ?? null,
      sector_label: sector?.label ?? null,
      industry_label: industry?.label ?? null,
    };
  });

  return {
    version: '0.1',
    description:
      'Canonical industry vertical ontology for BM × vertical gap analysis. Hierarchy: sector → industry → workflow leaf.',
    generated_from: 'taxonomy/verticals-data.mjs',
    counts: {
      sectors: SECTORS.length,
      industries: INDUSTRIES.length,
      verticals: verticals.length,
      seed_verticals: VERTICALS.length,
      expanded_verticals: loadExpansionVerticals().length,
      yc_subindustry_defaults: Object.keys(YC_SUBINDUSTRY_DEFAULTS).length,
    },
    sectors: SECTORS,
    industries: INDUSTRIES,
    verticals,
    yc_subindustry_defaults: YC_SUBINDUSTRY_DEFAULTS,
  };
}

export function emitVerticalsJson(outPath = JSON_PATH) {
  const doc = buildOntologyDocument();
  writeFileSync(outPath, JSON.stringify(doc, null, 2));
  return doc;
}

function normalizeText(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\s/>&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Avoid matching generic labels (e.g. "operations") inside unrelated aliases (e.g. "…workflows"). */
function aliasContainsLabelAsWords(alias, label) {
  if (!label || label.length < 4) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(alias);
}

function tokenSet(s) {
  return new Set(normalizeText(s).split(' ').filter((t) => t.length > 2));
}

function jaccard(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function buildLookup(ontology) {
  const byId = new Map();
  const byAlias = new Map();

  for (const v of ontology.verticals) {
    byId.set(v.id, v);
    byAlias.set(normalizeText(v.label), v.id);
    byAlias.set(normalizeText(v.id.replace(/\./g, ' ')), v.id);
    for (const alias of v.aliases ?? []) {
      byAlias.set(normalizeText(alias), v.id);
    }
  }

  return { byId, byAlias };
}

function ycPairFromIndustries(industries = []) {
  if (!industries?.length) return null;
  if (industries.length === 1) return industries[0];
  return `${industries[0]} > ${industries[1]}`;
}

const PM_TEXT_RE =
  /prediction market|event contract|polymarket|kalshi|prediction finance|event-contract|event contract/i;

const PC_INSURANCE_TEXT_RE =
  /property.{0,12}(casualty|insurance)|p\/c insurance|public adjuster|contents inventory|property insurance claim|restoration contents/i;

/**
 * Authoritative slug → vertical overrides (batch corrections + prediction markets).
 */
export function resolveSlugVerticalOverride(slug) {
  if (!slug) return null;
  const vertical_id = SLUG_VERTICAL_OVERRIDES[slug] ?? PREDICTION_MARKET_SLUG_VERTICAL[slug];
  if (!vertical_id) return null;
  const method = PREDICTION_MARKET_SLUG_VERTICAL[slug] ? 'prediction_markets_slug' : 'slug_override';
  return { vertical_id, confidence: 0.98, method };
}

export function inferPropertyCasualtyInsuranceVertical(input) {
  const primaryText = [input?.industry_sub_vertical, input?.one_liner].filter(Boolean).join(' ');
  const text = [primaryText, input?.description_combined].filter(Boolean).join(' ');
  const norm = normalizeText(text);
  if (!PC_INSURANCE_TEXT_RE.test(norm)) return null;
  return {
    vertical_id: 'fintech.insurance.claims-property',
    confidence: 0.9,
    method: 'property_casualty_insurance_infer',
  };
}

/**
 * Route prediction-market companies to fintech.prediction-markets.* before generic trading/devtools.
 * @returns {{ vertical_id: string, confidence: number, method: string } | null}
 */
export function predictionMarketsSlugVertical(slug) {
  if (!slug) return null;
  const vertical_id = PREDICTION_MARKET_SLUG_VERTICAL[slug];
  if (!vertical_id) return null;
  return { vertical_id, confidence: 0.98, method: 'prediction_markets_slug' };
}

export function inferPredictionMarketsVertical(input) {
  const slugHit = predictionMarketsSlugVertical(input?.slug);
  if (slugHit) return slugHit;

  const primaryText = [input?.industry_sub_vertical, input?.one_liner].filter(Boolean).join(' ');
  const primaryNorm = normalizeText(primaryText);
  if (!PM_TEXT_RE.test(primaryNorm)) return null;

  const text = [primaryText, input?.description_combined].filter(Boolean).join(' ');
  const norm = normalizeText(text);

  if (
    /prime brokerage|unified (api|trading|platform)|best execution|order management|low-latency execution|multi-venue.*prediction|prediction.*multi-venue/.test(
      norm,
    )
  ) {
    return { vertical_id: 'fintech.prediction-markets.execution', confidence: 0.9, method: 'prediction_markets_infer' };
  }
  if (
    /derivative layer|defi derivative|protocol layer|attention.*trad|exchange to trade|cultural attention|alternative asset trading/.test(
      norm,
    )
  ) {
    return {
      vertical_id: 'fintech.prediction-markets.derivatives-protocol',
      confidence: 0.88,
      method: 'prediction_markets_infer',
    };
  }
  if (/belief|kassandre|belief-to-contract|world model.*prediction|prediction finance/.test(norm)) {
    return {
      vertical_id: 'fintech.prediction-markets.belief-discovery',
      confidence: 0.88,
      method: 'prediction_markets_infer',
    };
  }
  if (
    /backtest|data infrastructure|institutional infrastructure|unified data|quantitative trading infrastructure|venue fragmentation/.test(
      norm,
    )
  ) {
    return {
      vertical_id: 'fintech.prediction-markets.infrastructure',
      confidence: 0.88,
      method: 'prediction_markets_infer',
    };
  }

  return {
    vertical_id: 'fintech.prediction-markets.execution',
    confidence: 0.72,
    method: 'prediction_markets_infer_default',
  };
}

/**
 * Map a free-text industry_sub_vertical (+ optional YC industries) to canonical vertical_id.
 * @returns {{ vertical_id: string|null, confidence: number, method: string, vertical?: object }}
 */
export function normalizeVertical(input, ontology = loadVerticalOntology()) {
  const { byId, byAlias } = buildLookup(ontology);
  const text = input?.industry_sub_vertical ?? input?.text ?? '';
  const ycIndustries = input?.yc_industries ?? input?.industries ?? [];

  if (typeof text === 'string' && text.trim()) {
    const key = normalizeText(text);
    if (byAlias.has(key)) {
      const vertical_id = byAlias.get(key);
      return { vertical_id, confidence: 1, method: 'alias_exact', vertical: byId.get(vertical_id) };
    }

    // Substring: alias contained in text or vice versa
    let bestSub = null;
    let bestSubLen = 0;
    for (const [alias, id] of byAlias.entries()) {
      const aliasInKey = aliasContainsLabelAsWords(key, alias);
      const keyInAlias = key.includes(alias);
      if (!aliasInKey && !keyInAlias) continue;
      if (id.startsWith('fintech.prediction-markets.') && !PM_TEXT_RE.test(key)) continue;
      if (id.startsWith('healthcare.') && /^(operations|infrastructure|analytics|b2b)$/.test(key)) continue;
      if (alias.length > bestSubLen) {
        bestSubLen = alias.length;
        bestSub = id;
      }
    }
    if (bestSub && bestSubLen >= 12) {
      return { vertical_id: bestSub, confidence: 0.85, method: 'alias_substring', vertical: byId.get(bestSub) };
    }

    // Token overlap against labels + aliases
    let bestId = null;
    let bestScore = 0;
    for (const v of ontology.verticals) {
      const candidates = [v.label, ...(v.aliases ?? [])];
      for (const c of candidates) {
        const score = jaccard(text, c);
        if (score > bestScore) {
          bestScore = score;
          bestId = v.id;
        }
      }
    }
    if (bestId && bestScore >= 0.45) {
      return {
        vertical_id: bestId,
        confidence: Math.min(0.8, 0.5 + bestScore * 0.5),
        method: 'token_overlap',
        vertical: byId.get(bestId),
      };
    }
  }

  const pair = ycPairFromIndustries(ycIndustries);
  const defaults = ontology.yc_subindustry_defaults ?? YC_SUBINDUSTRY_DEFAULTS;
  if (pair && defaults[pair]) {
    const vertical_id = defaults[pair];
    return {
      vertical_id,
      confidence: 0.55,
      method: 'yc_subindustry_default',
      vertical: byId.get(vertical_id),
    };
  }

  if (ycIndustries[0] && defaults[ycIndustries[0]]) {
    const vertical_id = defaults[ycIndustries[0]];
    return {
      vertical_id,
      confidence: 0.45,
      method: 'yc_top_level_default',
      vertical: byId.get(vertical_id),
    };
  }

  return { vertical_id: null, confidence: 0, method: 'unmapped' };
}

export function getVerticalById(id, ontology = loadVerticalOntology()) {
  return ontology.verticals.find((v) => v.id === id) ?? null;
}

export function listVerticals(ontology = loadVerticalOntology()) {
  return ontology.verticals;
}

export function summarizeOntology(ontology = loadVerticalOntology()) {
  return ontology.counts ?? {
    sectors: ontology.sectors?.length,
    industries: ontology.industries?.length,
    verticals: ontology.verticals?.length,
  };
}

if (process.argv[1]?.endsWith('verticals.mjs') && process.argv.includes('--emit-json')) {
  const doc = emitVerticalsJson();
  console.log(`Wrote ${JSON_PATH} (${doc.counts.verticals} verticals)`);
}
