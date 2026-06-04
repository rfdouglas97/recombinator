#!/usr/bin/env node
/**
 * Restore matrix/explorer corpus to: scraped cohort + launch-ingested slugs only.
 * Removes mistaken bulk launch-catalog backfill (not in either allowlist).
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getCorpusAllowlist } from './corpus-allowlist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PATHS = {
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
};

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const allow = getCorpusAllowlist();
  if (!allow.size) {
    console.error('Empty corpus allowlist (yc_companies.json missing?)');
    process.exit(1);
  }

  const norm = loadJson(PATHS.normalized);
  const normArr = Array.isArray(norm) ? norm : Object.values(norm);
  const removed = normArr.filter((r) => !allow.has(r.slug));
  const kept = normArr.filter((r) => allow.has(r.slug)).sort((a, b) => a.slug.localeCompare(b.slug));

  writeFileSync(PATHS.normalized, JSON.stringify(kept, null, 2));

  const assign = loadJson(PATHS.assignments);
  const assignArr = Array.isArray(assign) ? assign : Object.values(assign);
  const keptAssign = assignArr.filter((r) => allow.has(r.slug)).sort((a, b) => a.slug.localeCompare(b.slug));
  writeFileSync(PATHS.assignments, JSON.stringify(keptAssign, null, 2));

  console.log(`Allowlist: ${allow.size} slugs (scrape + launch-ingested)`);
  console.log(`normalized-assignments.json: ${normArr.length} → ${kept.length}`);
  console.log(`assignments.json: ${assignArr.length} → ${keptAssign.length}`);
  console.log(`Removed ${removed.length} rows`);
  if (removed.length) {
    console.log('Sample removed:', removed.slice(0, 5).map((r) => r.slug).join(', '));
  }
}

main();
