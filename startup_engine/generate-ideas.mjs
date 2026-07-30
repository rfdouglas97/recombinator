/**
 * Step 2: Feed shortlisted whitespace into generator-lib → YC startup ideas.
 */

import { writeFileSync, mkdirSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';

import { loadDotEnv } from '../agent/env.mjs';
import { resolveApiConfig } from '../agent/llm.mjs';
import { EVAL_PATHS, loadJson } from '../scripts/eval-utils.mjs';
import { generateSyntheticForCell } from '../scripts/generator-lib.mjs';
import { ideaToCard, sortCards } from './card-lib.mjs';
import { LIBRARY_DIR, OUTPUT_DIR, timestampSlug } from './paths.mjs';

loadDotEnv();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(jobs, concurrency, fn) {
  const results = [];
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    results.push(...(await Promise.all(batch.map(fn))));
    if (i + concurrency < jobs.length) await sleep(250);
  }
  return results;
}

function syntheticIdFor(gap, variant) {
  return `syn-r${gap.rank}-v${variant}-${gap.business_model}-${gap.vertical_id}`.replace(
    /[^a-zA-Z0-9._-]/g,
    '-'
  );
}

function ideaSummary({
  gap,
  variant,
  record,
  validation,
  goodness_index,
  judge_score,
  judge,
  novelty,
  candidates_considered,
  refined,
  idea_context,
  exemplars_used,
}) {
  return {
    gap,
    variant,
    record,
    validation,
    goodness_index,
    judge_score: judge_score ?? null,
    judge: judge ?? null,
    novelty: novelty ?? null,
    candidates_considered: candidates_considered ?? null,
    refined: refined ?? false,
    idea_context,
    exemplars_used,
    rank: gap.rank,
    opportunity_score: gap.opportunity_score,
    transfer_score: gap.transfer_score,
    target_cell: gap.target_cell,
    vertical_label: gap.vertical_label,
    business_model_label: gap.business_model_label,
    name: record.name,
    one_liner: record.one_liner,
    long_description: record.long_description,
    analog_slugs: record.analog_slugs,
    why_good_idea: record.why_good_idea,
  };
}

/**
 * @param {Array} shortlist - from pickInterestingWhitespace().shortlist
 */
export async function generateIdeasForShortlist(shortlist, options = {}) {
  const k = options.k ?? 1;
  const concurrency = options.concurrency ?? 3;
  const onProgress = options.onProgress ?? (() => {});

  if (!shortlist?.length) {
    throw new Error('Shortlist is empty');
  }

  const apiConfig = options.apiConfig ?? resolveApiConfig();
  if (!apiConfig) {
    throw new Error('Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
  }

  const jobs = [];
  for (const gap of shortlist) {
    for (let v = 0; v < k; v++) {
      jobs.push({ gap, variant: v + 1 });
    }
  }

  let done = 0;
  const generated = await runBatch(jobs, concurrency, async ({ gap, variant }) => {
    try {
      const result = await generateSyntheticForCell(gap.target_cell, {
        syntheticId: syntheticIdFor(gap, variant),
        variantIndex: variant,
        apiConfig,
        // Batch path: best-of-2 per gap keeps library cost in check.
        candidates: options.candidatesPerGap ?? 2,
      });
      done++;
      onProgress({
        done,
        total: jobs.length,
        status: 'ok',
        gap,
        name: result.record.name,
        goodness: result.goodness_index?.overall,
        band: result.goodness_index?.band,
      });
      return { gap, variant, ...result };
    } catch (err) {
      done++;
      onProgress({ done, total: jobs.length, status: 'error', gap, error: err.message });
      return { gap, variant, error: err.message };
    }
  });

  const ok = generated.filter((g) => g.record);
  return {
    generated_at: new Date().toISOString(),
    stats: {
      gaps: shortlist.length,
      requested: jobs.length,
      succeeded: ok.length,
      failed: generated.length - ok.length,
    },
    ideas: ok.map(ideaSummary),
    errors: generated.filter((g) => g.error),
  };
}

export function writeIdeas(result, pickResult, outPath = null) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(LIBRARY_DIR, { recursive: true });

  const path = outPath ?? join(OUTPUT_DIR, `ideas-${timestampSlug()}.json`);
  const payload = {
    ...result,
    shortlist: pickResult?.shortlist ?? [],
    pick_filters: pickResult?.filters ?? null,
  };
  writeFileSync(path, JSON.stringify(payload, null, 2));

  const gapDoc = existsSync(EVAL_PATHS.gaps) ? loadJson(EVAL_PATHS.gaps) : null;
  const matrixGapCount = gapDoc?.gap_count ?? null;

  const cards = sortCards(result.ideas.map((idea) => ideaToCard(idea, { matrixGapCount }))).map(
    (c, i) => ({ ...c, card_rank: i + 1 })
  );

  const library = {
    generated_at: result.generated_at,
    stats: result.stats,
    card_count: cards.length,
    cards,
    shortlist: pickResult?.shortlist ?? [],
  };

  const libraryPath = join(LIBRARY_DIR, 'library.json');
  writeFileSync(libraryPath, JSON.stringify(library, null, 2));

  const jsonlPath = join(LIBRARY_DIR, 'cards.jsonl');
  for (const card of cards) {
    appendFileSync(jsonlPath, `${JSON.stringify(card)}\n`);
  }

  return { ideasPath: path, libraryPath, jsonlPath };
}
