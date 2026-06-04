#!/usr/bin/env node
/**
 * Check YC Launches for new posts, evaluate taxonomy conformance + predictor fit,
 * optionally ingest into the company database and refresh artifacts.
 *
 * Usage:
 *   node scripts/check-launches.mjs                    # check new launches since last run
 *   node scripts/check-launches.mjs --all              # re-evaluate all scraped launches
 *   node scripts/check-launches.mjs --ingest           # add new companies + enrich records
 *   node scripts/check-launches.mjs --ingest --refresh # also normalize + rebuild explorer bundle
 *   node scripts/check-launches.mjs --limit 5          # test on first 5
 *   node scripts/check-launches.mjs --from-cache       # skip scrape, use launches-raw.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { scrapeLaunches, loadLaunchesRaw } from './scrape-launches.mjs';
import { evaluateLaunchConformance, RUBRIC, rubricMarkdown } from './launch-conformance-rubric.mjs';
import { classifyLocal } from '../agent/local-classifier.mjs';
import { loadOntology } from '../agent/ontology.mjs';
import { classifyHeuristic } from '../taxonomy/classify-rules.mjs';
import { verticalCandidatesForCompany } from '../agent/vertical-candidates.mjs';
import { loadVerticalOntology, getVerticalById } from '../taxonomy/verticals.mjs';
import { PHENOTYPE_TO_BM } from '../taxonomy/phenotype-to-bm.mjs';
import { loadNormalizedAssignments, EVAL_PATHS } from './eval-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PATHS = {
  state: join(ROOT, 'output/launches/state.json'),
  raw: join(ROOT, 'output/launches/launches-raw.json'),
  catalog: join(ROOT, 'output/launches/launches-catalog.json'),
  reviews: join(ROOT, 'output/launches/reviews.json'),
  reviewsJsonl: join(ROOT, 'output/launches/reviews.jsonl'),
  report: join(ROOT, 'output/launches/check-report.json'),
  rubricDoc: join(ROOT, 'output/launches/rubric.md'),
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
  gaps: join(ROOT, 'output/verticals/gap-candidates.json'),
  ranked: join(ROOT, 'output/whitespace/gap-opportunity-ranked.json'),
  matrix: join(ROOT, 'output/verticals/bm-vertical-matrix.json'),
  library: join(ROOT, 'output/startup-library/library.json'),
  ontology: join(ROOT, 'output/phenotypes/ontology.json'),
  seeds: join(ROOT, 'taxonomy/phenotype-seeds.json'),
};

function parseArgs(argv) {
  const args = {
    all: false,
    ingest: false,
    ingestNew: false,
    refresh: false,
    fromCache: false,
    limit: 0,
    since: null,
    headed: false,
    batchFilter: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--ingest') args.ingest = true;
    else if (a === '--ingest-new') args.ingestNew = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--from-cache') args.fromCache = true;
    else if (a === '--limit' && argv[++i]) args.limit = parseInt(argv[i], 10);
    else if (a === '--since' && argv[++i]) args.since = argv[i];
    else if (a === '--batch' && argv[++i]) args.batchFilter = argv[i];
    else if (a === '--headed') args.headed = true;
    else if (a === '--help') {
      console.log(`Usage: node scripts/check-launches.mjs [options]

Check https://www.ycombinator.com/launches for new posts and evaluate against taxonomy + predictor.

Options:
  --all           Re-evaluate all launches (ignore processed state)
  --ingest        Enrich existing DB records with launch metadata
  --ingest-new    Also add companies not yet in DB (local classifier; run LLM pass after)
  --refresh       After ingest: run verticals:normalize + data:bundle
  --from-cache    Use output/launches/launches-raw.json instead of scraping
  --limit <n>     Process at most N launches
  --since <iso>   Only launches on/after date (also passed to scraper)
  --batch <name>  Filter to company batch (e.g. "Spring 2026")
  --headed        Show browser when scraping
  --help          Show help
`);
      process.exit(0);
    }
  }
  return args;
}

function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function loadState() {
  return loadJson(PATHS.state, {
    last_check_at: null,
    processed_launch_ids: [],
    processed_slugs: [],
  });
}

function saveState(state) {
  state.last_check_at = new Date().toISOString();
  saveJson(PATHS.state, state);
}

function loadCatalog() {
  return loadJson(PATHS.catalog, { launches: [] });
}

function loadReviews() {
  return loadJson(PATHS.reviews, { reviews: [] });
}

function launchToCompanyRecord(launch) {
  const industries = launch.company_industry ? [launch.company_industry] : [];
  return {
    slug: launch.company_slug,
    name: launch.company_name,
    one_liner: launch.tagline ?? launch.title,
    long_description: stripMarkdown(launch.body)?.slice(0, 2000) ?? null,
    website: launch.company_website,
    batch: launch.company_batch,
    industries,
    tags: [],
    yc_url: launch.company_slug
      ? `https://www.ycombinator.com/companies/${launch.company_slug}`
      : null,
    description: {
      one_liner: launch.tagline ?? launch.title,
      long_description: stripMarkdown(launch.body)?.slice(0, 2000) ?? null,
      combined: [launch.tagline, stripMarkdown(launch.body)?.slice(0, 1500)]
        .filter(Boolean)
        .join('\n\n'),
    },
    yc_industries: industries,
    yc_tags: [],
    launch: {
      launch_id: launch.launch_id,
      launch_url: launch.launch_url,
      launch_title: launch.title,
      created_at: launch.created_at,
    },
  };
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/\\\n/g, '\n')
    .trim();
}

function buildClassification(launch, company, phenotypeOntology, verticalOntology) {
  const local = classifyLocal(company, phenotypeOntology);
  const heuristic = classifyHeuristic({
    name: company.name,
    one_liner: company.one_liner,
    long_description: company.long_description,
    industries: company.industries,
    tags: company.tags,
  });

  const assignmentStub = {
    slug: company.slug,
    one_liner: company.one_liner,
    industry_sub_vertical: local.industry_sub_vertical,
    phenotype_primary_id: local.phenotype_primary_id,
    phenotype_primary_label: local.phenotype_primary_label,
    yc_industries: company.yc_industries,
    yc_tags: company.yc_tags,
    vertical_id: null,
  };

  const candidates = verticalCandidatesForCompany(assignmentStub, verticalOntology, {
    maxCandidates: 5,
    hints: stripMarkdown(launch.body)?.slice(0, 500),
  });
  const topVertical = candidates[0] ?? null;

  const businessModels =
    heuristic.taxonomy?.business_model_primary
      ? [heuristic.taxonomy.business_model_primary]
      : PHENOTYPE_TO_BM[local.phenotype_primary_id]?.slice(0, 1) ?? ['BM-02'];

  const vertical = topVertical ? getVerticalById(topVertical.id, verticalOntology) : null;

  return {
    slug: company.slug,
    name: company.name,
    one_liner: company.one_liner,
    description_combined: company.description?.combined,
    industry_sub_vertical: local.industry_sub_vertical,
    phenotype_primary_id: local.phenotype_primary_id,
    phenotype_primary_label: local.phenotype_primary_label,
    phenotype_family: phenotypeOntology.phenotypes.find((p) => p.id === local.phenotype_primary_id)?.family,
    vertical_id: topVertical?.id ?? null,
    vertical_label: vertical?.label ?? null,
    vertical_sector_id: vertical?.sector_id ?? null,
    canonical_vertical_id: topVertical?.id ?? null,
    business_models: businessModels,
    value_wedge: local.value_wedge,
    ai_application: local.ai_application,
    ai_application_patterns: local.ai_application_patterns,
    what_they_sell: local.what_they_sell,
    ai_play: local.ai_play,
    who_pays: local.who_pays,
    confidence: local.confidence,
    rationale: local.rationale,
    method: 'launch_check_local',
    vertical_candidates: candidates.slice(0, 5).map((v) => ({ id: v.id, label: v.label })),
    heuristic_taxonomy: heuristic.taxonomy,
  };
}

function mergeLaunchIntoAssignment(existing, launch, classification) {
  return {
    ...existing,
    launch_id: launch.launch_id,
    launch_url: launch.launch_url,
    launch_title: launch.title,
    launch_created_at: launch.created_at,
    launch_tagline: launch.tagline,
    launch_evaluated_at: new Date().toISOString(),
    description_combined: [
      existing.description_combined,
      launch.tagline,
      stripMarkdown(launch.body)?.slice(0, 800),
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

function assignmentFromClassification(launch, classification) {
  return {
    slug: classification.slug,
    name: classification.name,
    website: launch.company_website,
    yc_profile_url: `https://www.ycombinator.com/companies/${classification.slug}`,
    batch: launch.company_batch,
    one_liner: classification.one_liner,
    description_combined: classification.description_combined,
    industry_sub_vertical: classification.industry_sub_vertical,
    canonical_vertical_id: classification.canonical_vertical_id,
    vertical_id: classification.vertical_id,
    vertical_label: classification.vertical_label,
    vertical_sector_id: classification.vertical_sector_id,
    phenotype_primary_id: classification.phenotype_primary_id,
    phenotype_primary_label: classification.phenotype_primary_label,
    phenotype_family: classification.phenotype_family,
    value_wedge: classification.value_wedge,
    ai_application: classification.ai_application,
    ai_application_patterns: classification.ai_application_patterns,
    what_they_sell: classification.what_they_sell,
    ai_play: classification.ai_play,
    who_pays: classification.who_pays,
    confidence: classification.confidence,
    rationale: classification.rationale,
    method: classification.method,
    yc_industries: launch.company_industry ? [launch.company_industry] : [],
    yc_tags: [],
    business_models: classification.business_models,
    launch_id: launch.launch_id,
    launch_url: launch.launch_url,
    launch_title: launch.title,
    launch_created_at: launch.created_at,
    launch_tagline: launch.tagline,
    launch_ingested_at: new Date().toISOString(),
    classified_at: new Date().toISOString(),
  };
}

function ingestReviews(reviews, catalog, normalized, assignments, toIngest, opts = {}) {
  const normBySlug = new Map(normalized.map((r) => [r.slug, r]));
  const assignBySlug = new Map(
    (Array.isArray(assignments) ? assignments : Object.values(assignments)).map((r) => [r.slug, r]),
  );
  const catalogById = new Map(catalog.launches.map((l) => [l.launch_id, l]));

  let addedCompanies = 0;
  let enrichedCompanies = 0;

  for (const { launch, classification, review } of toIngest) {
    catalogById.set(launch.launch_id, { ...launch, review_summary: {
      conformance_index: review.taxonomy.conformance_index,
      predictability_band: review.predictor.predictability_band,
      verdict: review.taxonomy.verdict,
    }});

    const slug = launch.company_slug;
    if (!slug) continue;

    if (normBySlug.has(slug)) {
      const updated = mergeLaunchIntoAssignment(normBySlug.get(slug), launch, classification);
      normBySlug.set(slug, updated);
      if (assignBySlug.has(slug)) {
        assignBySlug.set(slug, mergeLaunchIntoAssignment(assignBySlug.get(slug), launch, classification));
      }
      enrichedCompanies++;
    } else if (opts.ingestNew && classification.vertical_id && classification.phenotype_primary_id) {
      const record = assignmentFromClassification(launch, classification);
      normBySlug.set(slug, record);
      assignBySlug.set(slug, { ...record, proposed_phenotype: null });
      addedCompanies++;
    }

    appendFileSync(PATHS.reviewsJsonl, `${JSON.stringify(review)}\n`);
  }

  saveJson(PATHS.catalog, {
    updated_at: new Date().toISOString(),
    count: catalogById.size,
    launches: [...catalogById.values()].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    ),
  });

  const normOut = [...normBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  saveJson(PATHS.normalized, normOut);

  const assignOut = [...assignBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  saveJson(PATHS.assignments, assignOut);

  return { addedCompanies, enrichedCompanies };
}

function printSummary(report) {
  console.log('\n── Launch check summary ──');
  console.log(`Checked: ${report.checked_count} | New: ${report.new_count} | Skipped (already processed): ${report.skipped_count}`);
  console.log(`Conforming: ${report.summary.conforming} | Partial: ${report.summary.partial} | Non-conforming: ${report.summary.non_conforming}`);
  console.log(`Predicted/plausible: ${report.summary.would_have_predicted} | Surprise: ${report.summary.surprise}`);
  console.log('');

  for (const r of report.reviews.slice(0, 10)) {
    const t = r.review.taxonomy;
    const p = r.review.predictor;
    console.log(
      `  ${r.launch.company_name ?? r.launch.company_slug} — ${t.verdict} (${t.conformance_index}) | ${p.predictability_band}${p.ranked_gap ? ` | gap rank #${p.ranked_gap.rank}` : ''}`,
    );
  }
  if (report.reviews.length > 10) {
    console.log(`  … and ${report.reviews.length - 10} more`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  mkdirSync(join(ROOT, 'output/launches'), { recursive: true });

  writeFileSync(PATHS.rubricDoc, rubricMarkdown());

  const state = loadState();
  const normalized = loadNormalizedAssignments();
  const normBySlug = new Map(normalized.map((r) => [r.slug, r]));

  let launches;
  if (args.fromCache && existsSync(PATHS.raw)) {
    launches = loadLaunchesRaw(PATHS.raw).launches ?? [];
    console.log(`Loaded ${launches.length} launches from cache`);
  } else {
    console.log('Scraping YC Launches…');
    launches = await scrapeLaunches({ headless: !args.headed, since: args.since });
    saveJson(PATHS.raw, {
      scraped_at: new Date().toISOString(),
      source: 'https://www.ycombinator.com/launches',
      count: launches.length,
      launches,
    });
  }

  const processedIds = new Set(args.all ? [] : state.processed_launch_ids);
  let pending = launches.filter((l) => !processedIds.has(l.launch_id));
  if (args.batchFilter) {
    pending = pending.filter((l) => l.company_batch === args.batchFilter);
  }
  if (args.limit > 0) pending = pending.slice(0, args.limit);

  console.log(`Evaluating ${pending.length} launch(es)…`);

  const phenotypeOntology = loadOntology(PATHS.ontology, PATHS.seeds);
  const verticalOntology = loadVerticalOntology();
  const gapCandidates = loadJson(PATHS.gaps, { gaps: [] });
  const rankedData = loadJson(PATHS.ranked, { gaps: [] });
  const rankedGaps = rankedData.gaps ?? [];
  const bmMatrix = loadJson(PATHS.matrix, { observed_cells: [] });
  const library = loadJson(PATHS.library, { cards: [] });
  const libraryCards = library.cards ?? [];

  const reviews = [];
  const toIngest = [];

  for (const launch of pending) {
    if (!launch.company_slug) {
      console.warn(`  Skip launch ${launch.launch_id}: no company slug`);
      continue;
    }

    const company = launchToCompanyRecord(launch);
    const existingAssignment = normBySlug.get(launch.company_slug) ?? null;
    const classification = existingAssignment
      ? {
          ...existingAssignment,
          method: 'existing_assignment',
          confidence: existingAssignment.confidence ?? 0.85,
        }
      : buildClassification(launch, company, phenotypeOntology, verticalOntology);

    const review = evaluateLaunchConformance(launch, classification, {
      verticalOntology,
      phenotypeOntology,
      gapCandidates,
      rankedGaps,
      bmMatrix,
      libraryCards,
      existingAssignment,
    });

    reviews.push({ launch, classification, review });
    toIngest.push({ launch, classification, review });
    processedIds.add(launch.launch_id);
  }

  const existingReviews = loadReviews();
  const reviewByLaunchId = new Map(existingReviews.reviews.map((r) => [r.launch_id, r]));

  for (const { launch, classification, review } of reviews) {
    reviewByLaunchId.set(launch.launch_id, {
      launch_id: launch.launch_id,
      company_slug: launch.company_slug,
      launch_url: launch.launch_url,
      created_at: launch.created_at,
      classification: {
        phenotype_primary_id: classification.phenotype_primary_id,
        vertical_id: classification.vertical_id,
        business_models: classification.business_models,
      },
      review,
    });
  }

  saveJson(PATHS.reviews, {
    updated_at: new Date().toISOString(),
    rubric_version: RUBRIC.version,
    reviews: [...reviewByLaunchId.values()].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    ),
  });

  let ingestStats = null;
  if (args.ingest && toIngest.length > 0) {
    const catalog = loadCatalog();
    const assignments = loadJson(PATHS.assignments, []);
    ingestStats = ingestReviews(
      [...reviewByLaunchId.values()],
      catalog,
      normalized,
      assignments,
      toIngest,
      { ingestNew: args.ingestNew },
    );
    console.log(`Ingested: ${ingestStats.addedCompanies} new, ${ingestStats.enrichedCompanies} enriched`);

    if (args.refresh) {
      console.log('Refreshing normalize + explorer bundle…');
      execSync('node normalize-verticals.mjs --write', { cwd: ROOT, stdio: 'inherit' });
      execSync('node scripts/build-explorer-data.mjs', { cwd: ROOT, stdio: 'inherit' });
    }
  }

  state.processed_launch_ids = [...processedIds];
  state.processed_slugs = [...new Set([...state.processed_slugs, ...pending.map((l) => l.company_slug).filter(Boolean)])];
  saveState(state);

  const report = {
    checked_at: new Date().toISOString(),
    source: 'https://www.ycombinator.com/launches',
    checked_count: pending.length,
    new_count: pending.length,
    skipped_count: launches.length - pending.length,
    ingest: ingestStats,
    summary: {
      conforming: reviews.filter((r) => r.review.taxonomy.verdict === 'conforming').length,
      partial: reviews.filter((r) => r.review.taxonomy.verdict === 'partial').length,
      non_conforming: reviews.filter((r) => r.review.taxonomy.verdict === 'non_conforming').length,
      would_have_predicted: reviews.filter((r) => r.review.predictor.would_have_been_predicted).length,
      surprise: reviews.filter((r) => r.review.predictor.predictability_band === 'surprise').length,
      predicted: reviews.filter((r) => r.review.predictor.predictability_band === 'predicted').length,
    },
    reviews: reviews.map(({ launch, review }) => ({
      launch: {
        launch_id: launch.launch_id,
        company_slug: launch.company_slug,
        company_name: launch.company_name,
        launch_url: launch.launch_url,
        created_at: launch.created_at,
      },
      review,
    })),
  };

  saveJson(PATHS.report, report);
  printSummary(report);
  console.log(`\nReport: ${PATHS.report}`);
  console.log(`Rubric: ${PATHS.rubricDoc}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
