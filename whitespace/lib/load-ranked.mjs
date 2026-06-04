import { existsSync, readFileSync } from 'fs';

import { OUTPUT_PATHS } from './paths.mjs';

/** @returns {Map<string, { opportunity_score: number, rank: number, transfer_score: number }> | null} */
export function loadOpportunityRankIndex() {
  if (!existsSync(OUTPUT_PATHS.ranked)) return null;
  const doc = JSON.parse(readFileSync(OUTPUT_PATHS.ranked, 'utf8'));
  const map = new Map();
  for (const g of doc.gaps ?? []) {
    map.set(`${g.business_model}::${g.vertical_id}`, {
      opportunity_score: g.opportunity_score,
      rank: g.rank,
      transfer_score: g.transfer_score,
    });
  }
  return map;
}
