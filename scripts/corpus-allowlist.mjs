/**
 * Corpus = scraped directory cohort + slugs explicitly added via launch --ingest-new.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CORPUS_PATHS = {
  scrape: join(ROOT, 'output/yc_companies.json'),
  launchIngested: join(ROOT, 'output/corpus/launch-ingested-slugs.json'),
};

export function loadScrapeSlugs() {
  if (!existsSync(CORPUS_PATHS.scrape)) return new Set();
  const doc = JSON.parse(readFileSync(CORPUS_PATHS.scrape, 'utf8'));
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
    JSON.stringify({ updated_at: new Date().toISOString(), slugs: sorted }, null, 2),
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
  for (const s of loadLaunchIngestedSlugs()) allow.add(s);
  return allow;
}

export function isInCorpus(slug) {
  return getCorpusAllowlist().has(slug);
}

/** Batches in the scraped directory cohort (W26–S26, etc.). */
export function loadCohortBatches() {
  if (!existsSync(CORPUS_PATHS.scrape)) return [];
  const doc = JSON.parse(readFileSync(CORPUS_PATHS.scrape, 'utf8'));
  return [...(doc.batches ?? [])];
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
  const ordered = [
    ...cohortBatches,
    ...[...extraBatches].filter((b) => !cohortBatches.includes(b)).sort(),
  ];
  const list = ordered.length ? ordered : [...counts.keys()].sort();
  return list.filter((b) => (counts.get(b) ?? 0) > 0);
}
