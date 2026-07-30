#!/usr/bin/env node
/**
 * Repair companies mislabeled BM-02 by the silent phenotype-fallback bug.
 *
 * Before PHENOTYPE_TO_BM covered every ontology phenotype, unknown phenotype
 * ids defaulted to BM-02 ("Horizontal AI SaaS") with no warning — 181 records,
 * concentrated in Summer 2026. Targets records where business_models is
 * exactly ['BM-02'] but the (now-complete) mapping for their phenotype does
 * not allow BM-02, and re-picks the BM with the same LLM prompt the original
 * corpus used (agent/assign-primary-bm.mjs). Updates both assignment
 * snapshots via scripts/assignment-store.mjs.
 *
 * Usage:
 *   node scripts/repair-bm-fallback.mjs --dry-run
 *   node scripts/repair-bm-fallback.mjs --limit 5
 *   node scripts/repair-bm-fallback.mjs
 */

import { loadDotEnv } from '../agent/env.mjs';
import { resolveApiConfig } from '../agent/llm.mjs';
import { assignPrimaryBmOne, resolveAssignBmApiConfig } from '../agent/assign-primary-bm.mjs';
import { PHENOTYPE_TO_BM } from '../taxonomy/phenotype-to-bm.mjs';
import { loadAssignmentMaps, saveAssignmentMaps } from './assignment-store.mjs';

const CONCURRENCY = 16;

function parseArgs(argv) {
  const args = { dryRun: false, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

function isFallbackVictim(record) {
  if (!Array.isArray(record.business_models)) return false;
  if (record.business_models.length !== 1 || record.business_models[0] !== 'BM-02') return false;
  const allowed = PHENOTYPE_TO_BM[record.phenotype_primary_id];
  return Array.isArray(allowed) && !allowed.includes('BM-02');
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv);

  const { normalized, assignments } = loadAssignmentMaps();
  let targets = [...normalized.values()].filter(isFallbackVictim);

  console.log(`Fallback-mislabeled records: ${targets.length}`);
  const byBatch = new Map();
  for (const r of targets) byBatch.set(r.batch, (byBatch.get(r.batch) ?? 0) + 1);
  for (const [batch, n] of [...byBatch.entries()].sort()) console.log(`  ${batch}: ${n}`);

  if (args.dryRun) {
    for (const r of targets) {
      console.log(
        `  ${r.slug} [${r.batch}] ${r.phenotype_primary_id} → allowed ${(PHENOTYPE_TO_BM[r.phenotype_primary_id] ?? []).join('/')}`
      );
    }
    console.log('\n--dry-run: no changes made.');
    return;
  }

  if (args.limit > 0) targets = targets.slice(0, args.limit);

  const apiConfig = resolveAssignBmApiConfig(resolveApiConfig());
  if (!apiConfig) {
    console.error('ANTHROPIC_API_KEY or OPENAI_API_KEY required');
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;
  for (let offset = 0; offset < targets.length; offset += CONCURRENCY) {
    const batch = targets.slice(offset, offset + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (record) => {
        // Constrain the LLM to the phenotype's allowed codes by presenting
        // them as the current tags (assignPrimaryBmOne unions these with the
        // phenotype's own list).
        const candidate = {
          ...record,
          business_models: PHENOTYPE_TO_BM[record.phenotype_primary_id],
        };
        try {
          const patch = await assignPrimaryBmOne(candidate, apiConfig);
          return { slug: record.slug, patch, error: null };
        } catch (err) {
          return { slug: record.slug, patch: null, error: err.message };
        }
      })
    );

    for (const { slug, patch, error } of results) {
      if (patch) {
        normalized.set(slug, { ...normalized.get(slug), ...patch });
        if (assignments.has(slug)) assignments.set(slug, { ...assignments.get(slug), ...patch });
        ok++;
        console.log(`  ✓ ${slug} BM-02 → ${patch.primary_bm}`);
      } else {
        failed++;
        console.warn(`  ✗ ${slug}: ${error}`);
      }
    }
  }

  if (ok) saveAssignmentMaps({ normalized, assignments });
  console.log(`\nRepaired: ${ok} | Failed: ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
