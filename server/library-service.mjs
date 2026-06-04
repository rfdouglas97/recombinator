/**
 * Startup library: pick whitespace, generate cards, merge with judgments.
 */

import { existsSync } from 'fs';

import { resolveApiConfig } from '../agent/llm.mjs';
import { tokenSet, normalizeText, EVAL_PATHS, loadJson } from '../scripts/eval-utils.mjs';
import { findWhitespaceGaps } from '../scripts/generator-lib.mjs';
import { gapToShortlistEntry, DEFAULT_PICK } from '../startup_engine/pick-whitespace.mjs';
import { verticalDepth } from '../whitespace/lib/sharpness.mjs';
import { evaluatePairingValidity } from '../whitespace/lib/pairing-validity.mjs';
import { generateIdeasForShortlist } from '../startup_engine/generate-ideas.mjs';
import { ideaToCard, sortCards } from '../startup_engine/card-lib.mjs';
import { INPUT } from '../startup_engine/paths.mjs';

import {
  loadLibraryDoc,
  saveLibraryDoc,
  mergeJudgmentsOntoCards,
  saveJudgment,
  appendCardJsonl,
  loadJudgmentsDoc,
  loadArchiveDoc,
  archiveCardById,
  restoreCardById,
} from './library-store.mjs';

function gapQueryScore(gap, queryTokens) {
  if (!queryTokens.size) return 1;
  const hay = normalizeText(
    [gap.vertical_label, gap.industry_label, gap.sector_label, gap.workflow, gap.business_model_label].join(' '),
  );
  const hayTokens = tokenSet(hay);
  let inter = 0;
  for (const t of queryTokens) if (hayTokens.has(t)) inter++;
  if (inter === 0) return 0;
  return inter / queryTokens.size;
}

function passesSharpFilters(g, opts) {
  if (verticalDepth(g.vertical_id) < opts.minDepth) return false;
  if ((g.opportunity_score ?? 0) < opts.minOpportunity) return false;
  if (opts.requireRelevantAnalog && g.flags?.includes('no_relevant_analog')) return false;
  if (g.flags?.includes('weak_analog') && (g.opportunity_score ?? 0) < 42) return false;
  if (g.flags?.includes('catalog_bucket') || g.flags?.includes('generic_label')) return false;
  if (!evaluatePairingValidity(g).valid) return false;
  return true;
}

/**
 * Pick whitespace gaps for batch generation, respecting guidance and excluding existing cells.
 */
export function pickGapsForGeneration({
  count = 5,
  query = '',
  sectorId = '',
  industryId = '',
  businessModel = '',
  excludeCellKeys = new Set(),
  minOpportunity = DEFAULT_PICK.minOpportunity,
  minDepth = DEFAULT_PICK.minDepth,
  requireRelevantAnalog = DEFAULT_PICK.requireRelevantAnalog,
} = {}) {
  const queryTokens = tokenSet(query);
  const opts = { minOpportunity, minDepth, requireRelevantAnalog };

  if (existsSync(INPUT.rankedGaps)) {
    const ranked = loadJson(INPUT.rankedGaps);
    let gaps = (ranked.gaps ?? []).filter((g) => passesSharpFilters(g, opts));

    if (sectorId) gaps = gaps.filter((g) => g.sector_id === sectorId);
    if (industryId) {
      gaps = gaps.filter(
        (g) => g.vertical_id === industryId || g.vertical_id.startsWith(`${industryId}.`),
      );
    }
    if (businessModel) gaps = gaps.filter((g) => g.business_model === businessModel);

    gaps = gaps
      .map((g) => ({ gap: g, score: gapQueryScore(g, queryTokens) }))
      .filter(({ score }) => score > 0 || !queryTokens.size)
      .sort((a, b) => {
        if (queryTokens.size) {
          const sd = b.score - a.score;
          if (sd !== 0) return sd;
        }
        return (b.gap.opportunity_score ?? 0) - (a.gap.opportunity_score ?? 0);
      })
      .map(({ gap }) => gap);

    const picked = [];
    for (const g of gaps) {
      const key = `${g.business_model}|${g.vertical_id}`;
      if (excludeCellKeys.has(key)) continue;
      picked.push(gapToShortlistEntry(g));
      if (picked.length >= count) break;
    }
    return picked;
  }

  // Fallback: gap-candidates search
  const found = findWhitespaceGaps({
    sectorId,
    industryId,
    businessModel,
    query,
    limit: count * 4,
  });
  const picked = [];
  for (const g of found) {
    if (excludeCellKeys.has(g.cell_key)) continue;
    picked.push({
      ...g,
      rank: null,
      opportunity_score: null,
      transfer_score: g.relevance_score,
      phenotype_primary_id: g.target_cell.phenotype_primary_id,
      analog_slugs: [],
    });
    if (picked.length >= count) break;
  }
  return picked;
}

export function getLibrary() {
  const doc = loadLibraryDoc();
  const archive = loadArchiveDoc();
  const gapDoc = existsSync(EVAL_PATHS.gaps) ? loadJson(EVAL_PATHS.gaps) : null;
  const matrixGapCount = gapDoc?.gap_count ?? null;

  let cards = mergeJudgmentsOntoCards(doc.cards);
  cards = sortCards(cards).map((c, i) => ({
    ...c,
    card_rank: i + 1,
    whitespace: { ...c.whitespace, matrix_gap_count: c.whitespace.matrix_gap_count ?? matrixGapCount },
  }));

  const judgments = loadJudgmentsDoc().judgments ?? {};
  const judgedCount = Object.keys(judgments).length;

  return {
    updated_at: doc.updated_at,
    card_count: cards.length,
    archived_count: archive.cards.length,
    cards,
    batches: doc.batches ?? [],
    stats: {
      judged: judgedCount,
      reject: Object.values(judgments).filter((j) => j.verdict === 'reject' || j.archived).length,
      promising: Object.values(judgments).filter((j) => j.verdict === 'promising').length,
      archived: archive.cards.length,
    },
  };
}

export function getArchivedLibrary() {
  const archive = loadArchiveDoc();
  const gapDoc = existsSync(EVAL_PATHS.gaps) ? loadJson(EVAL_PATHS.gaps) : null;
  const matrixGapCount = gapDoc?.gap_count ?? null;

  let cards = mergeJudgmentsOntoCards(archive.cards).map((c) => ({
    ...c,
    archived: true,
    judgment: c.judgment ?? 'reject',
  }));

  cards = sortCards(cards).map((c, i) => ({
    ...c,
    card_rank: i + 1,
    whitespace: { ...c.whitespace, matrix_gap_count: c.whitespace.matrix_gap_count ?? matrixGapCount },
  }));

  return {
    updated_at: archive.updated_at,
    card_count: cards.length,
    archived_count: cards.length,
    cards,
    stats: { archived: cards.length },
  };
}

export async function generateMoreCards(options = {}, onProgress = () => {}) {
  if (!resolveApiConfig()) {
    throw new Error('Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
  }

  const count = Math.min(Math.max(parseInt(options.count ?? 5, 10), 1), 30);
  const doc = loadLibraryDoc();
  const archive = loadArchiveDoc();
  const excludeCellKeys = new Set([
    ...doc.cards.map((c) => c.whitespace?.cell_key),
    ...archive.cards.map((c) => c.whitespace?.cell_key),
  ].filter(Boolean));

  const shortlist = pickGapsForGeneration({
    count,
    query: options.query ?? '',
    sectorId: options.sectorId ?? '',
    industryId: options.industryId ?? '',
    businessModel: options.businessModel ?? '',
    excludeCellKeys,
    minOpportunity: options.minOpportunity ?? DEFAULT_PICK.minOpportunity,
  });

  if (!shortlist.length) {
    throw new Error(
      'No new whitespace gaps match your filters (or all matching cells are already in the library). Try broader guidance.',
    );
  }

  onProgress({ phase: 'generating', done: 0, total: shortlist.length });

  const gapDoc = existsSync(EVAL_PATHS.gaps) ? loadJson(EVAL_PATHS.gaps) : null;
  const matrixGapCount = gapDoc?.gap_count ?? null;

  const result = await generateIdeasForShortlist(shortlist, {
    k: 1,
    concurrency: Math.min(options.concurrency ?? 3, 5),
    onProgress: ({ done, total, status, name, error }) => {
      onProgress({ phase: 'generating', done, total, status, name, error });
    },
  });

  const newCards = result.ideas.map((idea) => ideaToCard(idea, { matrixGapCount }));

  for (const card of newCards) {
    appendCardJsonl(card);
  }

  doc.cards = [...doc.cards, ...newCards];
  doc.batches = [
    ...(doc.batches ?? []),
    {
      at: result.generated_at,
      requested: count,
      picked: shortlist.length,
      succeeded: result.stats.succeeded,
      failed: result.stats.failed,
      guidance: {
        query: options.query ?? '',
        sectorId: options.sectorId ?? '',
        industryId: options.industryId ?? '',
        businessModel: options.businessModel ?? '',
      },
    },
  ];

  saveLibraryDoc(doc);

  return {
    new_cards: mergeJudgmentsOntoCards(newCards),
    stats: result.stats,
    errors: result.errors,
    library: getLibrary(),
  };
}

export function recordJudgment(cardId, { verdict, human_score, notes }) {
  if (!cardId) throw new Error('card_id required');
  const entry = saveJudgment(cardId, { verdict, human_score, notes });
  return { judgment: entry, library: getLibrary() };
}

export function archiveCard(cardId, { notes = '' } = {}) {
  if (!cardId) throw new Error('card_id required');
  const archived = archiveCardById(cardId, { notes });
  return { archived, library: getLibrary() };
}

export function restoreCard(cardId) {
  if (!cardId) throw new Error('card_id required');
  const restored = restoreCardById(cardId);
  return { restored, library: getLibrary(), archive: getArchivedLibrary() };
}
