/**
 * JSON Schemas for structured LLM outputs (Anthropic output_config.format).
 * Constraint rules: every object needs additionalProperties:false; no
 * min/max/length constraints (unsupported by structured outputs).
 */

const str = { type: 'string' };
const strArray = { type: 'array', items: { type: 'string' } };
const score0to4 = { type: 'integer', enum: [0, 1, 2, 3, 4] };

export const TARGET_CELL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['business_model', 'vertical_id', 'phenotype_primary_id'],
  properties: {
    business_model: str,
    vertical_id: str,
    phenotype_primary_id: str,
  },
};

/** Matches SYNTHETIC_REQUIRED_FIELDS in eval-utils.mjs plus thesis fields. */
export const SYNTHETIC_RECORD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'synthetic_id',
    'target_cell',
    'name',
    'one_liner',
    'long_description',
    'industry_sub_vertical',
    'phenotype_primary_id',
    'what_they_sell',
    'ai_play',
    'who_pays',
    'ai_application_patterns',
    'delivery',
    'buyer',
    'yc_industries_hypothesis',
    'idea_primitive_id',
    'why_good_idea',
    'analog_slugs',
    'generation_rationale',
  ],
  properties: {
    synthetic_id: str,
    target_cell: TARGET_CELL_SCHEMA,
    name: str,
    one_liner: str,
    long_description: str,
    industry_sub_vertical: str,
    phenotype_primary_id: str,
    what_they_sell: str,
    ai_play: str,
    who_pays: str,
    ai_application_patterns: strArray,
    delivery: strArray,
    buyer: strArray,
    yc_industries_hypothesis: strArray,
    idea_primitive_id: str,
    why_good_idea: {
      type: 'object',
      additionalProperties: false,
      required: ['pain', 'urgency', 'ai_wedge', 'buyer_budget', 'proof_from_batch'],
      properties: {
        pain: str,
        urgency: str,
        ai_wedge: str,
        buyer_budget: str,
        proof_from_batch: str,
      },
    },
    analog_slugs: strArray,
    generation_rationale: str,
  },
};

export const JUDGE_DIMENSIONS = [
  'buyer_specificity',
  'wedge_credibility',
  'why_now',
  'differentiation',
  'transfer_proof',
];

/** Joint ranking of all surviving candidates in one call. */
export const JUDGE_VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'ranking', 'winner_index', 'winner_rationale'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'scores', 'fatal_flaw', 'critique'],
        properties: {
          index: { type: 'integer' },
          scores: {
            type: 'object',
            additionalProperties: false,
            required: JUDGE_DIMENSIONS,
            properties: Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, score0to4])),
          },
          fatal_flaw: {
            anyOf: [str, { type: 'null' }],
            description: 'Disqualifying problem, or null if none',
          },
          critique: { ...str, description: 'Most actionable improvement for this candidate' },
        },
      },
    },
    ranking: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Candidate indexes from best to worst',
    },
    winner_index: { type: 'integer' },
    winner_rationale: str,
  },
};

/** Query → gap-cell matching (Phase 3 gap selection). */
export const GAP_MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matches'],
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cell_key', 'relevance', 'reason'],
        properties: {
          cell_key: { ...str, description: 'Exactly as listed in the catalog' },
          relevance: { type: 'number', description: '0..1' },
          reason: str,
        },
      },
    },
  },
};

/** judge score 0-100 from per-dimension 0-4 scores */
export function judgeScoreFromDimensions(scores) {
  const vals = JUDGE_DIMENSIONS.map((d) => Number(scores?.[d] ?? 0));
  const max = JUDGE_DIMENSIONS.length * 4;
  return Math.round((vals.reduce((a, b) => a + b, 0) / max) * 100);
}
