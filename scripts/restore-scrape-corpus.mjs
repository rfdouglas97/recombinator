#!/usr/bin/env node
/**
 * Restore matrix/explorer corpus to scraped cohort only (output/yc_companies.json).
 * Removes launch-catalog backfill rows (method launch_check_local from bulk ingest).
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PATHS = {
  scrape: join(ROOT, 'output/yc_companies.json'),
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
};

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const scrape = loadJson(PATHS.scrape);
  const allow = new Set((scrape.companies ?? []).map((c) => c.slug).filter(Boolean));
  if (!allow.size) {
    console.error('No slugs in output/yc_companies.json');
    process.exit(1);
  }

  const norm = loadJson(PATHS.normalized);
  const normArr = Array.isArray(norm) ? norm : Object.values(norm);
  const removed = normArr.filter((r) => !allow.has(r.slug));
  const kept = normArr.filter((r) => allow.has(r.slug)).sort((a, b) => a.slug.localeCompare(b.slug));

  writeFileSync(PATHS.normalized, JSON.stringify(kept, null, 2));

  if (PATHS.assignments) {
    const assign = loadJson(PATHS.assignments);
    const assignArr = Array.isArray(assign) ? assign : Object.values(assign);
    const keptAssign = assignArr.filter((r) => allow.has(r.slug)).sort((a, b) => a.slug.localeCompare(b.slug));
    writeFileSync(PATHS.assignments, JSON.stringify(keptAssign, null, 2));
    console.log(`assignments.json: ${assignArr.length} → ${keptAssign.length}`);
  }

  console.log(`normalized-assignments.json: ${normArr.length} → ${kept.length}`);
  console.log(`Removed ${removed.length} rows (not in scrape cohort)`);
  if (removed.length) {
    console.log('Sample removed:', removed.slice(0, 5).map((r) => r.slug).join(', '));
  }
}

main();
