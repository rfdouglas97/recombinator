#!/usr/bin/env node
/**
 * Pick one primary business model for companies with dual BM tags.
 *
 * Usage:
 *   node agent/assign-primary-bm.mjs [--fresh] [--resume] [--limit N] [--concurrency 16]
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadDotEnv } from './env.mjs';
import { chatJson, resolveApiConfig } from './llm.mjs';
import { BM_LABELS, PHENOTYPE_TO_BM } from '../taxonomy/phenotype-to-bm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output/phenotypes');

const PATHS = {
  assignments: join(OUT, 'assignments.json'),
  jsonl: join(OUT, 'assignments.jsonl'),
  state: join(OUT, 'assign-primary-bm-state.json'),
  resultsJsonl: join(OUT, 'assign-primary-bm-results.jsonl'),
  log: join(OUT, 'assign-primary-bm-run.log'),
};

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

function log(msg) {
  console.log(msg);
  appendFileSync(PATHS.log, `[${new Date().toISOString()}] ${msg}\n`);
}

function loadAssignments() {
  const raw = JSON.parse(readFileSync(PATHS.assignments, 'utf8'));
  return (Array.isArray(raw) ? raw : Object.values(raw)).sort((a, b) => a.slug.localeCompare(b.slug));
}

function loadDoneFromResults() {
  const done = new Set();
  if (!existsSync(PATHS.resultsJsonl)) return done;
  for (const line of readFileSync(PATHS.resultsJsonl, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.slug) done.add(r.slug);
  }
  return done;
}

function loadState() {
  if (!existsSync(PATHS.state)) {
    return { processed_slugs: [], failed_slugs: [], started_at: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(PATHS.state, 'utf8'));
}

function saveState(state) {
  state.updated_at = new Date().toISOString();
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2));
}

function resolveAssignBmApiConfig(base) {
  return {
    ...base,
    model: process.env.ASSIGN_PRIMARY_BM_MODEL ?? process.env.CLASSIFICATION_RECLASSIFY_MODEL ?? 'claude-haiku-4-5-20251001',
    maxTokens: parseInt(process.env.ASSIGN_PRIMARY_BM_MAX_TOKENS ?? '1024', 10),
  };
}

function bmDefinitionsBlock(codes) {
  return codes
    .map((code) => `- ${code}: ${BM_LABELS[code] ?? code}`)
    .join('\n');
}

function primaryBmSystemPrompt() {
  const allDefs = Object.entries(BM_LABELS)
    .map(([code, label]) => `- ${code}: ${label}`)
    .join('\n');
  return `You assign exactly one primary business model (BM code) per YC startup for matrix placement.

Business model definitions:
${allDefs}

Rules:
- Pick exactly one code from the allowed list provided for each company.
- Prefer how the company primarily monetizes and delivers value today, not a secondary angle.
- Vertical AI SaaS (BM-01) = software product sold to a vertical; AI labor / managed service (BM-04) = human-in-loop or outsourced outcomes.
- AI devtools / infrastructure (BM-03) = sells to builders; not end-customer workflow software.

Respond with JSON: { "primary_bm": "BM-0X", "rationale": "one sentence" }`;
}

function primaryBmUserPrompt(company) {
  const allowed = company.business_models ?? [];
  const phenotypeAllowed = PHENOTYPE_TO_BM[company.phenotype_primary_id] ?? allowed;
  const choices = [...new Set([...allowed, ...phenotypeAllowed])];

  return `Company: ${company.name} (${company.slug})
Batch: ${company.batch}
One-liner: ${company.one_liner ?? ''}
Description: ${(company.description_combined ?? '').slice(0, 1200)}
Phenotype: ${company.phenotype_primary_id} (${company.phenotype_primary_label ?? ''})
Workflow vertical: ${company.vertical_id ?? company.canonical_vertical_id ?? 'n/a'} — ${company.vertical_label ?? ''}
Industry sub-vertical: ${company.industry_sub_vertical ?? ''}
YC industries: ${(company.yc_industries ?? []).join(' > ')}
Current dual tags: ${allowed.join(', ')}

Allowed BM codes (pick exactly one):
${bmDefinitionsBlock(choices)}`;
}

async function assignPrimaryBmOne(company, apiConfig) {
  const raw = await chatJson({
    system: primaryBmSystemPrompt(),
    user: primaryBmUserPrompt(company),
    apiConfig,
  });

  const chosen = raw.primary_bm ?? raw.business_models?.[0];
  if (!chosen || !BM_LABELS[chosen]) {
    throw new Error(`Invalid primary_bm ${chosen}; must be one of ${Object.keys(BM_LABELS).join(', ')}`);
  }

  return {
    primary_bm: chosen,
    business_models: [chosen],
    primary_bm_rationale: raw.rationale ?? null,
    primary_bm_assigned_at: new Date().toISOString(),
    primary_bm_method: 'assign_primary_bm_haiku',
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadDotEnv();
  const args = parseArgs();
  mkdirSync(OUT, { recursive: true });

  if (args.fresh) {
    if (existsSync(PATHS.log)) writeFileSync(PATHS.log, '');
    if (existsSync(PATHS.resultsJsonl)) unlinkSync(PATHS.resultsJsonl);
  }

  const apiConfig = resolveAssignBmApiConfig(resolveApiConfig());
  if (!apiConfig) {
    console.error('ANTHROPIC_API_KEY or OPENAI_API_KEY required');
    process.exit(1);
  }

  const assignments = loadAssignments();
  const bySlug = new Map(assignments.map((a) => [a.slug, a]));

  const dualSlugs = assignments
    .filter((a) => (a.business_models ?? []).length > 1)
    .map((a) => a.slug);

  const done = args.resume ? loadDoneFromResults() : new Set();
  const state = args.resume ? loadState() : { processed_slugs: [], failed_slugs: [], started_at: new Date().toISOString() };
  if (args.fresh) {
    state.processed_slugs = [];
    state.failed_slugs = [];
  }

  let queue = dualSlugs.filter((s) => !done.has(s));
  if (args.limit > 0) queue = queue.slice(0, args.limit);

  const concurrency =
    args.concurrency > 0
      ? args.concurrency
      : parseInt(process.env.ASSIGN_PRIMARY_BM_CONCURRENCY ?? '16', 10);

  log(
    `Assign primary BM | model=${apiConfig.model} | concurrency=${concurrency} | queue=${queue.length}/${dualSlugs.length} dual-BM`,
  );

  let ok = 0;
  let failed = 0;

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const batchNum = Math.floor(offset / concurrency) + 1;
    const batchTotal = Math.ceil(queue.length / concurrency);
    log(`\nBatch ${batchNum}/${batchTotal} (${batch.length})...`);

    const results = await Promise.all(
      batch.map(async (slug) => {
        const company = bySlug.get(slug);
        try {
          const patch = await assignPrimaryBmOne(company, apiConfig);
          return { slug, patch, error: null };
        } catch (err) {
          return { slug, patch: null, error: err.message };
        }
      }),
    );

    for (const { slug, patch, error } of results) {
      if (patch) {
        const updated = { ...bySlug.get(slug), ...patch };
        bySlug.set(slug, updated);
        appendFileSync(PATHS.resultsJsonl, JSON.stringify({ slug, ok: true, ...patch }) + '\n');
        appendFileSync(PATHS.jsonl, JSON.stringify(updated) + '\n');
        done.add(slug);
        state.processed_slugs.push(slug);
        state.failed_slugs = (state.failed_slugs ?? []).filter((s) => s !== slug);
        ok++;
        log(`  ✓ ${slug} → ${patch.primary_bm}`);
      } else {
        failed++;
        state.failed_slugs = [...new Set([...(state.failed_slugs ?? []), slug])];
        log(`  ✗ ${slug}: ${error}`);
      }
    }
    saveState(state);
    await sleep(args.resume ? 300 : 120);
  }

  const all = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  writeFileSync(PATHS.assignments, JSON.stringify(all, null, 2));

  const remainingDual = all.filter((a) => (a.business_models ?? []).length > 1).length;
  log(`\n✓ Assign primary BM: ${ok} ok, ${failed} failed`);
  log(`  Remaining dual-BM: ${remainingDual}`);
  log(`  Assignments: ${PATHS.assignments}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
