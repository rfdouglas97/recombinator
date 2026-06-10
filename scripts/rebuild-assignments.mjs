#!/usr/bin/env node
/**
 * Rebuild assignments.json + matrix.json from assignments.jsonl (latest record per slug).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { buildMatrix } from '../agent/matrix.mjs';
import { loadOntology } from '../agent/ontology.mjs';
import { refineArchetypeBatch } from '../taxonomy/infer-archetype.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  jsonl: join(ROOT, 'output/phenotypes/assignments.jsonl'),
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
  matrix: join(ROOT, 'output/phenotypes/matrix.json'),
  state: join(ROOT, 'output/phenotypes/state.json'),
  ontology: join(ROOT, 'output/phenotypes/ontology.json'),
  seeds: join(ROOT, 'taxonomy/phenotype-seeds.json'),
};

function main() {
  if (!existsSync(PATHS.jsonl)) {
    console.error('Missing', PATHS.jsonl);
    process.exit(1);
  }

  const lines = readFileSync(PATHS.jsonl, 'utf8').trim().split('\n').filter(Boolean);
  const bySlug = new Map();
  for (const line of lines) {
    const record = JSON.parse(line);
    bySlug.set(record.slug, record);
  }

  const assignments = refineArchetypeBatch([...bySlug.values()]).sort((a, b) =>
    a.slug.localeCompare(b.slug)
  );
  writeFileSync(PATHS.assignments, JSON.stringify(assignments, null, 2));

  const ontology = loadOntology(PATHS.ontology, PATHS.seeds);
  const matrix = buildMatrix(assignments, ontology);
  writeFileSync(PATHS.matrix, JSON.stringify(matrix, null, 2));

  const state = existsSync(PATHS.state)
    ? JSON.parse(readFileSync(PATHS.state, 'utf8'))
    : { patterns_log: [], started_at: new Date().toISOString() };
  state.processed_slugs = assignments.map((a) => a.slug);
  state.updated_at = new Date().toISOString();
  state.rebuilt_from_jsonl_at = new Date().toISOString();
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2));

  console.log('Rebuilt from jsonl:');
  console.log('  Unique companies:', assignments.length);
  console.log('  Jsonl lines read: ', lines.length);
  console.log('  Assignments:      ', PATHS.assignments);
  console.log('  Matrix cells:     ', matrix.summary.sparse_cell_count);
  console.log('  Phenotypes used:  ', matrix.summary.unique_phenotypes_used);
}

main();
