#!/usr/bin/env node
/**
 * Apply rule-based archetype refinement to all assignments (no LLM).
 * Appends revised rows to assignments.jsonl when phenotype/BM changes.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { loadOntology, findPhenotype } from '../agent/ontology.mjs';
import { refineArchetype } from '../taxonomy/infer-archetype.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSONL = join(ROOT, 'output/phenotypes/assignments.jsonl');
const ONTOLOGY = join(ROOT, 'output/phenotypes/ontology.json');
const SEEDS = join(ROOT, 'taxonomy/phenotype-seeds.json');

function main() {
  if (!existsSync(JSONL)) {
    console.error('Missing', JSONL);
    process.exit(1);
  }

  const ontology = loadOntology(ONTOLOGY, SEEDS);
  const bySlug = new Map();
  for (const line of readFileSync(JSONL, 'utf8').trim().split('\n').filter(Boolean)) {
    bySlug.set(JSON.parse(line).slug, JSON.parse(line));
  }

  let changed = 0;
  for (const [slug, row] of bySlug) {
    const refined = refineArchetype(row);
    const pheno = findPhenotype(ontology, refined.phenotype_primary_id);
    const next = {
      ...refined,
      phenotype_primary_label: pheno?.label ?? refined.phenotype_primary_label,
      phenotype_family: pheno?.family ?? refined.phenotype_family,
      method: refined.archetype_refined ? 'archetype_refine' : row.method,
      archetype_refined_at: refined.archetype_refined ? new Date().toISOString() : row.archetype_refined_at,
    };

    const same =
      next.phenotype_primary_id === row.phenotype_primary_id &&
      JSON.stringify(next.business_models ?? []) === JSON.stringify(row.business_models ?? []);

    if (!same) {
      appendFileSync(JSONL, `${JSON.stringify(next)}\n`);
      bySlug.set(slug, next);
      changed++;
      console.log(
        `  ${slug}: ${row.phenotype_primary_id} → ${next.phenotype_primary_id} (${(next.business_models ?? []).join(',')})`,
      );
    }
  }

  console.log(`\nArchetype refinement: ${changed} companies updated in jsonl`);
  execSync('node scripts/rebuild-assignments.mjs', { cwd: ROOT, stdio: 'inherit' });
  execSync('node normalize-verticals.mjs --write', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/build-explorer-data.mjs', { cwd: ROOT, stdio: 'inherit' });
}

main();
