#!/usr/bin/env node
/**
 * Daily YC directory sync:
 *   1. Query the YC company directory (Algolia REST, no browser) for every
 *      cohort batch and write the committed snapshot
 *      output/corpus/directory-companies.json (the CI-visible corpus allowlist).
 *   2. Diff directory slugs against normalized-assignments.
 *   3. For each new slug: fetch detail-page enrichment (founders), run the
 *      LLM phenotype + vertical classifiers, and add the company to
 *      normalized-assignments + phenotype assignments.
 *   4. Record run state in output/corpus/directory-sync-state.json.
 *
 * Catches companies that appear in the batch directory without ever posting
 * a Launch — the launches monitor (check-launches.mjs) cannot see those.
 *
 * Usage:
 *   npm run directory:sync            # full sync
 *   npm run directory:sync:dry       # report live-vs-local, no writes beyond snapshot
 *   node scripts/sync-directory.mjs --limit 40 --refresh   # daily CI invocation
 *
 * Requires ANTHROPIC_API_KEY or OPENAI_API_KEY unless --dry-run.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import {
  fetchAlgoliaCredentials,
  queryBatch,
  fetchCompanyDetailHttp,
  normalizeAlgoliaHit,
  normalizeFounder,
} from './yc-directory-client.mjs';
import { CANONICAL_COHORT_BATCHES, CORPUS_PATHS } from './corpus-allowlist.mjs';
import { loadAssignmentMaps, saveAssignmentMaps } from './assignment-store.mjs';
import { loadOntology } from '../agent/ontology.mjs';
import { loadVerticalOntology } from '../taxonomy/verticals.mjs';
import { classifyLaunchCompany } from '../agent/classify-company.mjs';
import { loadDotEnv } from '../agent/env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PATHS = {
  directory: CORPUS_PATHS.directory,
  state: join(ROOT, 'output/corpus/directory-sync-state.json'),
  ontology: join(ROOT, 'output/phenotypes/ontology.json'),
  seeds: join(ROOT, 'taxonomy/phenotype-seeds.json'),
};

const MAX_CLASSIFY_ATTEMPTS = 3;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: 0,
    batch: null,
    noDetails: false,
    refresh: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (a === '--batch' && argv[i + 1]) args.batch = argv[++i];
    else if (a === '--no-details') args.noDetails = true;
    else if (a === '--refresh') args.refresh = true;
    else if (a === '--help') {
      console.log(`Usage: node scripts/sync-directory.mjs [options]

Sync the YC company directory into the ontology corpus.

Options:
  --dry-run       Report live-vs-local per batch and list new slugs; classify nothing
  --limit <n>     Classify at most N new companies this run (0 = all)
  --batch <name>  Only sync one batch (e.g. "Summer 2026")
  --no-details    Skip company detail-page enrichment (founders, socials)
  --refresh       After ingest: run verticals:normalize + explorer bundle build
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

/** Slim committed snapshot record — enough for allowlist + classification replay. */
function toSnapshotRecord(c) {
  return {
    slug: c.slug,
    name: c.name,
    batch: c.batch,
    one_liner: c.one_liner,
    long_description: c.long_description?.slice(0, 2000) ?? null,
    website: c.website,
    industries: c.industries ?? [],
    tags: c.tags ?? [],
    team_size: c.team_size,
    location: c.location,
    status: c.status,
    launched_at: c.launched_at,
  };
}

/** Mirror of check-launches' launchToCompanyRecord, sourced from a directory hit. */
function directoryToCompanyRecord(listing, detail) {
  const longDescription =
    (detail?.long_description ?? listing.long_description)?.slice(0, 2000) ?? null;
  const oneLiner = detail?.one_liner ?? listing.one_liner;
  const industries = listing.industries?.length
    ? listing.industries
    : listing.industry
      ? [listing.industry]
      : [];
  return {
    slug: listing.slug,
    name: listing.name,
    one_liner: oneLiner,
    long_description: longDescription,
    website: listing.website,
    batch: detail?.batch_name ?? listing.batch,
    industries,
    tags: listing.tags ?? [],
    yc_url: listing.yc_url,
    description: {
      one_liner: oneLiner,
      long_description: longDescription,
      combined: [oneLiner, longDescription?.slice(0, 1500)].filter(Boolean).join('\n\n'),
    },
    yc_industries: industries,
    yc_tags: listing.tags ?? [],
  };
}

/** Analog of check-launches' assignmentFromClassification for directory ingests. */
function assignmentFromDirectory(listing, detail, classification) {
  return {
    slug: classification.slug,
    name: classification.name,
    website: listing.website,
    yc_profile_url: listing.yc_url,
    batch: detail?.batch_name ?? listing.batch,
    one_liner: classification.one_liner,
    description_combined: classification.description_combined,
    industry_sub_vertical: classification.industry_sub_vertical,
    canonical_vertical_id: classification.canonical_vertical_id ?? classification.vertical_id,
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
    method: 'directory_agent',
    yc_industries: listing.industries ?? [],
    yc_tags: listing.tags ?? [],
    business_models: classification.business_models,
    team_size: listing.team_size,
    location: listing.location,
    status: listing.status,
    founders: (detail?.founders ?? []).map(normalizeFounder),
    directory_synced_at: new Date().toISOString(),
    classified_at: new Date().toISOString(),
  };
}

function loadSyncState() {
  return loadJson(PATHS.state, { last_sync_at: null, per_batch: {}, failed_slugs: [] });
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv);
  const batches = args.batch ? [args.batch] : [...CANONICAL_COHORT_BATCHES];

  console.log('Fetching Algolia credentials from YC directory page…');
  const creds = await fetchAlgoliaCredentials();

  const bySlug = new Map();
  const perBatchLive = {};
  for (const batch of batches) {
    const hits = await queryBatch(creds, batch);
    perBatchLive[batch] = hits.length;
    for (const hit of hits) {
      const c = normalizeAlgoliaHit(hit);
      if (c.slug && !bySlug.has(c.slug)) bySlug.set(c.slug, c);
    }
    console.log(`  ${batch}: ${hits.length} companies`);
  }

  // Always write the committed snapshot (full cohort only) so the corpus
  // allowlist stays complete in CI even on classification-capped runs.
  if (!args.batch) {
    const companies = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
    saveJson(PATHS.directory, {
      synced_at: new Date().toISOString(),
      source: 'algolia:YCCompany_production',
      batches,
      company_count: companies.length,
      companies: companies.map(toSnapshotRecord),
    });
    console.log(`Wrote ${PATHS.directory} (${companies.length} companies)`);
  }

  const { normalized, assignments } = loadAssignmentMaps();
  const perBatch = {};
  for (const batch of batches) {
    const live = perBatchLive[batch];
    const local = [...normalized.values()].filter((r) => r.batch === batch).length;
    perBatch[batch] = { live, local, new_ingested: 0 };
  }

  const prevState = loadSyncState();
  const attemptsBySlug = new Map(
    (prevState.failed_slugs ?? []).map((f) => [f.slug, f.attempts ?? 1])
  );

  let newSlugs = [...bySlug.keys()].filter((slug) => !normalized.has(slug));
  const exhausted = newSlugs.filter((s) => (attemptsBySlug.get(s) ?? 0) >= MAX_CLASSIFY_ATTEMPTS);
  if (exhausted.length) {
    console.warn(
      `Skipping ${exhausted.length} slug(s) with ${MAX_CLASSIFY_ATTEMPTS}+ failed attempts: ${exhausted.join(', ')}`
    );
    newSlugs = newSlugs.filter((s) => !exhausted.includes(s));
  }

  console.log(
    `\nDirectory: ${bySlug.size} companies | in corpus: ${bySlug.size - newSlugs.length - exhausted.length} | new: ${newSlugs.length}`
  );
  for (const [batch, stats] of Object.entries(perBatch)) {
    if (stats.live !== stats.local)
      console.log(`  ${batch}: live ${stats.live} vs local ${stats.local}`);
  }

  if (args.dryRun) {
    if (newSlugs.length) console.log(`\nNew slugs:\n  ${newSlugs.join('\n  ')}`);
    console.log('\n--dry-run: stopping before classification.');
    return;
  }

  const pendingSlugs = args.limit > 0 ? newSlugs.slice(args.limit) : [];
  const toClassify = args.limit > 0 ? newSlugs.slice(0, args.limit) : newSlugs;
  if (pendingSlugs.length) {
    console.log(
      `--limit ${args.limit}: classifying ${toClassify.length} now, deferring ${pendingSlugs.length}`
    );
  }

  const phenotypeOntology = loadOntology(PATHS.ontology, PATHS.seeds);
  const verticalOntology = loadVerticalOntology();

  const failed = [];
  let ingested = 0;
  for (const slug of toClassify) {
    const listing = bySlug.get(slug);
    const detail = args.noDetails ? null : await fetchCompanyDetailHttp(slug);
    const company = directoryToCompanyRecord(listing, detail);
    try {
      const classification = await classifyLaunchCompany(company, {
        phenotypeOntology,
        verticalOntology,
        hints: company.long_description ?? '',
      });
      if (!classification.phenotype_primary_id) {
        throw new Error('classifier returned no phenotype');
      }
      const record = assignmentFromDirectory(listing, detail, {
        ...classification,
        slug,
        name: listing.name,
      });
      normalized.set(slug, record);
      assignments.set(slug, { ...record, proposed_phenotype: null });
      ingested++;
      if (perBatch[record.batch]) perBatch[record.batch].new_ingested++;
      console.log(
        `  + ${slug} [${record.batch}] → ${record.phenotype_primary_id}${record.vertical_id ? ` × ${record.vertical_id}` : ' (vertical TBD)'}`
      );
    } catch (err) {
      const attempts = (attemptsBySlug.get(slug) ?? 0) + 1;
      failed.push({ slug, error: String(err.message ?? err).slice(0, 300), attempts });
      console.warn(`  ⚠ classify failed for ${slug} (attempt ${attempts}): ${err.message}`);
    }
  }

  if (ingested) saveAssignmentMaps({ normalized, assignments });

  // Carry exhausted slugs forward so their attempt counts survive the run.
  const exhaustedEntries = (prevState.failed_slugs ?? []).filter((f) => exhausted.includes(f.slug));
  saveJson(PATHS.state, {
    last_sync_at: new Date().toISOString(),
    per_batch: perBatch,
    pending_slugs: pendingSlugs,
    failed_slugs: [...failed, ...exhaustedEntries],
  });

  console.log(`\n── Directory sync summary ──`);
  console.log(
    `Ingested: ${ingested} | Failed: ${failed.length} | Deferred (--limit): ${pendingSlugs.length} | Corpus: ${normalized.size}`
  );

  if (args.refresh && ingested) {
    console.log('Refreshing normalize + explorer bundle…');
    execSync('node normalize-verticals.mjs --write', { cwd: ROOT, stdio: 'inherit' });
    execSync('node scripts/build-explorer-data.mjs', { cwd: ROOT, stdio: 'inherit' });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
