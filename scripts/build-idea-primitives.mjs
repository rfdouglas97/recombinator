#!/usr/bin/env node
/**
 * Build generalized idea primitives + per-company instances from normalized assignments.
 * Output: output/generator/idea-primitives.json
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadNormalizedAssignments } from './eval-utils.mjs';
import { buildPrimitivesBundle, IDEA_PRIMITIVES_PATH } from './idea-primitives-lib.mjs';

const OUT = IDEA_PRIMITIVES_PATH;

function main() {
  const assignments = loadNormalizedAssignments();
  if (!assignments.length) {
    console.error('No normalized assignments. Run: npm run verticals:normalize');
    process.exit(1);
  }

  const bundle = buildPrimitivesBundle(assignments);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bundle, null, 2));

  console.log(`Wrote ${bundle.instances.length} instances, ${bundle.primitive_types.length} primitive types`);
  console.log(`→ ${OUT}`);
  for (const t of bundle.primitive_types) {
    console.log(`  ${t.id}: ${t.instance_count} companies`);
  }
}

main();
