#!/usr/bin/env node
/**
 * Merge two yc_companies.json scrape files without losing the existing cohort.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    base: join(ROOT, 'output/yc_companies.json'),
    add: null,
    out: join(ROOT, 'output/yc_companies.json'),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' && argv[++i]) args.base = argv[i];
    else if (a === '--add' && argv[++i]) args.add = argv[i];
    else if (a === '--out' && argv[++i]) args.out = argv[i];
    else if (a === '--help') {
      console.log(
        'Usage: node scripts/merge-scrape.mjs --add <scrape.json> [--base <path>] [--out <path>]'
      );
      process.exit(0);
    }
  }
  if (!args.add) {
    console.error('--add is required');
    process.exit(1);
  }
  return args;
}

function loadScrape(path) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return {
    batches: doc.batches ?? [],
    companies: doc.companies ?? [],
  };
}

function batchSortKey(batch) {
  const m = String(batch).match(/^(Winter|Spring|Summer|Fall)\s+(\d{4})$/);
  if (!m) return batch;
  const season = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 }[m[1]] ?? 9;
  return `${m[2]}-${season}-${batch}`;
}

function uniqueBatches(companies, extra = []) {
  const fromCos = companies.map((c) => c.batch).filter(Boolean);
  return [...new Set([...extra, ...fromCos])].sort((a, b) =>
    batchSortKey(a).localeCompare(batchSortKey(b))
  );
}

function main() {
  const args = parseArgs(process.argv);
  const base = loadScrape(args.base);
  const add = loadScrape(args.add);

  const bySlug = new Map();
  for (const c of base.companies) {
    if (c?.slug) bySlug.set(c.slug, c);
  }

  let added = 0;
  let skipped = 0;
  for (const c of add.companies) {
    if (!c?.slug) continue;
    if (bySlug.has(c.slug)) {
      skipped++;
      continue;
    }
    bySlug.set(c.slug, c);
    added++;
  }

  const companies = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const batches = uniqueBatches(companies, [...base.batches, ...add.batches]);

  const payload = {
    scraped_at: new Date().toISOString(),
    source_url: `merge:${args.base}+${args.add}`,
    batches,
    company_count: companies.length,
    merge_meta: {
      base_path: args.base,
      add_path: args.add,
      base_count: base.companies.length,
      add_count: add.companies.length,
      added,
      skipped_duplicate_slugs: skipped,
    },
    companies,
  };

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(payload, null, 2));

  console.log(
    `Merged ${companies.length} companies (${added} new, ${skipped} duplicate slugs skipped)`
  );
  console.log(`Batches (${batches.length}): ${batches.join(', ')}`);
  console.log(`Wrote ${args.out}`);
}

main();
