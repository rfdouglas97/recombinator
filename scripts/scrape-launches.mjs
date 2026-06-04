#!/usr/bin/env node
/**
 * Scrape YC Launches index via Playwright (Algolia browse API on page load + scroll).
 * https://www.ycombinator.com/launches
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'output/launches/launches-raw.json');

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    limit: 0,
    headless: true,
    since: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (a === '--since' && argv[i + 1]) args.since = argv[++i];
    else if (a === '--headed') args.headless = false;
    else if (a === '--help') {
      console.log(`Usage: node scripts/scrape-launches.mjs [options]

Options:
  --out <path>     Output JSON (default: output/launches/launches-raw.json)
  --limit <n>      Max launches to return (0 = all loaded)
  --since <iso>    Only launches created on or after this ISO date
  --headed         Show browser window
  --help           Show help
`);
      process.exit(0);
    }
  }
  return args;
}

function normalizeLaunchHit(hit) {
  const company = hit.company ?? {};
  return {
    launch_id: hit.id,
    launch_slug: hit.slug,
    launch_url: `https://www.ycombinator.com/launches/${hit.slug}`,
    title: hit.title ?? null,
    tagline: hit.tagline ?? null,
    body: hit.body ?? null,
    created_at: hit.created_at ?? null,
    total_vote_count: hit.total_vote_count ?? 0,
    company_slug: company.slug ?? null,
    company_name: company.name ?? null,
    company_website: company.url ?? null,
    company_batch: company.batch ?? null,
    company_industry: company.industry ?? null,
    company_id: company.id ?? company.model_id ?? null,
    author_name: hit.user?.name ?? null,
    scraped_at: new Date().toISOString(),
  };
}

async function fetchLaunches({ headless, limit, since }) {
  const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const launch = async () => {
    const browser = await chromium.launch({ headless });
    const page = await browser.newPage();
    const hitsById = new Map();

    page.on('response', async (response) => {
      if (!response.url().includes('algolia.net') || !response.url().includes('queries')) return;
      try {
        const json = await response.json();
        for (const result of json.results ?? []) {
          for (const hit of result.hits ?? []) {
            if (hit.id != null) hitsById.set(hit.id, hit);
          }
        }
      } catch (_) {}
    });

    await page.goto('https://www.ycombinator.com/launches', {
      waitUntil: 'networkidle',
      timeout: 90_000,
    });

    let prev = 0;
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
      const linkCount = await page.locator('a[href*="/launches/"]').count();
      if (linkCount === prev && hitsById.size > 0) break;
      prev = linkCount;
    }

    await page.waitForTimeout(1000);
    await browser.close();
    return [...hitsById.values()];
  };

  let hits = await launch();

  if (since) {
    const cutoff = new Date(since).getTime();
    hits = hits.filter((h) => new Date(h.created_at).getTime() >= cutoff);
  }

  hits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (limit > 0) hits = hits.slice(0, limit);

  return hits.map(normalizeLaunchHit);
}

export async function scrapeLaunches(opts = {}) {
  return fetchLaunches({
    headless: opts.headless ?? true,
    limit: opts.limit ?? 0,
    since: opts.since ?? null,
  });
}

async function main() {
  const args = parseArgs(process.argv);
  mkdirSync(dirname(args.out), { recursive: true });

  console.log('Scraping YC Launches…');
  const launches = await scrapeLaunches(args);

  const payload = {
    scraped_at: new Date().toISOString(),
    source: 'https://www.ycombinator.com/launches',
    count: launches.length,
    launches,
  };

  writeFileSync(args.out, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${launches.length} launches → ${args.out}`);
}

if (process.argv[1]?.endsWith('scrape-launches.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export function loadLaunchesRaw(path = DEFAULT_OUT) {
  if (!existsSync(path)) return { launches: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}
