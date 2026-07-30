/**
 * Corpus = scraped directory cohort + slugs explicitly added via launch --ingest-new.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CORPUS_PATHS = {
  scrape: join(ROOT, 'output/yc_companies.json'),
  directory: join(ROOT, 'output/corpus/directory-companies.json'),
  launchIngested: join(ROOT, 'output/corpus/launch-ingested-slugs.json'),
};

/** Keep in sync with BATCHES in scrape.mjs — fallback when scrape JSON is absent (Railway/CI). */
export const CANONICAL_COHORT_BATCHES = [
  'Winter 2025',
  'Spring 2025',
  'Summer 2025',
  'Fall 2025',
  'Winter 2026',
  'Spring 2026',
  'Summer 2026',
  'Fall 2026',
  'Winter 2027',
];

function batchSortKey(batch) {
  const m = String(batch).match(/^(Winter|Spring|Summer|Fall)\s+(\d{4})$/);
  if (!m) return batch;
  const season = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 }[m[1]] ?? 9;
  return `${m[2]}-${season}-${batch}`;
}

export function loadScrapeSlugs() {
  if (!existsSync(CORPUS_PATHS.scrape)) return new Set();
  const doc = JSON.parse(readFileSync(CORPUS_PATHS.scrape, 'utf8'));
  return new Set((doc.companies ?? []).map((c) => c.slug).filter(Boolean));
}

export function loadDirectorySlugs() {
  if (!existsSync(CORPUS_PATHS.directory)) return new Set();
  const doc = JSON.parse(readFileSync(CORPUS_PATHS.directory, 'utf8'));
  return new Set((doc.companies ?? []).map((c) => c.slug).filter(Boolean));
}

export function loadLaunchIngestedSlugs() {
  if (!existsSync(CORPUS_PATHS.launchIngested)) return new Set();
  const doc = JSON.parse(readFileSync(CORPUS_PATHS.launchIngested, 'utf8'));
  return new Set((doc.slugs ?? []).filter(Boolean));
}

export function saveLaunchIngestedSlugs(slugs) {
  mkdirSync(dirname(CORPUS_PATHS.launchIngested), { recursive: true });
  const sorted = [...new Set(slugs)].sort();
  writeFileSync(
    CORPUS_PATHS.launchIngested,
    JSON.stringify({ updated_at: new Date().toISOString(), slugs: sorted }, null, 2)
  );
  return sorted;
}

export function recordLaunchIngestedSlug(slug) {
  if (!slug) return;
  const slugs = loadLaunchIngestedSlugs();
  slugs.add(slug);
  saveLaunchIngestedSlugs(slugs);
}

export function getCorpusAllowlist() {
  const allow = loadScrapeSlugs();
  for (const s of loadDirectorySlugs()) allow.add(s);
  for (const s of loadLaunchIngestedSlugs()) allow.add(s);
  return allow;
}

export function isInCorpus(slug) {
  return getCorpusAllowlist().has(slug);
}

/** Batches in the scraped directory cohort (2025 + 2026–2027). */
export function loadCohortBatches() {
  if (existsSync(CORPUS_PATHS.directory)) {
    const doc = JSON.parse(readFileSync(CORPUS_PATHS.directory, 'utf8'));
    if (doc.batches?.length) return [...doc.batches];
  }
  if (existsSync(CORPUS_PATHS.scrape)) {
    const doc = JSON.parse(readFileSync(CORPUS_PATHS.scrape, 'utf8'));
    if (doc.batches?.length) return [...doc.batches];
  }
  return [...CANONICAL_COHORT_BATCHES];
}

/** Batch facet list: cohort batches (+ batches for launch-promoted slugs) with ≥1 company. */
export function explorerBatchFacets(companies, cohortBatches = loadCohortBatches()) {
  const launchPromoted = loadLaunchIngestedSlugs();
  const counts = new Map();
  const extraBatches = new Set();
  for (const c of companies) {
    if (!c?.batch) continue;
    counts.set(c.batch, (counts.get(c.batch) ?? 0) + 1);
    if (launchPromoted.has(c.slug)) extraBatches.add(c.batch);
  }
  if (!cohortBatches.length) {
    return [...counts.keys()]
      .filter((b) => (counts.get(b) ?? 0) > 0)
      .sort((a, b) => batchSortKey(a).localeCompare(batchSortKey(b)));
  }

  const ordered = [
    ...cohortBatches,
    ...[...extraBatches].filter((b) => !cohortBatches.includes(b)).sort(),
  ];
  return ordered.filter((b) => (counts.get(b) ?? 0) > 0);
}
