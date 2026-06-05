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

function normalizeAlgoliaHit(hit) {
  return {
    id: hit.id,
    object_id: hit.objectID,
    name: hit.name,
    slug: hit.slug,
    former_names: hit.former_names ?? [],
    website: hit.website ?? null,
    yc_url: `https://www.ycombinator.com/companies/${hit.slug}`,
    one_liner: hit.one_liner ?? null,
    long_description: hit.long_description ?? null,
    batch: hit.batch ?? null,
    status: hit.status ?? null,
    stage: hit.stage ?? null,
    industry: hit.industry ?? null,
    subindustry: hit.subindustry ?? null,
    industries: hit.industries ?? [],
    tags: hit.tags ?? [],
    team_size: hit.team_size ?? null,
    location: hit.all_locations ?? null,
    regions: hit.regions ?? [],
    is_hiring: hit.isHiring ?? false,
    nonprofit: hit.nonprofit ?? false,
    top_company: hit.top_company ?? false,
    launched_at: hit.launched_at ?? null,
    logo_url: hit.small_logo_thumb_url ?? null,
  };
}

function normalizeFounder(f) {
  return {
    user_id: f.user_id,
    full_name: f.full_name,
    title: f.title,
    is_active: f.is_active,
    bio: f.founder_bio ?? null,
    linkedin_url: f.linkedin_url ?? null,
    twitter_url: f.twitter_url ?? null,
    avatar_url: f.avatar_thumb_url ?? null,
    has_email: f.has_email ?? false,
    latest_yc_company: f.latest_yc_company ?? null,
  };
}

function normalizeCompanyDetail(company, listing) {
  const industries = listing?.industries ?? [];
  return {
    ...listing,
    name: company.name ?? listing?.name,
    slug: company.slug ?? listing?.slug,
    batch: company.batch_name ?? listing?.batch,
    batch_code: company.batch ?? null,
    one_liner: company.one_liner ?? listing?.one_liner,
    long_description: company.long_description ?? listing?.long_description,
    website: company.website ?? listing?.website,
    yc_url: company.ycdc_url ?? listing?.yc_url,
    year_founded: company.year_founded ?? null,
    team_size: company.team_size ?? listing?.team_size,
    location: company.location ?? listing?.location,
    city: company.city ?? null,
    country: company.country ?? null,
    status: company.ycdc_status ?? listing?.status,
    tags: company.tags ?? listing?.tags ?? [],
    industry: industries[0] ?? listing?.industry ?? null,
    subindustry: industries.length > 1 ? industries.slice(1).join(' / ') : listing?.subindustry,
    industries,
    business_model: {
      primary_industry: industries[0] ?? listing?.industry ?? null,
      sub_industries: industries.slice(1),
      tags: company.tags ?? listing?.tags ?? [],
      stage: listing?.stage ?? null,
    },
    social_links: {
      linkedin: company.linkedin_url ?? null,
      twitter: company.twitter_url ?? null,
      facebook: company.fb_url ?? null,
      github: company.github_url ?? null,
      crunchbase: company.cb_url ?? null,
    },
    primary_group_partner: company.primary_group_partner ?? null,
    logo_url: company.logo_url ?? listing?.logo_url,
    company_photos: company.company_photos ?? [],
    app_video_url: company.app_video_url ?? null,
    demo_day_video_url: company.dday_video_url ?? null,
    founders: (company.founders ?? []).map(normalizeFounder),
  };
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
      founders.map((f) => f.linkedin_url).filter(Boolean).join('; '),
      founders.map((f) => f.twitter_url).filter(Boolean).join('; '),
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
