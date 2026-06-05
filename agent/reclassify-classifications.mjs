#!/usr/bin/env node
/**
 * Re-tag flagged companies using LLM + audit feedback, then refresh pipeline outputs.
 *
 * Usage:
 *   node agent/reclassify-classifications.mjs [--resume] [--limit N] [--verdict wrong,minor_fix]
 *   node agent/reclassify-classifications.mjs --all   # re-tag every company (not just flagged)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { loadDotEnv } from './env.mjs';
import { chatJson, resolveApiConfig } from './llm.mjs';
import { reclassifySystemPrompt, reclassifyUserPrompt } from './reclassify-prompts.mjs';
import { compactPhenotypeCatalog } from './audit-prompts.mjs';
import { loadOntology, findPhenotype } from './ontology.mjs';
import { loadVerticalOntology, normalizeVertical, getVerticalById } from '../taxonomy/verticals.mjs';
import { normalizeLlmResult } from './normalize.mjs';
import { asSingleBusinessModels } from '../taxonomy/phenotype-to-bm.mjs';
import { verticalCandidatesForCompany } from './vertical-candidates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output/audit');

const PATHS = {
  jsonl: join(ROOT, 'output/phenotypes/assignments.jsonl'),
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
  audits: join(OUT, 'classification-audits.json'),
  state: join(OUT, 'reclassify-state.json'),
  fixes: join(OUT, 'reclassify-fixes.json'),
  fixesJsonl: join(OUT, 'reclassify-fixes.jsonl'),
  log: join(OUT, 'reclassify-run.log'),
  humanQueue: join(OUT, 'human-correction-queue.json'),
};

function parseArgs() {
  const args = {
    resume: false,
    fresh: false,
    limit: 0,
    concurrency: 0,
    all: false,
    verdicts: ['wrong', 'minor_fix'],
    skipPipeline: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') args.resume = true;
    else if (a === '--fresh') args.fresh = true;
    else if (a === '--all') args.all = true;
    else if (a === '--skip-pipeline') args.skipPipeline = true;
    else if (a === '--limit' && argv[++i]) args.limit = parseInt(argv[i], 10);
    else if (a === '--concurrency' && argv[++i]) args.concurrency = parseInt(argv[i], 10);
    else if (a === '--verdict' && argv[++i]) args.verdicts = argv[i].split(',').map((s) => s.trim());
  }
  return args;
}

function log(msg) {
  console.log(msg);
  appendFileSync(PATHS.log, `[${new Date().toISOString()}] ${msg}\n`);
}

function loadAssignmentsFromJsonl() {
  const bySlug = new Map();
  for (const line of readFileSync(PATHS.jsonl, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    bySlug.set(r.slug, r);
  }
  return bySlug;
}

function loadAudits() {
  const raw = JSON.parse(readFileSync(PATHS.audits, 'utf8'));
  return raw.audits ?? raw;
}

function verticalCandidatesForReclassify(company, audit, verticalOntology) {
  const hints = [
    audit.suggested_industry_sub_vertical,
    audit.rationale,
    audit.suggested_vertical_id,
  ]
    .filter(Boolean)
    .join(' ');
  const base = verticalCandidatesForCompany(company, verticalOntology, {
    maxCandidates: 35,
    hints,
  });
  const ids = new Set(base.map((v) => v.id));
  const add = (id) => {
    const v = id ? getVerticalById(id, verticalOntology) : null;
    if (v) ids.add(v.id);
  };
  add(audit.suggested_vertical_id);
  return [...ids].map((id) => getVerticalById(id, verticalOntology)).filter(Boolean);
}

function applyAuditSuggestions(normalized, audit, ontology, candidates) {
  const fields = new Set((audit.issues ?? []).map((i) => i.field));
  const force = audit.verdict === 'wrong';
  const candidateIds = new Set(candidates.map((v) => v.id));

  if ((force || fields.has('industry_sub_vertical')) && audit.suggested_industry_sub_vertical) {
    normalized.industry_sub_vertical = audit.suggested_industry_sub_vertical;
  }

  if (audit.suggested_phenotype_primary_id) {
    const pheno = findPhenotype(ontology, audit.suggested_phenotype_primary_id);
    if (pheno && (force || fields.has('phenotype_primary_id'))) {
      normalized.phenotype_primary_id = pheno.id;
      normalized.phenotype_primary_label = pheno.label;
      normalized.phenotype_family = pheno.family;
    }
  }

  if (audit.suggested_vertical_id && (force || fields.has('vertical_id'))) {
    if (candidateIds.has(audit.suggested_vertical_id)) {
      normalized.vertical_id = audit.suggested_vertical_id;
    }
  }

  if (audit.suggested_business_models?.length) {
    normalized.business_models = audit.suggested_business_models;
  }

  return normalized;
}

function enrichAssignment(company, raw, ontology, verticalOntology) {
  const pheno = findPhenotype(ontology, raw.phenotype_primary_id);
  let vertical_id = raw.vertical_id ?? null;
  let vertical_label = null;
  let vertical_sector_id = null;

  const vert = vertical_id ? getVerticalById(vertical_id, verticalOntology) : null;
  if (vert) {
    vertical_id = vert.id;
    vertical_label = vert.label;
    vertical_sector_id = vert.sector_id;
  } else {
    const n = normalizeVertical(
      { industry_sub_vertical: raw.industry_sub_vertical, yc_industries: company.yc_industries },
      verticalOntology,
    );
    vertical_id = n.vertical_id;
    vertical_label = n.vertical?.label ?? null;
    vertical_sector_id = n.vertical?.sector_id ?? null;
  }

  const draft = {
    slug: company.slug,
    name: company.name,
    website: company.website,
    yc_profile_url: company.yc_profile_url,
    batch: company.batch,
    one_liner: company.one_liner,
    description_combined: company.description_combined,
    industry_sub_vertical: raw.industry_sub_vertical,
    canonical_vertical_id: vertical_id,
    vertical_id,
    vertical_label,
    vertical_sector_id,
    phenotype_primary_id: raw.phenotype_primary_id,
    phenotype_secondary_id: raw.phenotype_secondary_id ?? null,
    phenotype_primary_label: raw.phenotype_primary_label ?? pheno?.label,
    phenotype_family: pheno?.family ?? company.phenotype_family,
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
    method: 'reclassify_haiku',
    reclassified_from: {
      phenotype_primary_id: company.phenotype_primary_id,
      industry_sub_vertical: company.industry_sub_vertical,
      vertical_id: company.vertical_id ?? company.canonical_vertical_id ?? null,
    },
    yc_industries: company.yc_industries,
    yc_tags: company.yc_tags,
    business_models: asSingleBusinessModels(raw.business_models, raw.phenotype_primary_id),
  };

  const phenoAfter = findPhenotype(ontology, draft.phenotype_primary_id);
  draft.primary_bm = draft.business_models[0];
  return {
    ...draft,
    phenotype_primary_label: phenoAfter?.label ?? draft.phenotype_primary_label,
    phenotype_family: phenoAfter?.family ?? draft.phenotype_family,
    value_wedge: phenoAfter?.value_wedge ?? draft.value_wedge,
    ai_application: phenoAfter?.ai_application ?? draft.ai_application,
  };
}

function loadState() {
  if (!existsSync(PATHS.state)) {
    return { processed_slugs: [], fixes: [], started_at: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(PATHS.state, 'utf8'));
}

function saveState(state) {
  state.updated_at = new Date().toISOString();
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2));
  writeFileSync(PATHS.fixes, JSON.stringify({ generated_at: state.updated_at, fixes: state.fixes }, null, 2));
}

function resolveReclassifyApiConfig(base) {
  return {
    ...base,
    model: process.env.CLASSIFICATION_RECLASSIFY_MODEL ?? 'claude-sonnet-4-5-20250929',
    maxTokens: parseInt(process.env.CLASSIFICATION_RECLASSIFY_MAX_TOKENS ?? '4096', 10),
  };
}

async function reclassifyOne(company, audit, context, apiConfig) {
  const candidates = verticalCandidatesForReclassify(company, audit, context.verticalOntology);
  if (candidates.length < 3) {
    throw new Error('Too few vertical candidates');
  }

  const raw = await chatJson({
    system: reclassifySystemPrompt(context.phenotypeCatalog),
    user: reclassifyUserPrompt({ company, audit, verticalCandidates: candidates }),
    apiConfig,
  });

  let normalized = normalizeLlmResult(raw, context.ontology);
  normalized = applyAuditSuggestions(normalized, audit, context.ontology, candidates);

  const validVert = candidates.some((v) => v.id === normalized.vertical_id);
  if (!validVert) {
    if (audit.suggested_vertical_id && candidates.some((v) => v.id === audit.suggested_vertical_id)) {
      normalized.vertical_id = audit.suggested_vertical_id;
    } else {
      const n = normalizeVertical(
        { industry_sub_vertical: normalized.industry_sub_vertical, yc_industries: company.yc_industries },
        context.verticalOntology,
      );
      normalized.vertical_id = n.vertical_id;
    }
  }

  return enrichAssignment(company, normalized, context.ontology, context.verticalOntology);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadDotEnv();
  const args = parseArgs();
  mkdirSync(OUT, { recursive: true });

  if (args.fresh && existsSync(PATHS.log)) writeFileSync(PATHS.log, '');

  if (!existsSync(PATHS.audits)) {
    console.error('Run audit first: npm run audit:classifications');
    process.exit(1);
  }

  const baseConfig = resolveApiConfig();
  if (!baseConfig) {
    console.error('ANTHROPIC_API_KEY required');
    process.exit(1);
  }
  const apiConfig = resolveReclassifyApiConfig(baseConfig);

  const ontology = loadOntology(join(ROOT, 'output/phenotypes/ontology.json'), join(ROOT, 'taxonomy/phenotype-seeds.json'));
  const verticalOntology = loadVerticalOntology();
  const phenotypeCatalog = compactPhenotypeCatalog(ontology.phenotypes);
  const audits = loadAudits();
  const auditBySlug = new Map(audits.map((a) => [a.slug, a]));
  const assignmentsBySlug = loadAssignmentsFromJsonl();

  const normalizedPath = join(ROOT, 'output/verticals/normalized-assignments.json');
  if (existsSync(normalizedPath)) {
    for (const row of JSON.parse(readFileSync(normalizedPath, 'utf8'))) {
      const a = assignmentsBySlug.get(row.slug);
      if (a) {
        a.vertical_id = row.vertical_id;
        a.vertical_label = row.vertical_label;
        a.vertical_sector_id = row.vertical_sector_id;
        a.business_models = row.business_models;
      }
    }
  }

  let queueSlugs = args.all
    ? [...assignmentsBySlug.keys()]
    : audits.filter((a) => args.verdicts.includes(a.verdict)).map((a) => a.slug);

  queueSlugs = queueSlugs.filter((s) => assignmentsBySlug.has(s)).sort();

  const state = args.resume ? loadState() : { processed_slugs: [], fixes: [], started_at: new Date().toISOString() };
  if (!args.resume) {
    state.processed_slugs = [];
    state.fixes = [];
    state.failed_slugs = [];
  }
  state.failed_slugs ??= [];

  const done = new Set(state.fixes.map((f) => f.slug));
  const queue = queueSlugs.filter((s) => !done.has(s));
  if (args.limit > 0) queue.splice(args.limit);

  const concurrency =
    args.concurrency > 0
      ? args.concurrency
      : parseInt(process.env.CLASSIFICATION_RECLASSIFY_CONCURRENCY ?? '8', 10);

  log(
    `Reclassify | model=${apiConfig.model} | concurrency=${concurrency} | queue=${queue.length}/${queueSlugs.length}`,
  );

  const context = { ontology, verticalOntology, phenotypeCatalog };
  let fixed = 0,
    failed = 0;
  const pendingHuman = [];

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const batchNum = Math.floor(offset / concurrency) + 1;
    const batchTotal = Math.ceil(queue.length / concurrency);
    log(`\nBatch ${batchNum}/${batchTotal} (${batch.length})...`);

    const results = await Promise.all(
      batch.map(async (slug) => {
        const company = assignmentsBySlug.get(slug);
        const audit = auditBySlug.get(slug) ?? { verdict: 'minor_fix', issues: [], rationale: '' };
        try {
          const updated = await reclassifyOne(company, audit, context, apiConfig);
          const unchanged =
            updated.phenotype_primary_id === company.phenotype_primary_id &&
            (updated.canonical_vertical_id ?? updated.vertical_id) ===
              (company.vertical_id ?? company.canonical_vertical_id) &&
            updated.industry_sub_vertical === company.industry_sub_vertical;
          return { slug, updated, error: null, unchanged, audit };
        } catch (err) {
          return { slug, updated: null, error: err.message, unchanged: false, audit };
        }
      }),
    );

    for (const { slug, updated, error, unchanged, audit } of results) {
      if (updated) {
        assignmentsBySlug.set(slug, updated);
        state.fixes.push({
          slug,
          prior: updated.reclassified_from,
          after: {
            phenotype_primary_id: updated.phenotype_primary_id,
            industry_sub_vertical: updated.industry_sub_vertical,
            vertical_id: updated.canonical_vertical_id,
            business_models: updated.business_models,
          },
        });
        appendFileSync(PATHS.fixesJsonl, JSON.stringify(state.fixes[state.fixes.length - 1]) + '\n');
        appendFileSync(PATHS.jsonl, JSON.stringify(updated) + '\n');
        fixed++;
        done.add(slug);
        state.failed_slugs = state.failed_slugs.filter((s) => s !== slug);
        if (unchanged && audit?.verdict === 'wrong') {
          pendingHuman.push({
            slug,
            name: updated.name,
            reason: 'unchanged_after_wrong_verdict',
            audit_verdict: audit.verdict,
            issues: audit.issues ?? [],
            suggested: {
              phenotype_primary_id: audit.suggested_phenotype_primary_id ?? null,
              vertical_id: audit.suggested_vertical_id ?? null,
              industry_sub_vertical: audit.suggested_industry_sub_vertical ?? null,
            },
            current: {
              phenotype_primary_id: updated.phenotype_primary_id,
              vertical_id: updated.canonical_vertical_id,
              industry_sub_vertical: updated.industry_sub_vertical,
            },
          });
        }
        if (!audit?.suggested_vertical_id && audit?.verdict !== 'ok') {
          const vertIssue = (audit?.issues ?? []).some((i) => i.field === 'vertical_id');
          if (vertIssue) {
            pendingHuman.push({
              slug,
              name: updated.name,
              reason: 'ontology_gap_no_suggested_vertical',
              audit_verdict: audit.verdict,
              issues: audit.issues ?? [],
              suggested: {
                phenotype_primary_id: audit.suggested_phenotype_primary_id ?? null,
                vertical_id: null,
                industry_sub_vertical: audit.suggested_industry_sub_vertical ?? null,
              },
              current: {
                phenotype_primary_id: updated.phenotype_primary_id,
                vertical_id: updated.canonical_vertical_id,
                industry_sub_vertical: updated.industry_sub_vertical,
              },
            });
          }
        }
        log(`  ✓ ${slug} → ${updated.phenotype_primary_id} × ${updated.canonical_vertical_id}`);
      } else {
        failed++;
        if (!state.failed_slugs.includes(slug)) state.failed_slugs.push(slug);
        pendingHuman.push({
          slug,
          name: assignmentsBySlug.get(slug)?.name ?? slug,
          reason: 'reclassify_api_failed',
          error,
          audit_verdict: audit?.verdict ?? null,
          issues: audit?.issues ?? [],
          suggested: {
            phenotype_primary_id: audit?.suggested_phenotype_primary_id ?? null,
            vertical_id: audit?.suggested_vertical_id ?? null,
            industry_sub_vertical: audit?.suggested_industry_sub_vertical ?? null,
          },
        });
        log(`  ✗ ${slug}: ${error}`);
      }
      state.processed_slugs = [...done];
    }
    saveState(state);
    await sleep(args.resume ? 400 : 150);
  }

  const allAssignments = [...assignmentsBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  writeFileSync(PATHS.assignments, JSON.stringify(allAssignments, null, 2));

  log(`\n✓ Reclassify complete: ${fixed} fixed, ${failed} failed`);
  log(`  Assignments: ${PATHS.assignments}`);

  state.pending_human = pendingHuman;
  saveState(state);
  writeFileSync(
    PATHS.humanQueue,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        pass: args.resume ? 'resume' : 'fresh',
        pending_during_reclassify: pendingHuman,
      },
      null,
      2,
    ),
  );
  if (pendingHuman.length) log(`  Pre-audit human candidates: ${pendingHuman.length} → ${PATHS.humanQueue}`);

  if (!args.skipPipeline && fixed > 0) {
    log('\nRefreshing pipeline outputs...');
    execSync('node scripts/rebuild-assignments.mjs', { cwd: ROOT, stdio: 'inherit' });
    execSync('node normalize-verticals.mjs --write --gaps', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-explorer-data.mjs', { cwd: ROOT, stdio: 'inherit' });
    log('Pipeline refresh done.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
