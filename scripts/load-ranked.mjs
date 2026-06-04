/**
 * Load gap-opportunity-ranked.json as a Map for generator-lib.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RANKED = join(ROOT, 'output/whitespace/gap-opportunity-ranked.json');

export function loadOpportunityRankIndex() {
  if (!existsSync(RANKED)) return null;
  const data = JSON.parse(readFileSync(RANKED, 'utf8'));
  const map = new Map();
  for (const g of data.gaps ?? []) {
    map.set(`${g.business_model}::${g.vertical_id}`, {
      ...g,
      vertical_depth: g.vertical_depth ?? String(g.vertical_id).split('.').filter(Boolean).length,
      has_relevant_analog: !(g.flags ?? []).includes('no_relevant_analog'),
    });
  }
  return map;
}
