#!/usr/bin/env node
/**
 * Tiered classification QA: cheap model screens everyone, Sonnet only on low confidence.
 *
 * Usage:
 *   node agent/tiered-audit.mjs [--fresh] [--resume] [--limit N] [--concurrency 12]
 *
 * Env:
 *   TIERED_TIER1_MODEL=claude-haiku-4-5-20251001   (default)
 *   TIERED_TIER2_MODEL=claude-sonnet-4-5-20250929 (default)
 *   TIERED_ESCALATE_BELOW=0.85                     classification_confidence threshold
 *   TIERED_FINTECH_ESCALATE_BELOW=0.92             stricter for fintech-insurance-ai-product
 *   TIERED_ESCALATE_MINOR_FIX=1                    escalate every minor_fix (expensive; default off)
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
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
  tieredAuditConfig,
  escalationReasons,
  shouldEscalate,
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

function mergeTieredResult(tier1, tier2, escalated, reasons) {
  const final = tier2 ?? tier1;
  return {
    ...final,
    audit_pipeline: 'tiered',
    escalated,
    escalation_reasons: reasons,
    tier1: {
      model: tier1.model,
      verdict: tier1.verdict,
      classification_confidence: tier1.classification_confidence,
      rationale: tier1.rationale,
    },
    tier2: tier2
      ? {
          model: tier2.model,
          verdict: tier2.verdict,
          classification_confidence: tier2.classification_confidence,
          rationale: tier2.rationale,
        }
      : null,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadDotEnv();
  const args = parseArgs();
  const cfg = tieredAuditConfig();
  mkdirSync(join(AUDIT_PATHS.audits, '..'), { recursive: true });

  const baseConfig = resolveApiConfig();
  if (!baseConfig) {
    console.error('ANTHROPIC_API_KEY required');
    process.exit(1);
  }

  const tier1Config = resolveAuditApiConfig(baseConfig, {
    model: cfg.tier1Model,
    maxTokens: parseInt(process.env.TIERED_TIER1_MAX_TOKENS ?? '2048', 10),
  });
  const tier2Config = resolveAuditApiConfig(baseConfig, {
    model: cfg.tier2Model,
    maxTokens: parseInt(process.env.TIERED_TIER2_MAX_TOKENS ?? '2048', 10),
  });

  const paths = {
    ...AUDIT_PATHS,
    state: AUDIT_PATHS.tieredState,
    log: AUDIT_PATHS.tieredLog,
  };

  if (args.fresh) {
    resetAuditOutputs(paths);
    writeFileSync(paths.log, '');
  }

  const ontology = loadOntology(
    join(ROOT, 'output/phenotypes/ontology.json'),
    join(ROOT, 'taxonomy/phenotype-seeds.json'),
  );
  const verticalOntology = loadVerticalOntology();
  const heuristicBm = loadHeuristicBmMap();
  const normalizedMap = loadNormalizedMap();
  const phenotypeCatalog = compactPhenotypeCatalog(ontology.phenotypes);

  let companies = loadAssignmentsFromJsonl().map((a) =>
    enrichCompany(a, normalizedMap, verticalOntology, heuristicBm),
  );
  if (args.limit > 0) companies = companies.slice(0, args.limit);

  const state = args.resume
    ? loadAuditState(paths.state)
    : {
        processed_slugs: [],
        audits: [],
        stats: { tier1_only: 0, escalated: 0, tier2_ok: 0, tier2_failed: 0 },
        started_at: new Date().toISOString(),
      };
  if (!args.resume) {
    state.processed_slugs = [];
    state.audits = [];
    state.stats = { tier1_only: 0, escalated: 0, tier2_ok: 0, tier2_failed: 0 };
  }
  state.stats ??= { tier1_only: 0, escalated: 0, tier2_ok: 0, tier2_failed: 0 };

  const done = new Set(state.processed_slugs);
  const queue = companies.filter((c) => !done.has(c.slug));
  const concurrency =
    args.concurrency > 0
      ? args.concurrency
      : parseInt(process.env.TIERED_AUDIT_CONCURRENCY ?? '12', 10);

  auditLog(
    `Tiered audit | tier1=${tier1Config.model} tier2=${tier2Config.model} | escalate_below=${cfg.escalateBelow} | queue=${queue.length}/${companies.length} | concurrency=${concurrency}`,
    paths.log,
  );

  const context = { phenotypeCatalog, verticalOntology, heuristicBm };

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const batchNum = Math.floor(offset / concurrency) + 1;
    const batchTotal = Math.ceil(queue.length / concurrency);
    auditLog(`\nBatch ${batchNum}/${batchTotal} (${batch.length})...`, paths.log);

    const results = await Promise.all(
      batch.map(async (company) => {
        let tier1;
        try {
          tier1 = await auditOne(company, context, tier1Config);
        } catch (err) {
          tier1 = {
            slug: company.slug,
            name: company.name,
            verdict: 'minor_fix',
            severity: 2,
            classification_confidence: 0.5,
            issues: [{ field: 'audit', problem: err.message, suggested: null }],
            rationale: `Tier-1 failed: ${err.message}`,
            current: { phenotype_primary_id: company.phenotype_primary_id },
            audited_at: new Date().toISOString(),
            model: tier1Config.model,
            error: true,
          };
        }

        const reasons = escalationReasons(tier1, company, cfg);
        if (!shouldEscalate(tier1, company, cfg)) {
          return { audit: mergeTieredResult(tier1, null, false, []), escalated: false };
        }

        try {
          const tier2 = await auditOne(company, context, tier2Config);
          return { audit: mergeTieredResult(tier1, tier2, true, reasons), escalated: true };
        } catch (err) {
          state.stats.tier2_failed++;
          return {
            audit: mergeTieredResult(tier1, null, true, [...reasons, 'tier2_error']),
            escalated: true,
            tier2Error: err.message,
          };
        }
      }),
    );

    for (const { audit, escalated, tier2Error } of results) {
      state.audits.push(audit);
      state.processed_slugs.push(audit.slug);
      done.add(audit.slug);
      appendFileSync(paths.auditsJsonl, `${JSON.stringify(audit)}\n`);

      if (escalated) {
        state.stats.escalated++;
        const flag = audit.verdict === 'ok' ? '✓' : audit.verdict === 'wrong' ? '✗' : '~';
        auditLog(
          `  ↑ ${flag} ${audit.slug}: tier2 ${audit.verdict} (conf ${audit.classification_confidence?.toFixed(2)})${tier2Error ? ` [tier2 err: ${tier2Error}]` : ''}`,
          paths.log,
        );
      } else {
        state.stats.tier1_only++;
        const flag = audit.verdict === 'ok' ? '✓' : audit.verdict === 'wrong' ? '✗' : '~';
        auditLog(
          `  · ${flag} ${audit.slug}: tier1 only ${audit.verdict} (conf ${audit.classification_confidence?.toFixed(2)})`,
          paths.log,
        );
      }
    }

    saveAuditState(state, paths);
    await sleep(100);
  }

  const escalatedPct = companies.length
    ? ((state.stats.escalated / companies.length) * 100).toFixed(1)
    : '0';
  auditLog('\n✓ Tiered audit complete', paths.log);
  auditLog(`  tier1_only=${state.stats.tier1_only} escalated=${state.stats.escalated} (${escalatedPct}%)`, paths.log);
  auditLog(`  tier2_failed=${state.stats.tier2_failed}`, paths.log);
  auditLog(`  Output: ${paths.audits}`, paths.log);
  auditLog('\nNext: npm run audit:reclassify && npm run audit:review', paths.log);

  writeFileSync(
    AUDIT_PATHS.audits,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        pipeline: 'tiered',
        tier1_model: cfg.tier1Model,
        tier2_model: cfg.tier2Model,
        stats: state.stats,
        audits: state.audits,
      },
      null,
      2,
    ),
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
