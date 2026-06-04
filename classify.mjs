#!/usr/bin/env node
/**
 * Build taxonomy-classified output from scraped YC data.
 * Includes YC-provided descriptions and website links on every record.
 *
 * Usage:
 *   node classify.mjs              # all companies, heuristic draft labels
 *   node classify.mjs --limit 20   # pilot sample
 *   node classify.mjs --pending    # structure only, taxonomy left for agent review
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { classifyHeuristic } from './taxonomy/classify-rules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_VERSION = '0.1';

function parseArgs(argv) {
  const args = {
    input: join(__dirname, 'output', 'yc_companies.json'),
    out: join(__dirname, 'output', 'yc_companies_classified.json'),
    limit: 0,
    pendingOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' && argv[i + 1]) args.input = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
    else if (a === '--pending') args.pendingOnly = true;
    else if (a === '--help') {
      console.log(`Usage: node classify.mjs [options]

Options:
  --input <path>   Scraped JSON (default: output/yc_companies.json)
  --out <path>     Classified output (default: output/yc_companies_classified.json)
  --limit <n>      Only process first N companies
  --pending        Omit heuristic labels (empty taxonomy for agent pass)
  --help           Show help
`);
      process.exit(0);
    }
  }
  return args;
}

function buildDescription(company) {
  const oneLiner = (company.one_liner ?? '').trim() || null;
  const longDescription = (company.long_description ?? '').trim() || null;
  const parts = [oneLiner, longDescription].filter(Boolean);
  return {
    one_liner: oneLiner,
    long_description: longDescription,
    /** Full text as YC provides it (short + long when both exist) */
    combined: parts.length ? parts.join('\n\n') : null,
  };
}

function buildCompanyRecord(company, taxonomy, options) {
  return {
    name: company.name,
    slug: company.slug,
    batch: company.batch ?? null,
    website: company.website ?? null,
    yc_profile_url: company.yc_url ?? `https://www.ycombinator.com/companies/${company.slug}`,
    description: buildDescription(company),
    location: company.location ?? null,
    team_size: company.team_size ?? null,
    founders: (company.founders ?? []).map((f) => ({
      full_name: f.full_name,
      title: f.title,
      linkedin_url: f.linkedin_url ?? null,
      twitter_url: f.twitter_url ?? null,
    })),
    yc_industries: company.industries ?? [],
    yc_tags: company.tags ?? [],
    taxonomy,
  };
}

function emptyTaxonomy() {
  return {
    version: TAXONOMY_VERSION,
    status: 'pending_review',
    sector_primary: null,
    sector_secondary: null,
    business_model_primary: null,
    business_model_secondary: null,
    ai_role: null,
    delivery: [],
    buyer: [],
    monetization_hypothesis: null,
    flags: [],
    confidence: null,
    rationale: null,
    classified_at: null,
    method: null,
  };
}

function applyTaxonomy(company, pendingOnly) {
  if (pendingOnly) return emptyTaxonomy();
  const result = classifyHeuristic(company);
  return {
    version: TAXONOMY_VERSION,
    status: 'heuristic_draft',
    sector_primary: result.sector_primary,
    sector_secondary: result.sector_secondary,
    business_model_primary: result.business_model_primary,
    business_model_secondary: result.business_model_secondary,
    ai_role: result.ai_role,
    delivery: result.delivery,
    buyer: result.buyer,
    monetization_hypothesis: result.monetization_hypothesis,
    flags: result.flags,
    confidence: result.confidence,
    rationale: result.rationale,
    classified_at: new Date().toISOString(),
    method: result.method,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const raw = JSON.parse(readFileSync(args.input, 'utf8'));
  let companies = raw.companies ?? raw;
  if (args.limit > 0) companies = companies.slice(0, args.limit);

  const records = companies.map((c) => {
    const taxonomy = applyTaxonomy(c, args.pendingOnly);
    return buildCompanyRecord(c, taxonomy, args);
  });

  const payload = {
    generated_at: new Date().toISOString(),
    taxonomy_version: TAXONOMY_VERSION,
    source_scrape: args.input,
    classification_mode: args.pendingOnly ? 'pending' : 'heuristic_draft',
    company_count: records.length,
    schema: {
      company: {
        name: 'string',
        slug: 'string',
        batch: 'string | null',
        website: 'string | null — company site from YC',
        yc_profile_url: 'string — YC directory page',
        description: {
          one_liner: 'string | null — YC tagline',
          long_description: 'string | null — YC full description',
          combined: 'string | null — one_liner + long_description',
        },
      },
      taxonomy: 'see taxonomy/v0.1.json for business_model codes',
    },
    companies: records,
  };

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${records.length} records → ${args.out}`);
  if (!args.pendingOnly) {
    const low = records.filter((r) => (r.taxonomy.confidence ?? 0) < 0.65).length;
    console.log(`  ${low} records with confidence < 0.65 (good candidates for manual review)`);
  }
}

main();
