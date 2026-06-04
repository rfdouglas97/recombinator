#!/usr/bin/env node
/**
 * Long-running phenotype discovery agent.
 * Iterates companies, assigns business archetypes (orthogonal to industry),
 * evolves ontology, builds phenotype × industry matrix.
 *
 * Modes:
 *   anthropic — LLM via Anthropic API (ANTHROPIC_API_KEY or .env)
 *   openai    — LLM via OpenAI API
 *   local     — keyword pattern matcher (no API)
 *
 * Usage:
 *   node agent/run.mjs
 *   node agent/run.mjs --mode anthropic --fresh
 *   node agent/run.mjs --mode anthropic --resume
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadDotEnv } from './env.mjs';
import { loadOntology, saveOntology, getOntologySummary, mergeProposals, findPhenotype } from './ontology.mjs';
import { chatJson, resolveApiConfig } from './llm.mjs';
import {
  companySystemPrompt,
  companyUserPrompt,
  reflectionSystemPrompt,
  reflectionUserPrompt,
} from './prompts.mjs';
import { classifyLocal } from './local-classifier.mjs';
import { buildMatrix } from './matrix.mjs';
import { normalizeLlmResult } from './normalize.mjs';
import { refineArchetype } from '../taxonomy/infer-archetype.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PATHS = {
  input: join(ROOT, 'output', 'yc_companies_classified.json'),
  outDir: join(ROOT, 'output', 'phenotypes'),
  seeds: join(ROOT, 'taxonomy', 'phenotype-seeds.json'),
  ontology: join(ROOT, 'output', 'phenotypes', 'ontology.json'),
  state: join(ROOT, 'output', 'phenotypes', 'state.json'),
  assignments: join(ROOT, 'output', 'phenotypes', 'assignments.json'),
  assignmentsJsonl: join(ROOT, 'output', 'phenotypes', 'assignments.jsonl'),
  matrix: join(ROOT, 'output', 'phenotypes', 'matrix.json'),
  patterns: join(ROOT, 'output', 'phenotypes', 'patterns.json'),
};

function parseArgs() {
  const args = {
    mode: null,
    limit: 0,
    resume: false,
    fresh: false,
    reflectEvery: 25,
    delayMs: 0,
    concurrency: 0,
    input: PATHS.input,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode' && argv[++i]) args.mode = argv[i];
    else if (a === '--limit' && argv[++i]) args.limit = parseInt(argv[i], 10);
    else if (a === '--resume') args.resume = true;
    else if (a === '--fresh') args.fresh = true;
    else if (a === '--reflect-every' && argv[++i]) args.reflectEvery = parseInt(argv[i], 10);
    else if (a === '--delay' && argv[++i]) args.delayMs = parseInt(argv[i], 10);
    else if (a === '--concurrency' && argv[++i]) args.concurrency = parseInt(argv[i], 10);
    else if (a === '--input' && argv[++i]) args.input = argv[i];
    else if (a === '--help') {
      console.log(`Usage: node agent/run.mjs [options]

Options:
  --mode anthropic|openai|local   Force mode (default: anthropic/openai if key in .env)
  --resume              Continue from checkpoint
  --fresh               Clear phenotype outputs and restart (backs up prior assignments)
  --limit <n>           Process at most N companies
  --reflect-every <n>   LLM ontology reflection interval (default: 25)
  --concurrency <n>     Parallel LLM calls (default: 8 anthropic, 12 local)
  --delay <ms>          Pause between batches (default: 0)
  --input <path>        Classified companies JSON
`);
      process.exit(0);
    }
  }
  return args;
}

function loadState() {
  if (!existsSync(PATHS.state)) {
    return { processed_slugs: [], patterns_log: [], started_at: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(PATHS.state, 'utf8'));
}

function saveState(state) {
  mkdirSync(dirname(PATHS.state), { recursive: true });
  state.updated_at = new Date().toISOString();
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2));
}

function loadAssignments() {
  if (!existsSync(PATHS.assignments)) return [];
  return JSON.parse(readFileSync(PATHS.assignments, 'utf8'));
}

function saveAssignments(assignments) {
  writeFileSync(PATHS.assignments, JSON.stringify(assignments, null, 2));
}

function appendAssignment(record) {
  appendFileSync(PATHS.assignmentsJsonl, JSON.stringify(record) + '\n');
}

function enrichAssignment(company, raw, ontology) {
  const pheno = findPhenotype(ontology, raw.phenotype_primary_id);
  return refineArchetype({
    slug: company.slug,
    name: company.name,
    website: company.website,
    yc_profile_url: company.yc_profile_url,
    batch: company.batch,
    one_liner: company.description?.one_liner,
    description_combined: company.description?.combined,
    industry_sub_vertical: raw.industry_sub_vertical,
    phenotype_primary_id: raw.phenotype_primary_id,
    phenotype_secondary_id: raw.phenotype_secondary_id ?? null,
    phenotype_primary_label: raw.phenotype_primary_label ?? pheno?.label,
    phenotype_family: pheno?.family ?? null,
    value_wedge: raw.value_wedge ?? pheno?.value_wedge,
    ai_application: raw.ai_application ?? pheno?.ai_application,
    ai_application_patterns: raw.ai_application_patterns ?? [],
    what_they_sell: raw.what_they_sell,
    ai_play: raw.ai_play,
    who_pays: raw.who_pays,
    confidence: raw.confidence,
    rationale: raw.rationale,
    proposed_phenotype: raw.proposed_phenotype ?? null,
    classified_at: new Date().toISOString(),
    method: raw.method ?? 'openai',
    yc_industries: company.yc_industries,
    yc_tags: company.yc_tags,
  });
}

async function classifyWithLlm(company, ontology, apiConfig) {
  const system = companySystemPrompt(getOntologySummary(ontology));
  const user = companyUserPrompt(company);
  const result = normalizeLlmResult(await chatJson({ system, user, apiConfig }), ontology);
  result.method = apiConfig.provider;
  return result;
}

async function runReflection(recent, ontology, apiConfig, state) {
  console.log(`\n  ⟳ Reflection on ${recent.length} recent assignments...`);
  try {
    const pending = recent.filter((a) => a.proposed_phenotype).map((a) => a.proposed_phenotype);
    const reflection = await chatJson({
      system: reflectionSystemPrompt(),
      user: reflectionUserPrompt(recent, pending),
      apiConfig,
    });

    mergeProposals(ontology, reflection.new_phenotypes);
    saveOntology(PATHS.ontology, ontology);

    state.patterns_log = state.patterns_log ?? [];
    state.patterns_log.push({
      at: new Date().toISOString(),
      patterns_observed: reflection.patterns_observed ?? [],
      merge_suggestions: reflection.merge_suggestions ?? [],
      notes: reflection.notes ?? '',
    });
    writeFileSync(PATHS.patterns, JSON.stringify(state.patterns_log, null, 2));
    console.log(`  ⟳ Patterns logged (${(reflection.patterns_observed ?? []).length} observed)`);
  } catch (err) {
    console.warn(`  ⟳ Reflection skipped: ${err.message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveConcurrency(args, mode) {
  if (args.concurrency > 0) return args.concurrency;
  const env = parseInt(process.env.PHENOTYPE_CONCURRENCY ?? '', 10);
  if (env > 0) return env;
  return isLlmMode(mode) ? 8 : 12;
}

function isLlmMode(mode) {
  return mode === 'anthropic' || mode === 'openai' || mode === 'llm';
}

function resetOutputs() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (existsSync(PATHS.assignments)) {
    writeFileSync(
      join(PATHS.outDir, `assignments.backup-${stamp}.json`),
      readFileSync(PATHS.assignments, 'utf8')
    );
  }
  for (const p of [PATHS.state, PATHS.assignments, PATHS.assignmentsJsonl, PATHS.patterns]) {
    if (existsSync(p)) unlinkSync(p);
  }
}

async function main() {
  loadDotEnv();
  const args = parseArgs();
  mkdirSync(PATHS.outDir, { recursive: true });

  if (args.fresh) resetOutputs();

  const apiConfig = resolveApiConfig();
  let mode = args.mode ?? (apiConfig?.provider === 'anthropic' ? 'anthropic' : apiConfig ? 'openai' : 'local');
  if (isLlmMode(mode) && !apiConfig) {
    console.warn('No ANTHROPIC_API_KEY or OPENAI_API_KEY — falling back to local pattern matching.');
    console.warn('Add credentials to .env or export ANTHROPIC_API_KEY\n');
    mode = 'local';
  }
  if (mode === 'openai' && apiConfig?.provider === 'anthropic') {
    mode = 'anthropic';
  }

  const raw = JSON.parse(readFileSync(args.input, 'utf8'));
  let companies = raw.companies ?? raw;
  if (args.limit > 0) companies = companies.slice(0, args.limit);

  const ontology = loadOntology(PATHS.ontology, PATHS.seeds);
  saveOntology(PATHS.ontology, ontology);

  const state = loadState();
  let assignments = args.resume ? loadAssignments() : [];
  const doneSet = new Set(args.resume ? state.processed_slugs : []);

  if (!args.resume && existsSync(PATHS.assignmentsJsonl)) {
    writeFileSync(PATHS.assignmentsJsonl, '');
  }

  const queue = companies.filter((c) => !doneSet.has(c.slug));
  const concurrency = resolveConcurrency(args, mode);
  const modelLabel = apiConfig?.model ?? 'n/a';
  let completed = assignments.length;
  console.log(
    `Phenotype agent | mode=${mode} | model=${modelLabel} | concurrency=${concurrency} | queue=${queue.length}/${companies.length} | ontology=${ontology.phenotypes.length} phenotypes`
  );

  let recentForReflection = [];

  async function classifyOne(company) {
    let rawResult;
    try {
      if (isLlmMode(mode)) {
        rawResult = await classifyWithLlm(company, ontology, apiConfig);
      } else {
        rawResult = classifyLocal(company, ontology);
      }
    } catch (err) {
      rawResult = classifyLocal(company, ontology);
      rawResult.rationale += ` (LLM failed: ${err.message})`;
      rawResult.method = 'local_fallback';
    }
    return { company, rawResult, record: enrichAssignment(company, rawResult, ontology) };
  }

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const batchNum = Math.floor(offset / concurrency) + 1;
    const batchTotal = Math.ceil(queue.length / concurrency);
    console.log(`\nBatch ${batchNum}/${batchTotal} (${batch.length} companies)...`);

    const results = await Promise.all(batch.map(classifyOne));

    for (const { rawResult, record } of results) {
      if (rawResult.proposed_phenotype) {
        mergeProposals(ontology, [rawResult.proposed_phenotype]);
      }
    }
    if (results.some((r) => r.rawResult.proposed_phenotype)) {
      saveOntology(PATHS.ontology, ontology);
    }

    for (const { record } of results) {
      completed += 1;
      assignments.push(record);
      appendAssignment(record);
      doneSet.add(record.slug);
      recentForReflection.push(record);
      console.log(
        `[${completed}/${companies.length}] ${record.slug} → ${record.phenotype_primary_id} × ${record.industry_sub_vertical}`
      );
    }

    state.processed_slugs = [...doneSet];
    saveAssignments(assignments);
    saveState(state);
    writeFileSync(PATHS.matrix, JSON.stringify(buildMatrix(assignments, ontology), null, 2));

    if (isLlmMode(mode) && recentForReflection.length >= args.reflectEvery) {
      await runReflection(recentForReflection, ontology, apiConfig, state);
      recentForReflection = [];
    }

    if (args.delayMs > 0) await sleep(args.delayMs);
  }

  if (isLlmMode(mode) && recentForReflection.length > 0) {
    await runReflection(recentForReflection, ontology, apiConfig, state);
  }

  const matrix = buildMatrix(assignments, ontology);
  writeFileSync(PATHS.matrix, JSON.stringify(matrix, null, 2));

  console.log('\n✓ Phenotype agent complete');
  console.log(`  Assignments: ${PATHS.assignments}`);
  console.log(`  Matrix:      ${PATHS.matrix}`);
  console.log(`  Ontology:    ${PATHS.ontology} (${ontology.phenotypes.length} phenotypes)`);
  console.log(`  Patterns:    ${PATHS.patterns}`);
  console.log(`\n  Matrix: ${matrix.summary.sparse_cell_count} filled cells, ${matrix.summary.empty_phenotype_rows} unused phenotype archetypes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
