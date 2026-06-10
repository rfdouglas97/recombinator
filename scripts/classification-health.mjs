#!/usr/bin/env node
/**
 * Classification data health checks — fails on dual business model tags.
 *
 * Usage:
 *   node scripts/classification-health.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadVerticalOntology } from '../taxonomy/verticals.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
};

function loadJson(path) {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function main() {
  const assignments = loadJson(PATHS.assignments);
  const normalized = loadJson(PATHS.normalized);
  const ontology = loadVerticalOntology();
  const verticalIds = new Set(ontology.verticals.map((v) => v.id));

  const dualBm = assignments.filter((a) => (a.business_models ?? []).length > 1);
  const missingBm = assignments.filter((a) => !(a.business_models ?? []).length);
  const unmappedVertical = normalized.filter(
    (a) => a.vertical_id && !verticalIds.has(a.vertical_id)
  );
  const noVertical = normalized.filter((a) => !a.vertical_id);

  console.log('\n=== Classification health ===');
  console.log(`Assignments: ${assignments.length}`);
  console.log(`Dual business_models: ${dualBm.length} (target 0)`);
  console.log(`Missing business_models: ${missingBm.length}`);
  console.log(`Unmapped vertical_id: ${unmappedVertical.length}`);
  console.log(`No vertical_id: ${noVertical.length}`);

  if (dualBm.length) {
    console.log('\nDual-BM slugs (first 10):');
    for (const a of dualBm.slice(0, 10)) {
      console.log(`  ${a.slug}: ${(a.business_models ?? []).join(', ')}`);
    }
  }

  let failed = false;
  if (dualBm.length > 0) {
    console.error(`\nFAIL: ${dualBm.length} companies still have multiple business_models`);
    failed = true;
  }
  if (missingBm.length > 0) {
    console.error(`\nFAIL: ${missingBm.length} companies missing business_models`);
    failed = true;
  }

  if (failed) process.exit(1);
  console.log('\nOK: classification health checks passed');
}

main();
