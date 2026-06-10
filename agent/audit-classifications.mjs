#!/usr/bin/env node
/**
 * LLM QA audit of phenotype + vertical + BM classifications.
 *
 * Usage:
 *   node agent/audit-classifications.mjs [--resume] [--fresh] [--limit N] [--concurrency 8]
 *
 * Prefer cheaper screening: npm run audit:tiered
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadDotEnv } from './env.mjs';
import { resolveApiConfig } from './llm.mjs';
import { loadOntology } from './ontology.mjs';
import { loadVerticalOntology } from '../taxonomy/verticals.mjs';
import {
  AUDIT_PATHS,
  auditLog,
  loadAssignmentsFromJsonl,
  loadNormalizedMap,
  loadHeuristicBmMap,
  enrichCompany,
  auditOne,
  resolveAuditApiConfig,
  loadAuditState,
  saveAuditState,
  resetAuditOutputs,
  compactPhenotypeCatalog,
} from './audit-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const args = { resume: false, fresh: false, limit: 0, concurrency: 0 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') args.resume = true;
    else if (a === '--fresh') args.fresh = true;
    else if (a === '--limit' && argv[++i]) args.limit = parseInt(argv[i], 10);
    else if (a === '--concurrency' && argv[++i]) args.concurrency = parseInt(argv[i], 10);
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadDotEnv();
  const args = parseArgs();
  mkdirSync(join(ROOT, 'output/audit'), { recursive: true });

  const baseConfig = resolveApiConfig();
  if (!baseConfig) {
    console.error('ANTHROPIC_API_KEY required');
    process.exit(1);
  }
  const apiConfig = resolveAuditApiConfig(baseConfig);

  if (args.fresh) resetAuditOutputs();

  const ontology = loadOntology(
    join(ROOT, 'output/phenotypes/ontology.json'),
    join(ROOT, 'taxonomy/phenotype-seeds.json')
  );
  const verticalOntology = loadVerticalOntology();
  const heuristicBm = loadHeuristicBmMap();
  const normalizedMap = loadNormalizedMap();
  const phenotypeCatalog = compactPhenotypeCatalog(ontology.phenotypes);

  let companies = loadAssignmentsFromJsonl().map((a) =>
    enrichCompany(a, normalizedMap, verticalOntology, heuristicBm)
  );
  if (args.limit > 0) companies = companies.slice(0, args.limit);

  const state = args.resume
    ? loadAuditState()
    : { processed_slugs: [], audits: [], started_at: new Date().toISOString() };
  if (!args.resume) {
    state.processed_slugs = [];
    state.audits = [];
  }

  const done = new Set(state.processed_slugs);
  const queue = companies.filter((c) => !done.has(c.slug));
  const concurrency =
    args.concurrency > 0
      ? args.concurrency
      : parseInt(process.env.CLASSIFICATION_AUDIT_CONCURRENCY ?? '8', 10);

  auditLog(
    `Classification audit | model=${apiConfig.model} | concurrency=${concurrency} | queue=${queue.length}/${companies.length}`
  );

  const context = { phenotypeCatalog, verticalOntology, heuristicBm };
  let ok = 0,
    minor = 0,
    wrong = 0;

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const batchNum = Math.floor(offset / concurrency) + 1;
    const batchTotal = Math.ceil(queue.length / concurrency);
    auditLog(`\nBatch ${batchNum}/${batchTotal} (${batch.length} companies)...`);

    const results = await Promise.all(
      batch.map(async (company) => {
        try {
          const audit = await auditOne(company, context, apiConfig);
          return { audit, error: null };
        } catch (err) {
          return {
            audit: {
              slug: company.slug,
              name: company.name,
              verdict: 'minor_fix',
              severity: 2,
              classification_confidence: 0.5,
              issues: [{ field: 'audit', problem: err.message, suggested: null }],
              rationale: `Audit failed: ${err.message}`,
              current: { phenotype_primary_id: company.phenotype_primary_id },
              audited_at: new Date().toISOString(),
              model: apiConfig.model,
              error: true,
            },
            error: err.message,
          };
        }
      })
    );

    for (const { audit, error } of results) {
      state.audits.push(audit);
      state.processed_slugs.push(audit.slug);
      done.add(audit.slug);
      appendFileSync(AUDIT_PATHS.auditsJsonl, `${JSON.stringify(audit)}\n`);

      if (audit.verdict === 'ok') ok++;
      else if (audit.verdict === 'wrong') wrong++;
      else minor++;

      const flag = audit.verdict === 'ok' ? '✓' : audit.verdict === 'wrong' ? '✗' : '~';
      const conf = audit.classification_confidence?.toFixed(2) ?? '?';
      auditLog(
        `  ${flag} ${audit.slug}: ${audit.verdict} (conf ${conf})${error ? ` (${error})` : ''}`
      );
    }

    saveAuditState(state);
    await sleep(150);
  }

  auditLog('\n✓ Classification audit complete');
  auditLog(`  ok=${ok} minor_fix=${minor} wrong=${wrong}`);
  auditLog(`  Output: ${AUDIT_PATHS.audits}`);
  auditLog('\nRun: npm run audit:review');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
