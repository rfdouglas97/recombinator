/**
 * Composite opportunity score v2 — rewards depth, workflow-matched proof, penalizes catalog buckets.
 */

import {
  computeAdjacency,
  computeAnalogStrength,
  computeSpecificity,
  computeSaturationPenalty,
  filterRelevantAnalogs,
  buildGapFlags,
} from './signals.mjs';
import { evaluateLabelSharpness } from './sharpness.mjs';

const WEIGHTS = {
  transfer: 0.2,
  analog: 0.35,
  specificity: 0.3,
  adjacency: 0.15,
};

/**
 * @returns {{
 *   opportunity_score: number,
 *   scores: object,
 *   flags: string[],
 *   analog_slugs: string[],
 *   workflow_matched_analog_slugs: string[],
 *   adjacent_cluster_slugs: string[],
 *   sharpness: object,
 *   reject_catalog: boolean,
 *   catalog_reason: string | null,
 * }}
 */
export function computeOpportunityForGap(ctx) {
  const {
    gap,
    cell,
    transferScore,
    ideaContext,
    adjacencyIndex,
    verticalOntology,
    verticalsWithCompanies,
    verticalBmOccupancy,
    allVerticalIds,
    observedCells,
  } = ctx;

  const sharpness = evaluateLabelSharpness(gap, verticalOntology);
  const relevantAnalogs = filterRelevantAnalogs(ideaContext, gap, verticalOntology);
  const analog_strength = computeAnalogStrength(relevantAnalogs, ideaContext);
  const adjacencyResult = computeAdjacency(gap, adjacencyIndex);
  const specificity = computeSpecificity(gap, verticalOntology);
  const saturation_penalty = computeSaturationPenalty(gap, observedCells, allVerticalIds);

  const transferNorm = Math.min(1, transferScore / 100) * (1 - sharpness.generic_score * 0.5);

  let raw =
    WEIGHTS.transfer * transferNorm +
    WEIGHTS.analog * analog_strength +
    WEIGHTS.adjacency * adjacencyResult.score +
    WEIGHTS.specificity * specificity;

  raw = Math.max(0, raw - saturation_penalty);

  const opportunity_score = Math.round(raw * 100);

  const flags = buildGapFlags({
    gap,
    verticalsWithCompanies,
    verticalBmOccupancy,
    allVerticalIds,
    transferScore,
    ideaContext,
    verticalOntology,
    relevantAnalogs,
    sharpness,
    adjacency: adjacencyResult,
  });

  const workflow_matched_analog_slugs = relevantAnalogs
    .filter((a) => a.tier === 'workflow')
    .map((a) => a.slug)
    .filter(Boolean);
  const analog_slugs = relevantAnalogs.map((a) => a.slug).filter(Boolean);
  const analog_match_tier = relevantAnalogs[0]?.tier ?? null;

  return {
    opportunity_score,
    scores: {
      analog_strength: Math.round(analog_strength * 100) / 100,
      adjacency: Math.round(adjacencyResult.score * 100) / 100,
      specificity,
      saturation_penalty,
      generic_score: sharpness.generic_score,
      transfer_adjusted: Math.round(transferNorm * 100) / 100,
    },
    flags,
    analog_slugs,
    workflow_matched_analog_slugs,
    analog_match_tier,
    relevant_analogs: relevantAnalogs,
    adjacent_cluster_slugs: adjacencyResult.slugs,
    adjacency_mode: adjacencyResult.mode,
    sharpness,
    reject_catalog: sharpness.reject,
    catalog_reason: sharpness.reason,
  };
}
