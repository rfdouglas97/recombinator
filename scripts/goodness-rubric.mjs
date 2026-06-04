/**
 * Goodness index v1 — interpretable rubric (no embeddings).
 * See .cursor/skills/yc-company-generator/goodness-index.md
 */

import { normalizeText, tokenSet, getVerticalById } from './eval-utils.mjs';

export const GOODNESS_WEIGHTS = {
  buyer_budget: 0.2,
  workflow_pain: 0.2,
  ai_wedge: 0.2,
  urgency: 0.15,
  transfer_proof: 0.15,
  sharpness: 0.1,
};

export const SHARPNESS_BLOCKLIST = [
  'ai platform for every',
  'leverage ai to',
  'revolutionize',
  'cutting-edge platform',
  'for any industry',
  'horizontal copilot for everyone',
  'next-generation platform for everything',
  'ai-powered solution for all',
  'transform industries',
];

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function textBlob(record) {
  return normalizeText(
    [
      record.one_liner,
      record.long_description,
      record.what_they_sell,
      record.ai_play,
      record.who_pays,
      record.generation_rationale,
      record.why_good_idea?.pain,
      record.why_good_idea?.urgency,
      record.why_good_idea?.ai_wedge,
      record.why_good_idea?.buyer_budget,
      record.why_good_idea?.proof_from_batch,
    ].join(' '),
  );
}

function hitsBlocklist(blob) {
  for (const phrase of SHARPNESS_BLOCKLIST) {
    if (blob.includes(normalizeText(phrase))) return phrase;
  }
  return null;
}

function fieldStrength(text, minLen = 12) {
  const t = String(text ?? '').trim();
  if (t.length < minLen) return 0.2;
  if (t.length < minLen + 20) return 0.6;
  return 1;
}

function buyerScore(record, vertical, blob) {
  let score = 0;
  const buyers = vertical?.buyers ?? [];
  for (const b of buyers) {
    const tokens = normalizeText(b).split(' ').filter((t) => t.length > 3);
    if (tokens.some((t) => blob.includes(t))) score = Math.max(score, 0.85);
  }
  const whyBuyer = record.why_good_idea?.buyer_budget;
  score = Math.max(score, fieldStrength(whyBuyer, 15) * 0.9);
  const whoPays = normalizeText(record.who_pays);
  if (whoPays.length > 2 && blob.includes(whoPays)) score = Math.max(score, 0.75);
  return clamp01(score);
}

function workflowScore(record, vertical, blob) {
  const wf = vertical?.workflow;
  let score = fieldStrength(record.why_good_idea?.pain, 15) * 0.5;
  if (wf) {
    const wfNorm = normalizeText(String(wf).replace(/_/g, ' '));
    if (blob.includes(wfNorm)) score = Math.max(score, 0.9);
    for (const t of wfNorm.split(' ').filter((x) => x.length > 4)) {
      if (blob.includes(t)) score = Math.max(score, 0.75);
    }
  }
  const label = normalizeText(vertical?.label ?? '');
  if (label && blob.split(' ').some((w) => label.includes(w) && w.length > 4)) {
    score = Math.max(score, 0.65);
  }
  return clamp01(score);
}

function aiWedgeScore(record, blob) {
  let score = fieldStrength(record.why_good_idea?.ai_wedge, 15);
  const generic = ['ai platform', 'ai solution', 'leverage ai', 'powered by ai'];
  if (generic.some((g) => blob.includes(g)) && !record.why_good_idea?.ai_wedge) {
    score = Math.min(score, 0.35);
  }
  const specific = ['agent', 'automat', 'workflow', 'infra', 'api', 'model', 'compliance', 'robot', 'sensor'];
  if (specific.some((s) => blob.includes(s))) score = Math.max(score, 0.7);
  return clamp01(score);
}

function urgencyScore(record) {
  return clamp01(fieldStrength(record.why_good_idea?.urgency, 12));
}

function transferScore(record, ideaContext) {
  const proof = record.why_good_idea?.proof_from_batch;
  let score = fieldStrength(proof, 20);
  if (ideaContext?.requires_analog_proof) {
    const hasAnalog =
      (record.analog_slugs?.length ?? 0) > 0 ||
      /transfer|analog|similar|same archetype|e\.g\.|for example|rote|rex|batch/i.test(String(proof ?? ''));
    if (!hasAnalog) score = Math.min(score, 0.35);
    else score = Math.max(score, 0.75);
  } else if (ideaContext?.same_cell_instances?.length) {
    score = Math.max(score, 0.6);
  }
  return clamp01(score);
}

function sharpnessScore(record, blob) {
  const blocked = hitsBlocklist(blob);
  if (blocked) return { score: 0.1, blocked };
  const ol = String(record.one_liner ?? '').trim();
  const words = ol.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return { score: 0.2, blocked: null };
  if (words.length > 14) return { score: 0.5, blocked: null };
  if (words.length >= 5 && words.length <= 12) return { score: 0.95, blocked: null };
  return { score: 0.75, blocked: null };
}

function bandForOverall(overall) {
  if (overall >= 70) return 'strong';
  if (overall >= 50) return 'acceptable';
  return 'weak';
}

function buildFeedback(dimensions) {
  const hints = {
    buyer_budget: 'Name the paying role and budget line (from vertical.buyers).',
    workflow_pain: 'Anchor to the vertical workflow — what manual process breaks?',
    ai_wedge: 'Specify the AI mechanism; avoid generic AI platform language.',
    urgency: 'Add why now — regulation, cost, labor, or tech inflection.',
    transfer_proof: 'Cite how a batch analog pattern transfers to this cell.',
    sharpness: 'Tighten one-liner; remove buzzwords; ≤12 words.',
  };
  const sorted = Object.entries(dimensions).sort((a, b) => a[1] - b[1]);
  const lowest = sorted.slice(0, 2).map(([k]) => k);
  const feedback = lowest.map((k) => hints[k]).join(' ');
  return { lowest_dimensions: lowest, feedback };
}

/**
 * @param {object} record - synthetic or partial record with thesis fields
 * @param {{ vertical?: object, ideaContext?: object }} ctx
 */
export function computeGoodnessIndex(record, { vertical = null, ideaContext = null } = {}) {
  const blob = textBlob(record);
  const sharp = sharpnessScore(record, blob);

  const dimensions = {
    buyer_budget: buyerScore(record, vertical, blob),
    workflow_pain: workflowScore(record, vertical, blob),
    ai_wedge: aiWedgeScore(record, blob),
    urgency: urgencyScore(record),
    transfer_proof: transferScore(record, ideaContext),
    sharpness: sharp.score,
  };

  let overall =
    100 *
    Object.entries(GOODNESS_WEIGHTS).reduce((s, [k, w]) => s + w * (dimensions[k] ?? 0), 0);

  if (sharp.blocked) overall = Math.min(overall, 45);

  overall = Math.round(overall);
  const band = bandForOverall(overall);
  const { lowest_dimensions, feedback } = buildFeedback(dimensions);

  return {
    overall,
    band,
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
    lowest_dimensions,
    feedback,
    blocklist_hit: sharp.blocked ?? null,
    pass: band !== 'weak',
  };
}

/** Score an empty gap cell before generation (proto thesis from labels only). */
export function computeGapTransferScore(cell, { verticalOntology, ideaContext }) {
  const vertical = getVerticalById(cell.vertical_id, verticalOntology);
  const proto = {
    one_liner: `${vertical?.label ?? cell.vertical_id} ${vertical?.workflow ?? ''}`,
    what_they_sell: vertical?.label,
    who_pays: vertical?.buyers?.[0] ?? '',
    why_good_idea: {
      pain: vertical?.workflow?.replace(/_/g, ' ') ?? vertical?.label,
      urgency: vertical?.sector_label ?? '',
      ai_wedge: cell.phenotype_primary_id,
      buyer_budget: vertical?.buyers?.[0] ?? '',
      proof_from_batch: ideaContext?.transfer_analogs?.[0]?.transfer_note ?? '',
    },
    analog_slugs: ideaContext?.transfer_analogs?.map((a) => a.slug).filter(Boolean) ?? [],
  };
  const idx = computeGoodnessIndex(proto, { vertical, ideaContext });
  return {
    transfer_score: idx.overall,
    transfer_band: idx.band,
    goodness_index: idx,
  };
}

/** Rank gaps by proto transfer score (higher = better whitespace to generate). */
export function rankGapsByGoodness(
  gaps,
  { inferPhenotype, assignments, getIdeaContextForCell, verticalOntology },
) {
  const scored = gaps.map((gap) => {
    const cell = {
      business_model: gap.business_model,
      vertical_id: gap.vertical_id,
      phenotype_primary_id: gap.phenotype_primary_id ?? inferPhenotype?.(gap),
    };
    const ideaContext = getIdeaContextForCell?.(cell, { assignments }) ?? null;
    const t = computeGapTransferScore(cell, { verticalOntology, ideaContext });
    return { gap, cell, ...t };
  });
  return scored.sort((a, b) => b.transfer_score - a.transfer_score);
}
