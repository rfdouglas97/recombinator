#!/usr/bin/env node
/**
 * Scrape Y Combinator company directory with Playwright.
 * 1. Load filtered directory page and capture Algolia listing payload
 * 2. Visit each company page and parse embedded React data-page JSON (founders, socials, etc.)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { normalizeAlgoliaHit, normalizeCompanyDetail } from './scripts/yc-directory-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_URL =
  'https://www.ycombinator.com/companies?batch=Winter%202025&batch=Spring%202025&batch=Summer%202025&batch=Fall%202025&batch=Winter%202026&batch=Spring%202026&batch=Summer%202026&batch=Fall%202026&batch=Winter%202027';

const BATCHES = [
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

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    outDir: join(__dirname, 'output'),
    limit: 0,
    concurrency: 5,
    headless: true,
    skipDetails: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' && argv[i + 1]) args.url = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if (a === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (a === '--concurrency' && argv[i + 1]) args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--headed') args.headless = false;
    else if (a === '--list-only') args.skipDetails = true;
    else if (a === '--help') {
      console.log(`Usage: node scrape.mjs [options]

Options:
  --url <url>         Directory URL with filters (default: selected 2026-2027 batches)
  --out <dir>         Output directory (default: ./output)
  --limit <n>         Only scrape first N companies (0 = all)
  --concurrency <n>   Parallel company page fetches (default: 5)
  --headed            Run browser with UI
  --list-only         Skip company detail pages (Algolia listing only)
  --help              Show this help
`);
      process.exit(0);
    }
  }
  return args;
}

async function fetchListing(page, url) {
  let bestHits = [];

  const onResponse = async (response) => {
    if (!response.url().includes('algolia.net') || !response.url().includes('queries')) return;
    try {
      const json = await response.json();
      for (const result of json.results ?? []) {
        const hits = result.hits ?? [];
        if (hits.length > bestHits.length) bestHits = hits;
      }
    } catch (_) {}
  };

  page.on('response', onResponse);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  let prev = 0;
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    const linkCount = await page.locator('a[href*="/companies/"]').count();
    if (linkCount === prev && bestHits.length > 0) break;
    prev = linkCount;
  }

  await page.waitForTimeout(1500);
  page.off('response', onResponse);

  if (bestHits.length === 0) {
    const slugs = await page.$$eval('a[href*="/companies/"]', (links) => [
      ...new Set(
        links
          .map((a) => {
            const m = a.href.match(/\/companies\/([^/?#]+)$/);
            return m ? m[1] : null;
          })
          .filter(Boolean)
      ),
    ]);
    bestHits = slugs.map((slug, i) => ({ slug, name: slug, objectID: String(i) }));
  }

  return bestHits;
}

async function fetchCompanyDetail(browser, slug) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const url = `https://www.ycombinator.com/companies/${slug}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const company = await page.evaluate(() => {
      const el = document.querySelector('[data-page]');
      if (!el) return null;
      const data = JSON.parse(el.getAttribute('data-page'));
      return data?.props?.company ?? null;
    });
    return company;
  } finally {
    await context.close();
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function toCsv(companies) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };

  const headers = [
    'name',
    'slug',
    'batch',
    'one_liner',
    'website',
    'yc_url',
    'industry',
    'subindustry',
    'tags',
    'team_size',
    'location',
    'stage',
    'status',
    'is_hiring',
    'founder_names',
    'founder_linkedin',
    'founder_twitter',
  ];

  const rows = companies.map((c) => {
    const founders = c.founders ?? [];
    return [
      c.name,
      c.slug,
      c.batch,
      c.one_liner,
      c.website,
      c.yc_url,
      c.industry,
      c.subindustry,
      (c.tags ?? []).join('; '),
      c.team_size,
      c.location,
      c.stage,
      c.status,
      c.is_hiring,
      founders.map((f) => f.full_name).join('; '),
      founders
        .map((f) => f.linkedin_url)
        .filter(Boolean)
        .join('; '),
      founders
        .map((f) => f.twitter_url)
        .filter(Boolean)
        .join('; '),
    ].map(escape);
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  mkdirSync(args.outDir, { recursive: true });

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: args.headless });
  const page = await browser.newPage();

  console.log('Fetching company listing from:', args.url);
  const hits = await fetchListing(page, args.url);
  await page.close();

  let listings = hits.map(normalizeAlgoliaHit);
  const seen = new Set();
  listings = listings.filter((c) => {
    if (!c.slug || seen.has(c.slug)) return false;
    seen.add(c.slug);
    return true;
  });

  if (args.limit > 0) listings = listings.slice(0, args.limit);

  console.log(`Found ${listings.length} companies`);

  let companies;
  if (args.skipDetails) {
    companies = listings;
  } else {
    console.log(`Fetching detail pages (concurrency=${args.concurrency})...`);
    let done = 0;
    const details = await mapPool(listings, args.concurrency, async (listing) => {
      try {
        const detail = await fetchCompanyDetail(browser, listing.slug);
        done++;
        if (done % 25 === 0 || done === listings.length) {
          console.log(`  ${done}/${listings.length} detail pages`);
        }
        return detail ? normalizeCompanyDetail(detail, listing) : listing;
      } catch (err) {
        console.warn(`  Failed ${listing.slug}: ${err.message}`);
        return { ...listing, scrape_error: err.message };
      }
    });
    companies = details;
  }

  const payload = {
    scraped_at: new Date().toISOString(),
    source_url: args.url,
    batches: BATCHES,
    company_count: companies.length,
    companies,
  };

  const jsonPath = join(args.outDir, 'yc_companies.json');
  const csvPath = join(args.outDir, 'yc_companies.csv');

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(csvPath, toCsv(companies));

  await browser.close();

  const withFounders = companies.filter((c) => (c.founders ?? []).length > 0).length;
  console.log(`\nDone. Wrote ${companies.length} companies to:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${csvPath}`);
  if (!args.skipDetails) console.log(`  ${withFounders} companies have founder profiles`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
