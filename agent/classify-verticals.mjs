#!/usr/bin/env node
/**
 * LLM vertical classification for all companies (constrained candidate shortlist).
 *
 * Usage:
 *   node agent/classify-verticals.mjs [--fresh] [--resume] [--limit N] [--concurrency 8]
 *   node agent/classify-verticals.mjs --skip-pipeline   # no normalize/bundle refresh
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { loadDotEnv } from './env.mjs';
import { chatJson, resolveApiConfig } from './llm.mjs';
import { classifyVerticalsSystemPrompt, classifyVerticalsUserPrompt } from './classify-verticals-prompts.mjs';
import { verticalCandidatesForCompany } from './vertical-candidates.mjs';
import {
  loadVerticalOntology,
  getVerticalById,
  inferPropertyCasualtyInsuranceVertical,
} from '../taxonomy/verticals.mjs';
import { SLUG_VERTICAL_OVERRIDES } from '../taxonomy/verticals-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output/verticals');

const PATHS = {
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
  jsonl: join(ROOT, 'output/phenotypes/assignments.jsonl'),
  state: join(OUT, 'classify-verticals-state.json'),
  resultsJsonl: join(OUT, 'classify-verticals-results.jsonl'),
  log: join(OUT, 'classify-verticals-run.log'),
};

function parseArgs() {
  const args = {
    resume: false,
    fresh: false,
    limit: 0,
    concurrency: 0,
    skipPipeline: false,
    maxCandidates: 40,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') args.resume = true;
    else if (a === '--fresh') args.fresh = true;
    else if (a === '--skip-pipeline') args.skipPipeline = true;
    else if (a === '--limit' && argv[++i]) args.limit = parseInt(argv[i], 10);
    else if (a === '--concurrency' && argv[++i]) args.concurrency = parseInt(argv[i], 10);
    else if (a === '--max-candidates' && argv[++i]) args.maxCandidates = parseInt(argv[i], 10);
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

function resolveClassifyApiConfig(base) {
  return {
    ...base,
    model: process.env.VERTICAL_CLASSIFY_MODEL ?? process.env.CLASSIFICATION_RECLASSIFY_MODEL ?? 'claude-haiku-4-5-20251001',
    maxTokens: parseInt(process.env.VERTICAL_CLASSIFY_MAX_TOKENS ?? '2048', 10),
  };
}

function mergeVerticalIntoAssignment(company, raw, verticalOntology) {
  const vert = getVerticalById(raw.vertical_id, verticalOntology);
  if (!vert) throw new Error(`vertical_id not in ontology: ${raw.vertical_id}`);

  return {
    ...company,
    industry_sub_vertical: raw.industry_sub_vertical?.trim() || company.industry_sub_vertical,
    canonical_vertical_id: vert.id,
    vertical_id: vert.id,
    vertical_label: vert.label,
    vertical_sector_id: vert.sector_id,
    vertical_classify_confidence: raw.confidence ?? null,
    vertical_classify_rationale: raw.rationale ?? null,
    vertical_classified_at: new Date().toISOString(),
    vertical_method: 'llm_vertical',
    vertical_classified_from: {
      vertical_id: company.vertical_id ?? company.canonical_vertical_id ?? null,
      industry_sub_vertical: company.industry_sub_vertical ?? null,
    },
  };
}

async function classifyOne(company, verticalOntology, apiConfig, maxCandidates) {
  const candidates = verticalCandidatesForCompany(company, verticalOntology, { maxCandidates });
  if (candidates.length < 3) throw new Error(`Too few vertical candidates (${candidates.length})`);

  const raw = await chatJson({
    system: classifyVerticalsSystemPrompt(),
    user: classifyVerticalsUserPrompt({ company, verticalCandidates: candidates }),
    apiConfig,
  });

  if (!raw.vertical_id) throw new Error('Missing vertical_id in LLM response');
  const candidateIds = new Set(candidates.map((v) => v.id));
  if (!candidateIds.has(raw.vertical_id)) {
    throw new Error(`vertical_id ${raw.vertical_id} not in candidate list`);
  }

  const slugOverride = SLUG_VERTICAL_OVERRIDES[company.slug];
  if (slugOverride) raw.vertical_id = slugOverride;

  const pc = inferPropertyCasualtyInsuranceVertical({
    industry_sub_vertical: raw.industry_sub_vertical ?? company.industry_sub_vertical,
    one_liner: company.one_liner,
    description_combined: company.description_combined,
  });
  if (
    pc?.vertical_id &&
    candidateIds.has(pc.vertical_id) &&
    raw.vertical_id === 'healthcare.payer.claims'
  ) {
    raw.vertical_id = pc.vertical_id;
    raw.rationale = `${raw.rationale ?? ''} [Corrected P&C insurance leaf vs health payer.]`.trim();
  }

  return mergeVerticalIntoAssignment(company, raw, verticalOntology);
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

  const apiConfig = resolveClassifyApiConfig(resolveApiConfig());
  if (!apiConfig) {
    console.error('ANTHROPIC_API_KEY or OPENAI_API_KEY required');
    process.exit(1);
  }

  const verticalOntology = loadVerticalOntology();
  const assignments = loadAssignments();
  const bySlug = new Map(assignments.map((a) => [a.slug, a]));

  const done = args.resume ? loadDoneFromResults() : new Set();
  const state = args.resume ? loadState() : { processed_slugs: [], failed_slugs: [], started_at: new Date().toISOString() };
  if (args.fresh) {
    state.processed_slugs = [];
    state.failed_slugs = [];
  }

  let queue = assignments.map((a) => a.slug).filter((s) => !done.has(s));
  if (args.limit > 0) queue = queue.slice(0, args.limit);

  const concurrency =
    args.concurrency > 0
      ? args.concurrency
      : parseInt(process.env.VERTICAL_CLASSIFY_CONCURRENCY ?? '8', 10);

  log(
    `Classify verticals | model=${apiConfig.model} | concurrency=${concurrency} | queue=${queue.length}/${assignments.length}`,
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
          const updated = await classifyOne(company, verticalOntology, apiConfig, args.maxCandidates);
          return { slug, updated, error: null };
        } catch (err) {
          return { slug, updated: null, error: err.message };
        }
      }),
    );

    for (const { slug, updated, error } of results) {
      if (updated) {
        bySlug.set(slug, updated);
        appendFileSync(PATHS.resultsJsonl, JSON.stringify({ slug, ok: true, ...updated }) + '\n');
        appendFileSync(PATHS.jsonl, JSON.stringify(updated) + '\n');
        done.add(slug);
        state.processed_slugs.push(slug);
        state.failed_slugs = (state.failed_slugs ?? []).filter((s) => s !== slug);
        ok++;
        log(`  ✓ ${slug} → ${updated.vertical_id} | ${updated.industry_sub_vertical?.slice(0, 55)}`);
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

  log(`\n✓ Vertical classify: ${ok} ok, ${failed} failed`);
  log(`  Assignments: ${PATHS.assignments}`);

  if (!args.skipPipeline && ok > 0) {
    log('\nRefreshing pipeline (LLM verticals are canonical; keyword normalize is validation-only)...');
    execSync('node normalize-verticals.mjs --write --gaps', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-explorer-data.mjs', { cwd: ROOT, stdio: 'inherit' });
    log('Pipeline refresh done.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
