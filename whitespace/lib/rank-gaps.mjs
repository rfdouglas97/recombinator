/**
 * Rank gap-candidates v2: exclude catalog buckets; prefer depth + workflow-matched analogs.
 */

import { computeGapTransferScore } from '../../scripts/goodness-rubric.mjs';
import { getIdeaContextForCell } from '../../scripts/idea-primitives-lib.mjs';

import {
  loadGaps,
  loadObservedCells,
  loadAssignments,
  loadVerticalOntology,
  loadKillList,
  loadPhenotypeOntology,
} from './loaders.mjs';
import { evaluateKillList } from './kill-list.mjs';
import { inferPhenotypeForGap } from './phenotype.mjs';
import { verticalDepth } from './sharpness.mjs';
import {
  buildVerticalsWithCompanies,
  buildVerticalBmOccupancy,
  buildAdjacencyIndex,
} from './signals.mjs';
import { computeOpportunityForGap } from './opportunity-score.mjs';
import { evaluatePairingValidity } from './pairing-validity.mjs';

function gapSortKey(a, b) {
  if (b.opportunity_score !== a.opportunity_score) {
    return b.opportunity_score - a.opportunity_score;
  }
  const depthDiff = verticalDepth(b.vertical_id) - verticalDepth(a.vertical_id);
  if (depthDiff !== 0) return depthDiff;
  const analogDiff =
    (b.workflow_matched_analog_slugs?.length ?? 0) - (a.workflow_matched_analog_slugs?.length ?? 0);
  if (analogDiff !== 0) return analogDiff;
  return (a.vertical_label ?? a.vertical_id).localeCompare(b.vertical_label ?? b.vertical_id);
}

function formatRankedRow(gap, cell, transfer, opportunity, phenotypeId) {
  return {
    business_model: gap.business_model,
    business_model_label: gap.business_model_label,
    vertical_id: gap.vertical_id,
    vertical_label: gap.vertical_label,
    sector_id: gap.sector_id,
    sector_label: gap.sector_label,
    industry_label: gap.industry_label,
    workflow: gap.workflow ?? null,
    vertical_depth: verticalDepth(gap.vertical_id),
    phenotype_primary_id: phenotypeId,
    transfer_score: transfer.transfer_score,
    transfer_band: transfer.transfer_band,
    opportunity_score: opportunity.opportunity_score,
    scores: opportunity.scores,
    flags: opportunity.flags,
    analog_slugs: opportunity.analog_slugs,
    workflow_matched_analog_slugs: opportunity.workflow_matched_analog_slugs,
    analog_match_tier: opportunity.analog_match_tier ?? null,
    relevant_analogs: opportunity.relevant_analogs ?? [],
    adjacent_cluster_slugs: opportunity.adjacent_cluster_slugs,
    adjacency_mode: opportunity.adjacency_mode ?? null,
    ranking_version: 'v2',
  };
}

export function rankAllGaps() {
  const gaps = loadGaps();
  const observedCells = loadObservedCells();
  const assignments = loadAssignments();
  const verticalOntology = loadVerticalOntology();
  const killList = loadKillList();
  const phenotypeOntology = loadPhenotypeOntology();

  const verticalsWithCompanies = buildVerticalsWithCompanies(observedCells);
  const verticalBmOccupancy = buildVerticalBmOccupancy(observedCells);
  const allVerticalIds = verticalOntology.verticals.map((v) => v.id);
  const adjacencyIndex = buildAdjacencyIndex(observedCells, phenotypeOntology);

  const ranked = [];
  const rejected = [];

  for (const gap of gaps) {
    const phenotypeId = inferPhenotypeForGap(gap);
    const cell = {
      business_model: gap.business_model,
      vertical_id: gap.vertical_id,
      phenotype_primary_id: phenotypeId,
    };

    const ideaContext = getIdeaContextForCell(cell, { assignments });
    const transfer = computeGapTransferScore(cell, { verticalOntology, ideaContext });

    const opportunity = computeOpportunityForGap({
      gap,
      cell,
      transferScore: transfer.transfer_score,
      ideaContext,
      adjacencyIndex,
      verticalOntology,
      verticalsWithCompanies,
      verticalBmOccupancy,
      allVerticalIds,
      observedCells,
    });

    const row = formatRankedRow(gap, cell, transfer, opportunity, phenotypeId);

    const vertical = verticalOntology.verticals.find((v) => v.id === gap.vertical_id) ?? null;
    const pairing = evaluatePairingValidity(gap, { phenotypeId, vertical });
    if (!pairing.valid) {
      rejected.push({
        ...row,
        kill_reason: pairing.reason,
        flags: [...row.flags, 'bogus_pairing'],
      });
      continue;
    }

    const kill = evaluateKillList(gap, killList);
    if (kill.killed) {
      rejected.push({ ...row, kill_reason: kill.reason, flags: [...row.flags, 'kill_match'] });
      continue;
    }

    if (opportunity.reject_catalog) {
      rejected.push({
        ...row,
        kill_reason: opportunity.catalog_reason ?? 'generic_catalog',
        flags: [...row.flags, 'catalog_bucket'],
      });
      continue;
    }

    ranked.push(row);
  }

  ranked.sort(gapSortKey);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    gap_count: gaps.length,
    ranked_count: ranked.length,
    rejected_count: rejected.length,
    ranking_version: 'v2',
    gaps: ranked,
    rejected,
  };
}

export function buildSectorSummary(rankedGaps, topPerSector = 50) {
  const bySector = new Map();

  for (const g of rankedGaps) {
    if (!bySector.has(g.sector_id)) {
      bySector.set(g.sector_id, {
        sector_id: g.sector_id,
        sector_label: g.sector_label,
        gap_count_in_ranked: 0,
        avg_opportunity_score: 0,
        avg_transfer_score: 0,
        top_gaps: [],
      });
    }
    const s = bySector.get(g.sector_id);
    s.gap_count_in_ranked++;
    s._oppSum = (s._oppSum ?? 0) + g.opportunity_score;
    s._trSum = (s._trSum ?? 0) + g.transfer_score;
  }

  for (const g of rankedGaps) {
    const s = bySector.get(g.sector_id);
    if (s.top_gaps.length < topPerSector) s.top_gaps.push(g);
  }

  const sectors = [...bySector.values()].map((s) => {
    const n = s.gap_count_in_ranked || 1;
    return {
      sector_id: s.sector_id,
      sector_label: s.sector_label,
      gap_count_in_ranked: s.gap_count_in_ranked,
      avg_opportunity_score: Math.round((s._oppSum ?? 0) / n),
      avg_transfer_score: Math.round((s._trSum ?? 0) / n),
      top_gaps: s.top_gaps.map(
        ({
          rank,
          vertical_id,
          vertical_label,
          business_model,
          opportunity_score,
          transfer_score,
          flags,
          workflow_matched_analog_slugs,
        }) => ({
          rank,
          vertical_id,
          vertical_label,
          business_model,
          opportunity_score,
          transfer_score,
          flags,
          workflow_matched_analog_slugs,
        })
      ),
    };
  });

  sectors.sort((a, b) => b.avg_opportunity_score - a.avg_opportunity_score);
  return { sectors, top_per_sector: topPerSector, ranking_version: 'v2' };
}
