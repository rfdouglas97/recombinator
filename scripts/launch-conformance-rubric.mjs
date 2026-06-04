/**
 * Launch conformance rubric — scores how well a YC Launch post fits our taxonomy
 * and whether our whitespace predictor could have anticipated it.
 *
 * Taxonomy layers: phenotype (archetype) × vertical (industry workflow) × BM (monetization).
 * Predictor: gap matrix + opportunity ranking + synthetic idea library.
 */

import { normalizeText, tokenSet, jaccard, getVerticalById, getPhenotypeById, cellKey } from './eval-utils.mjs';
import { BM_LABELS, PHENOTYPE_TO_BM, phenotypeAllowedForBm } from '../taxonomy/phenotype-to-bm.mjs';
import { computeGoodnessIndex } from './goodness-rubric.mjs';

/** Human-readable rubric definition (exported for reports). */
export const RUBRIC = {
  version: '1.0',
  taxonomy_dimensions: {
    phenotype_alignment: {
      weight: 0.25,
      label: 'Phenotype alignment',
      description:
        'Launch narrative matches the assigned/canonical business archetype (value wedge, AI application, workflow pattern).',
      scoring: {
        strong: '≥0.75 — launch keywords and thesis map clearly to phenotype family',
        acceptable: '0.50–0.74 — partial match; secondary phenotype may fit better',
        weak: '<0.50 — launch reads as a different archetype than classification',
      },
    },
    vertical_workflow_fit: {
      weight: 0.25,
      label: 'Vertical / workflow fit',
      description:
        'Launch describes buyers, pain, and workflow steps that match the canonical vertical leaf.',
      scoring: {
        strong: '≥0.75 — buyers/workflow terms from vertical appear in launch body',
        acceptable: '0.50–0.74 — sector correct but workflow leaf is approximate',
        weak: '<0.50 — launch targets a different industry workflow',
      },
    },
    business_model_fit: {
      weight: 0.15,
      label: 'Business model fit',
      description: 'Monetization and delivery signals (SaaS, managed service, marketplace, etc.) match BM code.',
      scoring: {
        strong: '≥0.75 — BM is unambiguous from launch',
        acceptable: '0.50–0.74 — BM plausible but multi-model',
        weak: '<0.50 — BM mismatch or unclassifiable',
      },
    },
    ontology_completeness: {
      weight: 0.15,
      label: 'Ontology completeness',
      description: 'All three taxonomy layers resolve without fallback or missing vertical/phenotype.',
      scoring: {
        strong: '1.0 — phenotype, vertical, BM all resolved with confidence ≥0.7',
        acceptable: '0.6 — one layer inferred heuristically',
        weak: '<0.6 — missing layer or low confidence across board',
      },
    },
    thesis_coherence: {
      weight: 0.20,
      label: 'Thesis coherence',
      description: 'Launch has clear what-they-sell, who-pays, and AI wedge (not generic AI platform language).',
      scoring: {
        strong: '≥0.75 — sharp one-liner + specific buyer + concrete AI mechanism',
        acceptable: '0.50–0.74 — thesis present but vague on buyer or wedge',
        weak: '<0.50 — buzzword-heavy or horizontal positioning',
      },
    },
  },
  predictor_checks: {
    cell_was_whitespace: 'Was (BM × vertical) an empty matrix cell before this company?',
    ranked_gap_match: 'Did the cell appear in gap-opportunity-ranked.json?',
    synthetic_idea_match: 'Did we generate a synthetic startup card for this cell?',
    analog_in_gap_flags: 'Was this company slug cited as an analog in a ranked gap?',
    retro_transfer_score: 'Goodness-index score if launch thesis were placed in the target cell',
  },
  predictability_bands: {
    predicted:
      'Cell was top-50 ranked gap, OR synthetic card exists, OR slug was gap analog — model would have surfaced this niche',
    plausible:
      'Cell was in gap list (lower rank) or adjacent cluster had high opportunity — structurally foreseeable',
    occupied_first:
      'Company is first occupant of cell — not predictable as whitespace but taxonomy-conforming',
    surprise: 'Classification mismatch or launch narrative diverges from assigned cell',
    out_of_scope: 'Cannot classify; outside ontology or batch scope',
  },
  verdict_thresholds: {
    conforming: 70,
    partial: 50,
  },
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function bandForScore(score) {
  if (score >= 0.75) return 'strong';
  if (score >= 0.5) return 'acceptable';
  return 'weak';
}

function launchTextBlob(launch, classification = {}) {
  return normalizeText(
    [
      launch.title,
      launch.tagline,
      launch.body,
      classification.one_liner,
      classification.what_they_sell,
      classification.ai_play,
      classification.who_pays,
      classification.industry_sub_vertical,
    ].join(' '),
  );
}

function phenotypeAlignmentScore(blob, phenotype, classification) {
  if (!phenotype) return 0.2;
  const phenoBlob = normalizeText(
    [phenotype.label, phenotype.description, phenotype.value_wedge, phenotype.ai_application, phenotype.family].join(' '),
  );
  let score = jaccard(blob, phenoBlob);
  const idTokens = normalizeText(classification.phenotype_primary_id ?? '').replace(/-/g, ' ');
  for (const t of idTokens.split(' ').filter((w) => w.length > 3)) {
    if (blob.includes(t)) score = Math.max(score, 0.65);
  }
  if (classification.confidence >= 0.85) score = Math.max(score, 0.7);
  return clamp01(score);
}

function verticalWorkflowScore(blob, vertical, classification) {
  if (!vertical) return 0.2;
  const aliasBlob = normalizeText((vertical.aliases ?? []).join(' '));
  let score = jaccard(blob, `${vertical.label} ${vertical.workflow ?? ''} ${(vertical.buyers ?? []).join(' ')} ${aliasBlob}`);
  const wf = vertical.workflow ? normalizeText(String(vertical.workflow).replace(/_/g, ' ')) : '';
  if (wf && blob.includes(wf)) score = Math.max(score, 0.85);
  for (const b of vertical.buyers ?? []) {
    const tokens = normalizeText(b).split(' ').filter((t) => t.length > 3);
    if (tokens.some((t) => blob.includes(t))) score = Math.max(score, 0.75);
  }
  for (const alias of vertical.aliases ?? []) {
    const a = normalizeText(alias);
    if (a.length > 4 && blob.includes(a)) score = Math.max(score, 0.8);
  }
  const sub = normalizeText(classification?.industry_sub_vertical ?? '');
  if (sub) score = Math.max(score, jaccard(blob, sub) * 1.2);
  const domainTerms = ['distributor', 'procurement', 'supply chain', 'manufacturing', 'erp', 'quote', 'rfq'];
  if (domainTerms.some((t) => blob.includes(t) && aliasBlob.includes(t.split(' ')[0]))) {
    score = Math.max(score, 0.7);
  }
  return clamp01(score);
}

function businessModelScore(blob, businessModel, phenotypeId) {
  if (!businessModel) return 0.3;
  const signals = {
    'BM-01': ['vertical', 'saas', 'workflow', 'for healthcare', 'for legal', 'for insurance', 'department'],
    'BM-02': ['copilot', 'productivity', 'teams', 'horizontal', 'platform for'],
    'BM-03': ['infra', 'developer', 'api', 'runtime', 'sdk', 'devtools', 'orchestr'],
    'BM-04': ['managed', 'ai employee', 'we run', 'outsourc', 'service'],
    'BM-05': ['insurance', 'underwrit', 'payment', 'lending', 'fintech', 'bank'],
    'BM-06': ['data', 'intelligence', 'terminal', 'market data', 'research'],
    'BM-07': ['marketplace', 'network', 'two-sided', 'connect buyers'],
    'BM-08': ['hardware', 'robot', 'drone', 'sensor', 'device'],
    'BM-09': ['biotech', 'clinical', 'drug', 'lab', 'pharma', 'rd'],
    'BM-10': ['consumer', 'prosumer', 'game', 'personal', 'tiktok'],
    'BM-11': ['defense', 'gov', 'military', 'critical infrastructure'],
    'BM-12': ['open source', 'open-source', 'oss'],
  };
  const kws = signals[businessModel] ?? [];
  let score = 0.35;
  for (const kw of kws) {
    if (blob.includes(kw)) score = Math.max(score, 0.7);
  }
  if (phenotypeId && phenotypeAllowedForBm(phenotypeId, businessModel)) {
    score = Math.max(score, 0.55);
  }
  return clamp01(score);
}

function ontologyCompletenessScore(classification) {
  let score = 0;
  if (classification.phenotype_primary_id) score += 0.34;
  if (classification.vertical_id) score += 0.33;
  if (classification.business_models?.length) score += 0.33;
  const conf = classification.confidence ?? 0.5;
  return clamp01(score * (0.5 + conf * 0.5));
}

function thesisCoherenceScore(launch) {
  const record = {
    one_liner: launch.tagline ?? launch.title,
    what_they_sell: launch.tagline,
    who_pays: extractWhoPays(launch.body),
    ai_play: extractAiWedge(launch.body),
    why_good_idea: { ai_wedge: extractAiWedge(launch.body) },
  };
  const idx = computeGoodnessIndex(record, { vertical: null, ideaContext: null });
  const dims = idx.dimensions ?? {};
  const avg = (dims.ai_wedge + dims.sharpness + (dims.buyer_budget ?? 0.3)) / 3;
  return clamp01(avg);
}

function extractWhoPays(body) {
  if (!body) return '';
  const m = body.match(/\*\*Our ask:\*\*|who pays|buyers|customers/i);
  if (!m) return '';
  return body.slice(m.index, m.index + 200);
}

function extractAiWedge(body) {
  if (!body) return '';
  const m = body.match(/\*\*The Solution\*\*|AI agent|automat|model|LLM/i);
  if (!m) return '';
  return body.slice(m.index, Math.min(body.length, m.index + 300));
}

function findRankedGap(rankedGaps, cell) {
  if (!cell) return null;
  const key = `${cell.business_model}|${cell.vertical_id}`;
  return rankedGaps.find((g) => `${g.business_model}|${g.vertical_id}` === key) ?? null;
}

function findSyntheticMatch(libraryCards, cell) {
  if (!cell) return null;
  const key = `${cell.business_model}|${cell.vertical_id}`;
  return (
    libraryCards.find((c) => {
      const ws = c.whitespace ?? {};
      return `${ws.business_model}|${ws.vertical_id}` === key || ws.cell_key === key;
    }) ?? null
  );
}

function slugInGapAnalogs(slug, rankedGaps) {
  const matches = [];
  for (const g of rankedGaps) {
    const analogs = [...(g.analog_slugs ?? []), ...(g.workflow_matched_analog_slugs ?? [])];
    if (analogs.includes(slug)) {
      matches.push({ rank: g.rank, opportunity_score: g.opportunity_score, vertical_id: g.vertical_id });
    }
  }
  return matches;
}

function cellWasGap(gapCandidates, cell) {
  if (!cell) return false;
  const key = `${cell.business_model}|${cell.vertical_id}`;
  return (gapCandidates.gaps ?? []).some((g) => `${g.business_model}|${g.vertical_id}` === key);
}

function cellIsObserved(matrix, cell, slug) {
  if (!cell) return false;
  const observed = (matrix.observed_cells ?? []).find(
    (c) => c.business_model === cell.business_model && c.vertical_id === cell.vertical_id,
  );
  if (!observed) return false;
  return observed.companies?.includes(slug);
}

/**
 * @param {object} launch - normalized launch record
 * @param {object} classification - phenotype/vertical/BM assignment
 * @param {object} ctx - { verticalOntology, phenotypeOntology, gapCandidates, rankedGaps, bmMatrix, libraryCards, existingAssignment }
 */
export function evaluateLaunchConformance(launch, classification, ctx) {
  const {
    verticalOntology,
    phenotypeOntology,
    gapCandidates = { gaps: [] },
    rankedGaps = [],
    bmMatrix = { observed_cells: [] },
    libraryCards = [],
    existingAssignment = null,
  } = ctx;

  const blob = launchTextBlob(launch, classification);
  const phenotype = getPhenotypeById(classification.phenotype_primary_id, phenotypeOntology);
  const vertical = getVerticalById(classification.vertical_id, verticalOntology);
  const businessModel = classification.business_models?.[0] ?? null;

  const dimensions = {
    phenotype_alignment: phenotypeAlignmentScore(blob, phenotype, classification),
    vertical_workflow_fit: verticalWorkflowScore(blob, vertical, classification),
    business_model_fit: businessModelScore(blob, businessModel, classification.phenotype_primary_id),
    ontology_completeness: ontologyCompletenessScore(classification),
    thesis_coherence: thesisCoherenceScore(launch),
  };

  const taxonomyScore =
    100 *
    Object.entries(RUBRIC.taxonomy_dimensions).reduce(
      (sum, [key, def]) => sum + def.weight * (dimensions[key] ?? 0),
      0,
    );

  const cell = businessModel && classification.vertical_id && classification.phenotype_primary_id
    ? {
        business_model: businessModel,
        vertical_id: classification.vertical_id,
        phenotype_primary_id: classification.phenotype_primary_id,
      }
    : null;

  const rankedGap = findRankedGap(rankedGaps, cell);
  const syntheticMatch = findSyntheticMatch(libraryCards, cell);
  const analogMatches = slugInGapAnalogs(launch.company_slug, rankedGaps);
  const wasGap = cellWasGap(gapCandidates, cell);
  const isObserved = cellIsObserved(bmMatrix, cell, launch.company_slug);
  const isFirstOccupant = isObserved && (bmMatrix.observed_cells ?? [])
    .find((c) => c.business_model === cell?.business_model && c.vertical_id === cell?.vertical_id)
    ?.companies?.length === 1;

  const retroRecord = {
    one_liner: launch.tagline ?? launch.title,
    what_they_sell: launch.tagline,
    who_pays: classification.who_pays,
    ai_play: classification.ai_play,
    why_good_idea: {
      pain: vertical?.workflow?.replace(/_/g, ' ') ?? vertical?.label,
      ai_wedge: classification.ai_play,
      buyer_budget: vertical?.buyers?.[0],
    },
  };
  const retroGoodness = computeGoodnessIndex(retroRecord, { vertical, ideaContext: null });

  let predictability_band = 'out_of_scope';
  const predictor_signals = [];

  if (!cell) {
    predictability_band = 'out_of_scope';
    predictor_signals.push('incomplete_cell');
  } else if (rankedGap && rankedGap.rank <= 50) {
    predictability_band = 'predicted';
    predictor_signals.push(`ranked_gap_top50:rank=${rankedGap.rank}`);
  } else if (syntheticMatch) {
    predictability_band = 'predicted';
    predictor_signals.push(`synthetic_card:${syntheticMatch.id}`);
  } else if (analogMatches.length > 0) {
    predictability_band = 'predicted';
    predictor_signals.push(`analog_in_gaps:${analogMatches.length}`);
  } else if (wasGap && rankedGap) {
    predictability_band = 'plausible';
    predictor_signals.push(`ranked_gap:rank=${rankedGap.rank},score=${rankedGap.opportunity_score}`);
  } else if (wasGap) {
    predictability_band = 'plausible';
    predictor_signals.push('cell_in_gap_list');
  } else if (isFirstOccupant) {
    predictability_band = 'occupied_first';
    predictor_signals.push('first_occupant_of_cell');
  } else if (isObserved) {
    predictability_band = 'plausible';
    predictor_signals.push('cell_observed_with_peers');
  } else if (existingAssignment) {
    const existingCell = {
      business_model: existingAssignment.business_models?.[0],
      vertical_id: existingAssignment.vertical_id,
      phenotype_primary_id: existingAssignment.phenotype_primary_id,
    };
    const sameCell =
      existingCell.business_model === cell.business_model &&
      existingCell.vertical_id === cell.vertical_id &&
      existingCell.phenotype_primary_id === cell.phenotype_primary_id;
    predictability_band = sameCell ? 'plausible' : 'surprise';
    if (!sameCell) predictor_signals.push('classification_drift_from_existing');
  } else {
    predictability_band = 'surprise';
    predictor_signals.push('unclassified_new_company');
  }

  if (taxonomyScore < RUBRIC.verdict_thresholds.partial) {
    predictability_band = predictability_band === 'out_of_scope' ? 'out_of_scope' : 'surprise';
    predictor_signals.push('low_taxonomy_conformance');
  }

  let verdict = 'non_conforming';
  if (taxonomyScore >= RUBRIC.verdict_thresholds.conforming) verdict = 'conforming';
  else if (taxonomyScore >= RUBRIC.verdict_thresholds.partial) verdict = 'partial';

  const dimensionBands = Object.fromEntries(
    Object.entries(dimensions).map(([k, v]) => [k, { score: Math.round(v * 100), band: bandForScore(v) }]),
  );

  return {
    rubric_version: RUBRIC.version,
    evaluated_at: new Date().toISOString(),
    launch_id: launch.launch_id,
    company_slug: launch.company_slug,
    taxonomy: {
      conformance_index: Math.round(taxonomyScore),
      verdict,
      dimensions: dimensionBands,
      cell: cell
        ? {
            ...cell,
            cell_key: cellKey(cell.business_model, cell.vertical_id, cell.phenotype_primary_id),
            business_model_label: BM_LABELS[cell.business_model],
            vertical_label: vertical?.label,
            phenotype_label: phenotype?.label,
          }
        : null,
    },
    predictor: {
      predictability_band,
      signals: predictor_signals,
      cell_was_whitespace: wasGap,
      ranked_gap: rankedGap
        ? {
            rank: rankedGap.rank,
            opportunity_score: rankedGap.opportunity_score,
            transfer_score: rankedGap.transfer_score,
          }
        : null,
      synthetic_match: syntheticMatch
        ? { id: syntheticMatch.id, name: syntheticMatch.startup?.name, one_liner: syntheticMatch.startup?.one_liner }
        : null,
      analog_gap_matches: analogMatches,
      retro_transfer_score: retroGoodness.overall,
      retro_transfer_band: retroGoodness.band,
      would_have_been_predicted: ['predicted', 'plausible'].includes(predictability_band),
    },
    notes: buildNotes(verdict, predictability_band, existingAssignment, classification),
  };
}

function buildNotes(verdict, predictabilityBand, existing, classification) {
  const notes = [];
  if (existing && existing.phenotype_primary_id !== classification.phenotype_primary_id) {
    notes.push(
      `Launch classifier phenotype (${classification.phenotype_primary_id}) differs from DB (${existing.phenotype_primary_id})`,
    );
  }
  if (verdict === 'conforming' && predictabilityBand === 'predicted') {
    notes.push('Strong fit: taxonomy conforms and whitespace model would have surfaced this cell.');
  }
  if (verdict === 'conforming' && predictabilityBand === 'occupied_first') {
    notes.push('Taxonomy conforms; company is first occupant — not predictable as whitespace but valid niche.');
  }
  if (verdict === 'partial') {
    notes.push('Review vertical or phenotype assignment; launch narrative only partially matches taxonomy.');
  }
  if (predictabilityBand === 'surprise') {
    notes.push('Launch diverges from model expectations — candidate for ontology expansion or reclassification.');
  }
  return notes;
}

export function rubricMarkdown() {
  const lines = ['# YC Launch Conformance Rubric', '', `Version ${RUBRIC.version}`, ''];
  lines.push('## Taxonomy dimensions\n');
  for (const [, def] of Object.entries(RUBRIC.taxonomy_dimensions)) {
    lines.push(`### ${def.label} (weight ${def.weight})`);
    lines.push(def.description);
    lines.push('');
    for (const [band, desc] of Object.entries(def.scoring)) {
      lines.push(`- **${band}**: ${desc}`);
    }
    lines.push('');
  }
  lines.push('## Predictor checks\n');
  for (const [key, desc] of Object.entries(RUBRIC.predictor_checks)) {
    lines.push(`- **${key}**: ${desc}`);
  }
  lines.push('');
  lines.push('## Predictability bands\n');
  for (const [band, desc] of Object.entries(RUBRIC.predictability_bands)) {
    lines.push(`- **${band}**: ${desc}`);
  }
  return lines.join('\n');
}
