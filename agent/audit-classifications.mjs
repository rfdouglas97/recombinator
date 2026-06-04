#!/usr/bin/env node
/**
 * LLM QA audit of phenotype + vertical + BM classifications (Haiku by default).
 *
 * Usage:
 *   node agent/audit-classifications.mjs [--resume] [--fresh] [--limit N] [--concurrency 8]
 *   node agent/audit-classifications.mjs --apply-minor   # apply minor_fix suggestions (optional)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadDotEnv } from './env.mjs';
import { chatJson, resolveApiConfig } from './llm.mjs';
import { auditSystemPrompt, auditUserPrompt, compactPhenotypeCatalog } from './audit-prompts.mjs';
import { loadOntology } from './ontology.mjs';
import { loadVerticalOntology, normalizeVertical } from '../taxonomy/verticals.mjs';
import { PHENOTYPE_TO_BM } from '../taxonomy/phenotype-to-bm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output/audit');

const PATHS = {
  jsonl: join(ROOT, 'output/phenotypes/assignments.jsonl'),
  classified: join(ROOT, 'output/yc_companies_classified.json'),
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
  ontology: join(ROOT, 'output/phenotypes/ontology.json'),
  seeds: join(ROOT, 'taxonomy/phenotype-seeds.json'),
  state: join(OUT, 'audit-state.json'),
  audits: join(OUT, 'classification-audits.json'),
  auditsJsonl: join(OUT, 'classification-audits.jsonl'),
  log: join(OUT, 'audit-run.log'),
};

function parseArgs() {
  const args = { resume: false, fresh: false, limit: 0, concurrency: 0, applyMinor: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') args.resume = true;
    else if (a === '--fresh') args.fresh = true;
    else if (a === '--apply-minor') args.applyMinor = true;
    else if (a === '--limit' && argv[++i]) args.limit = parseInt(argv[i], 10);
    else if (a === '--concurrency' && argv[++i]) args.concurrency = parseInt(argv[i], 10);
  }
  return args;
}

function log(msg) {
  console.log(msg);
  appendFileSync(PATHS.log, `[${new Date().toISOString()}] ${msg}\n`);
}

function loadAssignmentsFromJsonl() {
  if (!existsSync(PATHS.jsonl)) return [];
  const bySlug = new Map();
  for (const line of readFileSync(PATHS.jsonl, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    bySlug.set(r.slug, r);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function loadNormalizedMap() {
  if (!existsSync(PATHS.normalized)) return new Map();
  const rows = JSON.parse(readFileSync(PATHS.normalized, 'utf8'));
  return new Map(rows.map((r) => [r.slug, r]));
}

function loadHeuristicBmMap() {
  if (!existsSync(PATHS.classified)) return new Map();
  const data = JSON.parse(readFileSync(PATHS.classified, 'utf8'));
  const companies = data.companies ?? data;
  const map = new Map();
  for (const c of companies) {
    const code =
      c.taxonomy?.business_model_primary ??
      c.taxonomy?.business_model?.code ??
      c.taxonomy?.business_model;
    if (code) map.set(c.slug, code);
  }
  return map;
}

function enrichCompany(assignment, normalizedMap, verticalOntology, heuristicBm) {
  const norm = normalizedMap.get(assignment.slug);
  let vertical_id = norm?.vertical_id ?? null;
  let vertical_label = norm?.vertical_label ?? null;
  let vertical_sector_id = norm?.vertical_sector_id ?? null;
  let vertical_normalize_method = norm?.vertical_normalize_method ?? null;
  let vertical_normalize_confidence = norm?.vertical_normalize_confidence ?? null;
  let business_models = norm?.business_models ?? [];

  if (!vertical_id) {
    const n = normalizeVertical(
      { industry_sub_vertical: assignment.industry_sub_vertical, yc_industries: assignment.yc_industries },
      verticalOntology,
    );
    vertical_id = n.vertical_id;
    vertical_label = n.vertical?.label ?? null;
    vertical_sector_id = n.vertical?.sector_id ?? null;
    vertical_normalize_method = n.method;
    vertical_normalize_confidence = n.confidence;
  }

  if (!business_models.length) {
    const h = heuristicBm.get(assignment.slug);
    if (h) business_models = [h];
    else if (PHENOTYPE_TO_BM[assignment.phenotype_primary_id]) {
      business_models = PHENOTYPE_TO_BM[assignment.phenotype_primary_id];
    } else {
      business_models = ['BM-02'];
    }
  }

  return {
    ...assignment,
    vertical_id,
    vertical_label,
    vertical_sector_id,
    vertical_normalize_method,
    vertical_normalize_confidence,
    business_models,
    heuristic_business_model: heuristicBm.get(assignment.slug) ?? null,
  };
}

function verticalCandidatesFor(company, verticalOntology) {
  const verts = verticalOntology.verticals ?? [];
  const sectorId = company.vertical_sector_id;
  let pool = sectorId ? verts.filter((v) => v.sector_id === sectorId) : verts;

  if (pool.length > 30) {
    const current = company.vertical_id;
    const scored = pool.map((v) => {
      let score = 0;
      if (v.id === current) score += 10;
      if (company.industry_sub_vertical && v.label) {
        const words = company.industry_sub_vertical.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
        const label = v.label.toLowerCase();
        score += words.filter((w) => label.includes(w)).length;
      }
      return { v, score };
    });
    scored.sort((a, b) => b.score - a.score);
    pool = scored.slice(0, 28).map((x) => x.v);
    if (current && !pool.some((v) => v.id === current)) {
      const cur = verts.find((v) => v.id === current);
      if (cur) pool.unshift(cur);
    }
  }

  return pool.slice(0, 30);
}

function loadState() {
  if (!existsSync(PATHS.state)) {
    return { processed_slugs: [], audits: [], started_at: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(PATHS.state, 'utf8'));
}

function saveState(state) {
  state.updated_at = new Date().toISOString();
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2));
  writeFileSync(PATHS.audits, JSON.stringify({ generated_at: state.updated_at, audits: state.audits }, null, 2));
}

function resetOutputs() {
  mkdirSync(OUT, { recursive: true });
  for (const p of [PATHS.state, PATHS.audits, PATHS.auditsJsonl]) {
    if (existsSync(p)) unlinkSync(p);
  }
  writeFileSync(PATHS.log, '');
}

function resolveAuditApiConfig(base) {
  return {
    ...base,
    model: process.env.CLASSIFICATION_AUDIT_MODEL ?? 'claude-sonnet-4-5-20250929',
    maxTokens: parseInt(process.env.CLASSIFICATION_AUDIT_MAX_TOKENS ?? '2048', 10),
  };
}

function normalizeAuditResult(raw, company) {
  const verdict = ['ok', 'minor_fix', 'wrong'].includes(raw.verdict) ? raw.verdict : 'minor_fix';
  const severity =
    raw.severity ??
    (verdict === 'wrong' ? 3 : verdict === 'minor_fix' ? 2 : 1);

  return {
    slug: company.slug,
    name: company.name,
    verdict,
    severity,
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    suggested_phenotype_primary_id: raw.suggested_phenotype_primary_id ?? null,
    suggested_vertical_id: raw.suggested_vertical_id ?? null,
    suggested_industry_sub_vertical: raw.suggested_industry_sub_vertical ?? null,
    suggested_business_models: raw.suggested_business_models ?? [],
    rationale: raw.rationale ?? '',
    current: {
      phenotype_primary_id: company.phenotype_primary_id,
      industry_sub_vertical: company.industry_sub_vertical,
      vertical_id: company.vertical_id,
      vertical_normalize_method: company.vertical_normalize_method,
      business_models: company.business_models,
    },
    audited_at: new Date().toISOString(),
    model: process.env.CLASSIFICATION_AUDIT_MODEL ?? 'claude-sonnet-4-5-20250929',
  };
}

async function auditOne(company, context, apiConfig) {
  const { phenotypeCatalog, verticalOntology, heuristicBm } = context;
  const candidates = verticalCandidatesFor(company, verticalOntology);
  const allowedBms = PHENOTYPE_TO_BM[company.phenotype_primary_id] ?? ['BM-02'];

  const raw = await chatJson({
    system: auditSystemPrompt(phenotypeCatalog),
    user: auditUserPrompt({
      company,
      verticalCandidates: candidates,
      heuristicBm: heuristicBm.get(company.slug),
      allowedBms,
    }),
    apiConfig,
  });

  return normalizeAuditResult(raw, company);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadDotEnv();
  const args = parseArgs();
  mkdirSync(OUT, { recursive: true });

  const baseConfig = resolveApiConfig();
  if (!baseConfig) {
    console.error('ANTHROPIC_API_KEY required');
    process.exit(1);
  }
  const apiConfig = resolveAuditApiConfig(baseConfig);

  if (args.fresh) resetOutputs();

  const ontology = loadOntology(PATHS.ontology, PATHS.seeds);
  const verticalOntology = loadVerticalOntology();
  const heuristicBm = loadHeuristicBmMap();
  const normalizedMap = loadNormalizedMap();
  const phenotypeCatalog = compactPhenotypeCatalog(ontology.phenotypes);

  let companies = loadAssignmentsFromJsonl().map((a) =>
    enrichCompany(a, normalizedMap, verticalOntology, heuristicBm),
  );
  if (args.limit > 0) companies = companies.slice(0, args.limit);

  const state = args.resume ? loadState() : { processed_slugs: [], audits: [], started_at: new Date().toISOString() };
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

  log(
    `Classification audit | model=${apiConfig.model} | concurrency=${concurrency} | queue=${queue.length}/${companies.length}`,
  );

  const context = { phenotypeCatalog, verticalOntology, heuristicBm };
  let ok = 0,
    minor = 0,
    wrong = 0;

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const batchNum = Math.floor(offset / concurrency) + 1;
    const batchTotal = Math.ceil(queue.length / concurrency);
    log(`\nBatch ${batchNum}/${batchTotal} (${batch.length} companies)...`);

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
              issues: [{ field: 'audit', problem: err.message, suggested: null }],
              rationale: `Audit failed: ${err.message}`,
              current: { phenotype_primary_id: company.phenotype_primary_id },
              audited_at: new Date().toISOString(),
              error: true,
            },
            error: err.message,
          };
        }
      }),
    );

    for (const { audit, error } of results) {
      state.audits.push(audit);
      state.processed_slugs.push(audit.slug);
      done.add(audit.slug);
      appendFileSync(PATHS.auditsJsonl, JSON.stringify(audit) + '\n');

      if (audit.verdict === 'ok') ok++;
      else if (audit.verdict === 'wrong') wrong++;
      else minor++;

      const flag = audit.verdict === 'ok' ? '✓' : audit.verdict === 'wrong' ? '✗' : '~';
      log(`  ${flag} ${audit.slug}: ${audit.verdict}${error ? ` (${error})` : ''}`);
    }

    saveState(state);
    await sleep(150);
  }

  log('\n✓ Classification audit complete');
  log(`  ok=${ok} minor_fix=${minor} wrong=${wrong}`);
  log(`  Output: ${PATHS.audits}`);
  log(`  JSONL:  ${PATHS.auditsJsonl}`);
  log('\nRun: npm run audit:review');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
