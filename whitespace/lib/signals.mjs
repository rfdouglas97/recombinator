/**
 * Batch-native opportunity signals (v2 — sharp wedges, not catalog metadata).
 */

import { getVerticalById } from '../../scripts/eval-utils.mjs';
import { inferPhenotypeForGap } from './phenotype.mjs';
import { verticalDepth } from './sharpness.mjs';

export function buildVerticalsWithCompanies(observedCells) {
  const set = new Set();
  for (const c of observedCells) {
    if (c.companies?.length) set.add(c.vertical_id);
  }
  return set;
}

export function buildVerticalBmOccupancy(observedCells) {
  const map = new Map();
  for (const c of observedCells) {
    if (!c.companies?.length) continue;
    if (!map.has(c.vertical_id)) map.set(c.vertical_id, new Set());
    map.get(c.vertical_id).add(c.business_model);
  }
  return map;
}

function parentPrefixes(verticalId) {
  const parts = verticalId.split('.');
  const prefixes = [];
  for (let i = 1; i < parts.length; i++) {
    prefixes.push(parts.slice(0, i).join('.'));
  }
  return prefixes;
}

function siblingVerticalIds(verticalId, allVerticalIds) {
  const parts = verticalId.split('.');
  if (parts.length < 2) return [];
  const parent = parts.slice(0, -1).join('.');
  return allVerticalIds.filter((id) => id !== verticalId && id.startsWith(`${parent}.`));
}

export function buildAdjacencyIndex(observedCells, phenotypeOntology) {
  const byExactVertical = new Map();
  const byParentPrefix = new Map();
  const siblingCompanyCount = new Map();

  const phenotypeFamily = new Map(
    (phenotypeOntology.phenotypes ?? []).map((p) => [p.id, p.family])
  );

  for (const c of observedCells) {
    if (!c.companies?.length) continue;
    const slugs = c.companies;
    const n = slugs.length;

    if (!byExactVertical.has(c.vertical_id)) byExactVertical.set(c.vertical_id, new Set());
    for (const s of slugs) byExactVertical.get(c.vertical_id).add(s);

    for (const p of parentPrefixes(c.vertical_id)) {
      // Skip bare sector roots (e.g. "fintech") — mixes trading, insurance, lending.
      if (p.split('.').filter(Boolean).length < 2) continue;
      if (!byParentPrefix.has(p)) byParentPrefix.set(p, { slugs: new Set(), companyCount: 0 });
      const bucket = byParentPrefix.get(p);
      for (const s of slugs) bucket.slugs.add(s);
      bucket.companyCount += n;
    }
  }

  return { byExactVertical, byParentPrefix, phenotypeFamily, siblingCompanyCount };
}

/**
 * Tighter adjacency: exact vertical > light parent > saturated parent penalty.
 */
export function computeAdjacency(gap, adjacencyIndex) {
  const { byExactVertical, byParentPrefix } = adjacencyIndex;
  const parents = parentPrefixes(gap.vertical_id);

  const exact = byExactVertical.get(gap.vertical_id);
  if (exact?.size) {
    return { score: 0.35, slugs: [...exact].slice(0, 6), mode: 'same_vertical_filled' };
  }

  let best = { score: 0.15, slugs: [], mode: 'none' };
  for (const p of parents.slice().reverse()) {
    if (p.split('.').filter(Boolean).length < 2) continue;
    const bucket = byParentPrefix.get(p);
    if (!bucket?.slugs.size) continue;
    const count = bucket.companyCount;
    let score = 0.55;
    if (count >= 12) score = 0.25;
    else if (count >= 6) score = 0.35;
    else if (count >= 3) score = 0.45;

    if (score > best.score) {
      best = { score, slugs: [...bucket.slugs].slice(0, 6), mode: `parent:${p}` };
    }
  }

  return best;
}

/**
 * Tiered analog match: workflow > industry prefix > vertical tree (3+ segments).
 * Never matches across fintech.insurance vs fintech.trading vs fintech.lending.
 */
export function filterRelevantAnalogs(ideaContext, gap, verticalOntology) {
  const vertical = getVerticalById(gap.vertical_id, verticalOntology);
  const wf = vertical?.workflow ?? gap.workflow;
  const industryId = vertical?.industry_id ?? null;
  const gapParts = gap.vertical_id.split('.').filter(Boolean);
  const industryPrefix =
    industryId ?? (gapParts.length >= 2 ? gapParts.slice(0, 2).join('.') : null);
  const gapFintechBranch = gapParts[0] === 'fintech' ? gapParts[1] : null;

  const out = [];
  for (const a of ideaContext?.transfer_analogs ?? []) {
    const analogVid = a.cell?.vertical_id ?? '';
    const analogParts = analogVid.split('.').filter(Boolean);
    if (gapFintechBranch && analogParts[0] === 'fintech' && analogParts[1] !== gapFintechBranch) {
      continue;
    }

    let tier = null;
    if (wf && a.workflow === wf) tier = 'workflow';
    else if (
      industryPrefix &&
      (analogVid === industryPrefix || analogVid.startsWith(`${industryPrefix}.`))
    ) {
      tier = 'industry';
    } else {
      const shared = gapParts.filter((p, i) => analogParts[i] === p).length;
      if (shared >= 3) tier = 'vertical_tree';
    }
    if (tier) out.push({ tier, slug: a.slug, name: a.name, workflow: a.workflow });
  }
  return out.slice(0, 5);
}

export function computeAnalogStrength(relevantAnalogs, ideaContext) {
  if (!relevantAnalogs.length) {
    return ideaContext?.requires_analog_proof ? 0 : 0.08;
  }
  const best = relevantAnalogs[0]?.tier;
  const count = relevantAnalogs.length;
  const tierBase =
    best === 'workflow' ? 0.85 : best === 'industry' ? 0.55 : best === 'vertical_tree' ? 0.4 : 0.2;
  return Math.min(1, tierBase + Math.min(0.15, (count - 1) * 0.06));
}

export function computeSpecificity(gap, verticalOntology) {
  const vertical = getVerticalById(gap.vertical_id, verticalOntology);
  const depth = verticalDepth(gap.vertical_id);
  let score = 0;
  if (depth >= 4) score = 0.95;
  else if (depth === 3) score = 0.7;
  else if (depth === 2) score = 0.25;
  else score = 0.1;

  const workflow = vertical?.workflow ?? gap.workflow;
  const buyers = vertical?.buyers ?? [];
  if (workflow && workflow.length > 3 && !workflow.includes('_only')) score += 0.15;
  if (buyers.length >= 2) score += 0.1;
  if (buyers.length === 1) score += 0.05;

  const label = String(gap.vertical_label ?? '');
  if (label.length > 12 && label.length < 55) score += 0.05;

  return Math.round(Math.min(1, score) * 100) / 100;
}

/** Penalize crowded sibling verticals (taxonomy expansion noise). */
export function computeSaturationPenalty(gap, observedCells, allVerticalIds) {
  const siblings = siblingVerticalIds(gap.vertical_id, allVerticalIds);
  let siblingCompanies = 0;
  for (const c of observedCells) {
    if (siblings.includes(c.vertical_id)) siblingCompanies += c.companies?.length ?? 0;
  }
  if (siblingCompanies >= 10) return 0.2;
  if (siblingCompanies >= 5) return 0.1;
  if (siblingCompanies >= 3) return 0.05;
  return 0;
}

export function buildGapFlags({
  gap,
  verticalsWithCompanies,
  verticalBmOccupancy,
  allVerticalIds,
  transferScore,
  ideaContext,
  verticalOntology,
  relevantAnalogs,
  sharpness,
  adjacency,
}) {
  const flags = [];
  const vertical = getVerticalById(gap.vertical_id, verticalOntology);
  const workflow = vertical?.workflow ?? gap.workflow;
  const depth = verticalDepth(gap.vertical_id);

  if (depth < 3) flags.push('shallow_vertical');
  if (sharpness?.generic_score >= 0.4) flags.push('generic_label');
  if (!verticalsWithCompanies.has(gap.vertical_id)) flags.push('vertical_desert');

  const occupiedBms = verticalBmOccupancy.get(gap.vertical_id);
  if (occupiedBms?.size && !occupiedBms.has(gap.business_model)) flags.push('bm_hole');

  const siblings = siblingVerticalIds(gap.vertical_id, allVerticalIds);
  if (siblings.some((id) => verticalsWithCompanies.has(id))) flags.push('sibling_gap');

  if (transferScore < 45) flags.push('low_transfer');
  const topTier = relevantAnalogs[0]?.tier;
  if (!topTier) flags.push('no_relevant_analog');
  else if (topTier === 'workflow') flags.push('workflow_analog');
  else if (topTier === 'industry') flags.push('industry_analog');
  else flags.push('weak_analog');
  if (!workflow) flags.push('missing_workflow');
  if (adjacency?.mode?.startsWith('parent:') && adjacency.score <= 0.35) {
    flags.push('saturated_cluster');
  }

  return flags;
}
