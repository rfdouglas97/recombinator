/**
 * Step 1: Pick the most interesting whitespace gaps from ranked output.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import { INPUT, OUTPUT_DIR, timestampSlug } from './paths.mjs';
import { verticalDepth } from '../whitespace/lib/sharpness.mjs';
import { evaluatePairingValidity } from '../whitespace/lib/pairing-validity.mjs';

const ANALOG_TIER = { workflow: 3, industry: 2, vertical_tree: 1 };

export const DEFAULT_PICK = {
  top: 5,
  minOpportunity: 38,
  minDepth: 3,
  sector: '',
  requireRelevantAnalog: true,
};

function passesFilters(g, opts) {
  if (verticalDepth(g.vertical_id) < opts.minDepth) return false;
  if (g.opportunity_score < opts.minOpportunity) return false;
  if (opts.requireRelevantAnalog && g.flags?.includes('no_relevant_analog')) return false;
  if (g.flags?.includes('weak_analog') && g.opportunity_score < 42) return false;
  if (g.flags?.includes('catalog_bucket') || g.flags?.includes('generic_label')) return false;
  if (!evaluatePairingValidity(g).valid) return false;
  return true;
}

function analogTierScore(g) {
  return ANALOG_TIER[g.analog_match_tier] ?? 0;
}

function compareGaps(a, b) {
  const tierDiff = analogTierScore(b) - analogTierScore(a);
  if (tierDiff !== 0) return tierDiff;
  const oppDiff = b.opportunity_score - a.opportunity_score;
  if (oppDiff !== 0) return oppDiff;
  return a.rank - b.rank;
}

export function gapToShortlistEntry(g) {
  return {
    rank: g.rank,
    opportunity_score: g.opportunity_score,
    transfer_score: g.transfer_score,
    transfer_band: g.transfer_band,
    analog_match_tier: g.analog_match_tier ?? null,
    business_model: g.business_model,
    business_model_label: g.business_model_label,
    vertical_id: g.vertical_id,
    vertical_label: g.vertical_label,
    sector_id: g.sector_id,
    sector_label: g.sector_label,
    workflow: g.workflow ?? null,
    phenotype_primary_id: g.phenotype_primary_id,
    analog_slugs: g.analog_slugs ?? [],
    relevant_analogs: g.relevant_analogs ?? [],
    flags: g.flags ?? [],
    target_cell: {
      business_model: g.business_model,
      vertical_id: g.vertical_id,
      phenotype_primary_id: g.phenotype_primary_id,
    },
  };
}

/**
 * Load ranked gaps, filter to sharp wedges, sort by interest, return top N.
 */
export function pickInterestingWhitespace(options = {}) {
  const opts = { ...DEFAULT_PICK, ...options };
  const rankedPath = opts.rankedPath ?? INPUT.rankedGaps;

  if (!existsSync(rankedPath)) {
    throw new Error(`Missing ${rankedPath}\nRun: npm run whitespace:rank  (or npm run startup-engine:refresh)`);
  }

  const ranked = JSON.parse(readFileSync(rankedPath, 'utf8'));
  let gaps = (ranked.gaps ?? []).filter((g) => passesFilters(g, opts));

  if (opts.sector) {
    gaps = gaps.filter((g) => g.sector_id === opts.sector);
  }

  gaps.sort(compareGaps);
  const shortlist = gaps.slice(0, opts.top).map(gapToShortlistEntry);

  return {
    picked_at: new Date().toISOString(),
    source: rankedPath,
    ranking_version: ranked.ranking_version ?? null,
    filters: opts,
    shortlist,
  };
}

export function writeShortlist(pickResult, outPath = null) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const path = outPath ?? join(OUTPUT_DIR, `shortlist-${timestampSlug()}.json`);
  writeFileSync(path, JSON.stringify(pickResult, null, 2));
  return path;
}

export function loadShortlistFile(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return data.shortlist ?? data;
}
