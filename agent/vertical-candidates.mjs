/**
 * Heuristic shortlist of vertical leaves for LLM classification (sector filter + keyword score).
 */

import { getVerticalById } from '../taxonomy/verticals.mjs';
import { YC_SUBINDUSTRY_DEFAULTS } from '../taxonomy/verticals-data.mjs';

const YC_TOP_SECTOR = {
  Healthcare: 'healthcare-life-sciences',
  Fintech: 'financial-services',
  Consumer: 'consumer',
  Industrials: 'industrials-defense',
  'Real Estate and Construction': 'real-estate-construction',
  Government: 'government-public',
  B2B: 'enterprise-software',
};

export function sectorFromYc(industries = [], verticalOntology) {
  if (industries.length >= 2) {
    const pair = `${industries[0]} > ${industries[1]}`;
    const defaultVert = YC_SUBINDUSTRY_DEFAULTS[pair];
    if (defaultVert) {
      const v = getVerticalById(defaultVert, verticalOntology);
      if (v?.sector_id) return v.sector_id;
    }
  }
  if (industries[0] && YC_SUBINDUSTRY_DEFAULTS[industries[0]]) {
    const v = getVerticalById(YC_SUBINDUSTRY_DEFAULTS[industries[0]], verticalOntology);
    if (v?.sector_id) return v.sector_id;
  }
  return YC_TOP_SECTOR[industries[0]] ?? null;
}

/**
 * @param {object} company - assignment row
 * @param {object} verticalOntology
 * @param {{ maxCandidates?: number, hints?: string }} [opts]
 */
export function verticalCandidatesForCompany(company, verticalOntology, opts = {}) {
  const maxCandidates = opts.maxCandidates ?? 40;
  const verts = verticalOntology.verticals ?? [];
  const ids = new Set();

  const add = (id) => {
    if (id && verts.some((v) => v.id === id)) ids.add(id);
  };

  add(company.vertical_id);
  add(company.canonical_vertical_id);

  let sectorId = company.vertical_sector_id;
  if (!sectorId) {
    const cur = company.vertical_id ? getVerticalById(company.vertical_id, verticalOntology) : null;
    sectorId = cur?.sector_id ?? sectorFromYc(company.yc_industries, verticalOntology);
  }

  let pool = sectorId ? verts.filter((v) => v.sector_id === sectorId) : [...verts];
  if (pool.length < 8) pool = [...verts];

  const hint = [
    opts.hints,
    company.industry_sub_vertical,
    company.one_liner,
    company.phenotype_primary_label,
    company.phenotype_primary_id,
    ...(company.yc_tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scored = pool.map((v) => {
    let score = ids.has(v.id) ? 25 : 0;
    const blob = `${v.label} ${v.id} ${(v.aliases ?? []).join(' ')}`.toLowerCase();
    for (const w of hint.split(/\W+/).filter((w) => w.length > 3)) {
      if (blob.includes(w)) score += 1;
    }
    return { v, score };
  });
  scored.sort((a, b) => b.score - a.score);

  for (const { v } of scored.slice(0, maxCandidates)) ids.add(v.id);

  if (/agent|infra|devtools|sdk|runtime|orchestr/i.test(hint)) {
    for (const v of verts) {
      if (v.id.startsWith('ai-infrastructure.') || v.id.startsWith('enterprise.devtools.')) {
        ids.add(v.id);
      }
    }
  }

  if (/logistics|supply chain|freight|wms|tms/i.test(hint)) {
    for (const v of verts) {
      if (v.id.startsWith('logistics.')) ids.add(v.id);
    }
  }

  if (/prediction market|event contract|polymarket|kalshi/i.test(hint)) {
    for (const v of verts) {
      if (v.id.startsWith('fintech.prediction-markets.')) ids.add(v.id);
    }
  }

  if (/cpg|consumer packaged|omnichannel retail/i.test(hint)) {
    for (const v of verts) {
      if (v.id.startsWith('retail.')) ids.add(v.id);
    }
  }

  return [...ids].map((id) => getVerticalById(id, verticalOntology)).filter(Boolean);
}
