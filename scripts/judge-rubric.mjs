/**
 * LLM judge for generated startup candidates.
 *
 * One cheap-model call ranks all surviving candidates jointly — relative
 * ranking discriminates better than independent per-candidate scores and
 * costs a third as much. Real YC transfer analogs anchor "good"; human-
 * rejected library cards anchor "bad".
 */

import { chatStructured, resolveJudgeApiConfig } from '../agent/llm.mjs';
import { JUDGE_VERDICT_SCHEMA, judgeScoreFromDimensions } from './generator-schema.mjs';
import { cachedByFiles } from './data-cache.mjs';
import {
  loadLibraryDoc,
  loadArchiveDoc,
  loadJudgmentsDoc,
  LIBRARY_PATH,
  ARCHIVE_PATH,
  JUDGMENTS_PATH,
} from '../server/library-store.mjs';

const JUDGE_SYSTEM = `You are a skeptical YC partner evaluating synthetic startup ideas generated for whitespace cells in a business-model × vertical × phenotype taxonomy built from ~1,000 real YC companies.

Score each candidate 0-4 on five dimensions:
- buyer_specificity: Does it name a real paying role and budget line, or just "businesses"?
- wedge_credibility: Is the AI mechanism specific and technically plausible for this workflow, or generic "AI platform" hand-waving?
- why_now: Is there a concrete inflection (regulation, cost curve, model capability, labor shortage) or boilerplate urgency?
- differentiation: Is it meaningfully distinct from the real companies listed (especially any nearest_real_company), or a thin re-skin?
- transfer_proof: Does the batch-analog argument actually hold — same buyer dynamics, same workflow shape — or is the analogy superficial?

Judge RELATIVELY: the ranking between candidates matters more than absolute scores. Be harsh — most synthetic ideas deserve 1-2 on at least one dimension. A candidate that resembles the human-rejected examples should rank last. Set fatal_flaw (string) only for disqualifying problems (incoherent buyer, impossible economics, duplicate of a real company); otherwise null. critique must name the single most fixable weakness, concretely.`;

/**
 * Join human judgments onto cards so verdicts become judge-prompt exemplars.
 * Cached on the underlying library files' mtimes.
 */
export function harvestJudgmentExemplars({ maxRejects = 3, maxPromising = 3 } = {}) {
  return cachedByFiles(
    'judgment-exemplars',
    [LIBRARY_PATH, ARCHIVE_PATH, JUDGMENTS_PATH],
    () => {
      const judgments = loadJudgmentsDoc().judgments ?? {};
      const cardsById = new Map(
        [...loadLibraryDoc().cards, ...loadArchiveDoc().cards].map((c) => [c.id, c])
      );

      const pick = (verdict, max) =>
        Object.values(judgments)
          .filter((j) => j.verdict === verdict && cardsById.has(j.card_id))
          .sort((a, b) => (b.notes?.length ?? 0) - (a.notes?.length ?? 0))
          .slice(0, max)
          .map((j) => {
            const card = cardsById.get(j.card_id);
            return {
              name: card.startup?.name,
              one_liner: card.startup?.one_liner,
              long_description: card.startup?.long_description,
              human_notes: j.notes || null,
            };
          });

      return {
        rejects: pick('reject', maxRejects),
        promising: pick('promising', maxPromising),
      };
    }
  );
}

/**
 * Rank candidates jointly. Returns { verdicts, winnerIndex, raw } where
 * verdicts[i] = { judge_score, scores, fatal_flaw, critique } aligned to input order.
 */
export async function judgeCandidates({
  cell,
  vertical,
  ideaContext,
  candidates,
  apiConfig = resolveJudgeApiConfig(),
}) {
  if (!candidates.length) throw new Error('judgeCandidates: no candidates');

  const exemplars = harvestJudgmentExemplars();
  const user = JSON.stringify(
    {
      target_cell: cell,
      vertical: vertical
        ? {
            label: vertical.label,
            workflow: vertical.workflow,
            buyers: vertical.buyers ?? [],
            sector_label: vertical.sector_label,
          }
        : null,
      real_transfer_analogs_for_reference: (ideaContext?.transfer_analogs ?? []).map((a) => ({
        name: a.name,
        one_liner: a.one_liner,
        buyer: a.buyer,
      })),
      human_rejected_examples: exemplars.rejects,
      human_promising_examples: exemplars.promising,
      candidates: candidates.map((c, index) => ({
        index,
        name: c.record.name,
        one_liner: c.record.one_liner,
        long_description: c.record.long_description,
        what_they_sell: c.record.what_they_sell,
        who_pays: c.record.who_pays,
        why_good_idea: c.record.why_good_idea,
        nearest_real_company: c.novelty?.nearest ?? null,
        validation_issues: c.validation?.errors ?? [],
      })),
      instruction:
        'Score every candidate, then rank from best to worst. winner_index must be the index of the best candidate without a fatal flaw (or the least-bad if all are flawed).',
    },
    null,
    2
  );

  const { data, usage } = await chatStructured({
    system: JUDGE_SYSTEM,
    user,
    schema: JUDGE_VERDICT_SCHEMA,
    apiConfig,
    temperature: 0,
    maxTokens: 2000,
  });

  const verdicts = candidates.map((_, i) => {
    const entry = (data.candidates ?? []).find((c) => c.index === i) ?? null;
    return {
      judge_score: entry ? judgeScoreFromDimensions(entry.scores) : 0,
      scores: entry?.scores ?? null,
      fatal_flaw: entry?.fatal_flaw ?? null,
      critique: entry?.critique ?? null,
    };
  });

  let winnerIndex = Number.isInteger(data.winner_index) ? data.winner_index : 0;
  if (winnerIndex < 0 || winnerIndex >= candidates.length) winnerIndex = 0;
  // Don't let a fatally-flawed candidate win while a clean one exists.
  if (verdicts[winnerIndex]?.fatal_flaw) {
    const clean = verdicts
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => !v.fatal_flaw)
      .sort((a, b) => b.v.judge_score - a.v.judge_score);
    if (clean.length) winnerIndex = clean[0].i;
  }

  return {
    verdicts,
    winnerIndex,
    winner_rationale: data.winner_rationale ?? null,
    ranking: data.ranking ?? null,
    usage,
  };
}
