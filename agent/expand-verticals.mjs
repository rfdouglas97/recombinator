#!/usr/bin/env node
/**
 * LLM vertical expansion — one batch per industry in taxonomy/verticals-data.mjs
 *
 * Usage:
 *   node agent/expand-verticals.mjs [--resume] [--fresh] [--limit N] [--concurrency 4]
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadDotEnv } from './env.mjs';
import { chatJson, resolveApiConfig } from './llm.mjs';
import {
  expansionSystemPrompt,
  expansionUserPrompt,
  expansionReflectionSystemPrompt,
  expansionReflectionUserPrompt,
} from './vertical-prompts.mjs';
import { SECTORS, INDUSTRIES, VERTICALS } from '../taxonomy/verticals-data.mjs';
import { mergeProposals, writeMergeOutputs } from '../taxonomy/merge-verticals.mjs';
import { emitVerticalsJson } from '../taxonomy/verticals.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output/verticals');

const PATHS = {
  state: join(OUT, 'expansion-state.json'),
  proposals: join(OUT, 'expansion-proposals.json'),
  proposalsJsonl: join(OUT, 'expansion-proposals.jsonl'),
  log: join(OUT, 'expansion.log'),
};

function parseArgs() {
  const args = { resume: false, fresh: false, limit: 0, concurrency: 0, reflectEvery: 10 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resume') args.resume = true;
    else if (a === '--fresh') args.fresh = true;
    else if (a === '--limit' && argv[++i]) args.limit = parseInt(argv[i], 10);
    else if (a === '--concurrency' && argv[++i]) args.concurrency = parseInt(argv[i], 10);
    else if (a === '--reflect-every' && argv[++i]) args.reflectEvery = parseInt(argv[i], 10);
  }
  return args;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  appendFileSync(PATHS.log, line + '\n');
}

function loadState() {
  if (!existsSync(PATHS.state)) {
    return { processed_industry_ids: [], proposals: [], reflections: [], started_at: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(PATHS.state, 'utf8'));
}

function saveState(state) {
  state.updated_at = new Date().toISOString();
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2));
  writeFileSync(PATHS.proposals, JSON.stringify({ generated_at: state.updated_at, proposals: state.proposals }, null, 2));
}

function resetOutputs() {
  mkdirSync(OUT, { recursive: true });
  for (const p of [PATHS.state, PATHS.proposals, PATHS.proposalsJsonl]) {
    if (existsSync(p)) unlinkSync(p);
  }
  writeFileSync(PATHS.log, '');
}

function resolveExpandApiConfig(base) {
  return {
    ...base,
    model: process.env.VERTICALS_EXPAND_MODEL ?? 'claude-haiku-4-5-20251001',
    maxTokens: parseInt(process.env.VERTICALS_EXPAND_MAX_TOKENS ?? '8192', 10),
  };
}

function ycHintsForIndustry(industryId) {
  const hints = [];
  for (const v of VERTICALS) {
    if (v.industry_id !== industryId) continue;
    for (const yc of v.yc_subindustry ?? []) hints.push(yc);
  }
  return [...new Set(hints)];
}

function sectorForIndustry(industry) {
  return SECTORS.find((s) => s.id === industry.sector_id) ?? { id: industry.sector_id, label: industry.sector_id };
}

function existingForIndustry(industryId) {
  return VERTICALS.filter((v) => v.industry_id === industryId);
}

async function expandIndustry(industry, apiConfig) {
  const sector = sectorForIndustry(industry);
  const existing = existingForIndustry(industry.id);
  const result = await chatJson({
    system: expansionSystemPrompt(),
    user: expansionUserPrompt({
      sector,
      industry,
      existingVerticals: existing,
      ycHints: ycHintsForIndustry(industry.id),
    }),
    apiConfig,
  });

  const proposals = (result.proposals ?? []).map((p) => ({
    ...p,
    industry_id: p.industry_id ?? industry.id,
    source: 'llm_expansion',
    expanded_at: new Date().toISOString(),
    sector_id: sector.id,
  }));

  return { proposals, notes: result.notes ?? '' };
}

async function reflectSector(sector, sectorProposals, apiConfig) {
  try {
    return await chatJson({
      system: expansionReflectionSystemPrompt(),
      user: expansionReflectionUserPrompt(sector, sectorProposals),
      apiConfig,
    });
  } catch (err) {
    log(`  ⟳ Reflection skipped for ${sector.id}: ${err.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadDotEnv();
  const args = parseArgs();
  mkdirSync(OUT, { recursive: true });

  const baseConfig = resolveApiConfig();
  if (!baseConfig) {
    console.error('ANTHROPIC_API_KEY or OPENAI_API_KEY required');
    process.exit(1);
  }
  const apiConfig = resolveExpandApiConfig(baseConfig);

  if (args.fresh) resetOutputs();

  let industries = [...INDUSTRIES];
  if (args.limit > 0) industries = industries.slice(0, args.limit);

  const state = args.resume ? loadState() : { processed_industry_ids: [], proposals: [], reflections: [], started_at: new Date().toISOString() };
  if (!args.resume) {
    state.proposals = [];
    state.processed_industry_ids = [];
    state.reflections = [];
  }

  const done = new Set(state.processed_industry_ids);
  const queue = industries.filter((i) => !done.has(i.id));
  const concurrency = args.concurrency > 0 ? args.concurrency : parseInt(process.env.VERTICALS_EXPAND_CONCURRENCY ?? '4', 10);

  log(
    `Vertical expansion | model=${apiConfig.model} | concurrency=${concurrency} | queue=${queue.length}/${industries.length}`,
  );

  let batchProposalsSinceReflect = 0;
  const sectorProposalBuffer = new Map();

  for (let offset = 0; offset < queue.length; offset += concurrency) {
    const batch = queue.slice(offset, offset + concurrency);
    const batchNum = Math.floor(offset / concurrency) + 1;
    const batchTotal = Math.ceil(queue.length / concurrency);
    log(`\nBatch ${batchNum}/${batchTotal} (${batch.length} industries)...`);

    const results = await Promise.all(
      batch.map(async (industry) => {
        try {
          const { proposals, notes } = await expandIndustry(industry, apiConfig);
          return { industry, proposals, notes, error: null };
        } catch (err) {
          return { industry, proposals: [], notes: '', error: err.message };
        }
      }),
    );

    for (const { industry, proposals, notes, error } of results) {
      if (error) {
        log(`  ✗ ${industry.id}: ${error}`);
        continue;
      }

      state.proposals.push(...proposals);
      for (const p of proposals) {
        appendFileSync(PATHS.proposalsJsonl, JSON.stringify({ industry_id: industry.id, ...p }) + '\n');
      }
      done.add(industry.id);
      state.processed_industry_ids = [...done];
      batchProposalsSinceReflect += proposals.length;

      const sector = sectorForIndustry(industry);
      if (!sectorProposalBuffer.has(sector.id)) sectorProposalBuffer.set(sector.id, []);
      sectorProposalBuffer.get(sector.id).push(...proposals);

      log(`  ✓ ${industry.id}: +${proposals.length} proposals${notes ? ` — ${notes.slice(0, 80)}` : ''}`);
    }

    saveState(state);

    if (batchProposalsSinceReflect >= args.reflectEvery * 12) {
      for (const sector of SECTORS) {
        const buf = sectorProposalBuffer.get(sector.id);
        if (!buf?.length) continue;
        log(`  ⟳ Reflecting on ${sector.label} (${buf.length} proposals)...`);
        const reflection = await reflectSector(sector, buf, apiConfig);
        if (reflection) {
          state.reflections.push({ at: new Date().toISOString(), sector_id: sector.id, ...reflection });
        }
        sectorProposalBuffer.set(sector.id, []);
      }
      batchProposalsSinceReflect = 0;
      saveState(state);
    }

    await sleep(200);
  }

  log('\nMerging proposals...');
  const mergeResult = mergeProposals(state.proposals);
  writeMergeOutputs(mergeResult);
  emitVerticalsJson();

  log('\n✓ Vertical expansion complete');
  log(`  Raw proposals:    ${state.proposals.length}`);
  log(`  Approved (new):   ${mergeResult.stats.approved}`);
  log(`  Rejected:         ${mergeResult.stats.rejected}`);
  log(`  Total verticals:  ${mergeResult.stats.total_after_merge}`);
  log(`  Proposals file:   ${PATHS.proposals}`);
  log(`  Approved file:    ${join(OUT, 'expansion-approved.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
