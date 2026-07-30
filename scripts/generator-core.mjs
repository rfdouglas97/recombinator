/**
 * Generate-then-select core for the startup generator.
 *
 * Per cell: N candidates in parallel at high temperature with distinct angle
 * hints → cheap hard gates (taxonomy validation + novelty vs the real corpus
 * and existing library) → one joint LLM-judge ranking → optional single
 * refine pass on the winner using the judge critique.
 *
 * Prompt layout is built for Anthropic prompt caching (2048-token minimum
 * prefix on Sonnet 4.6): a large frozen system block shared by ALL cells,
 * then the per-cell payload as a second cache breakpoint shared by the N
 * candidates, then the per-candidate variant hint last.
 */

import { chatStructured, resolveApiConfig } from '../agent/llm.mjs';
import { SYNTHETIC_RECORD_SCHEMA } from './generator-schema.mjs';
import { computeGoodnessIndex, SHARPNESS_BLOCKLIST } from './goodness-rubric.mjs';
import { PRIMITIVE_TYPES } from './idea-primitives-lib.mjs';
import {
  EVAL_PATHS,
  loadTaxonomyV01,
  loadNormalizedAssignments,
  validateSyntheticFull,
  normalizeText,
  tokenSet,
} from './eval-utils.mjs';
import { judgeCandidates, harvestJudgmentExemplars } from './judge-rubric.mjs';
import { cachedByFiles } from './data-cache.mjs';
import {
  loadLibraryDoc,
  loadArchiveDoc,
  LIBRARY_PATH,
  ARCHIVE_PATH,
  JUDGMENTS_PATH,
} from '../server/library-store.mjs';

const GENERATOR_EFFORT = process.env.GENERATOR_EFFORT ?? 'medium';
const REFINE_THRESHOLD = parseInt(process.env.GENERATOR_REFINE_BELOW ?? '60', 10);

/** effort is supported on Sonnet 4.6 and Opus 4.5+; errors on Haiku / Sonnet 4.5. */
function supportsEffort(model) {
  return /sonnet-4-6|opus-4-[5-9]|fable|mythos/.test(String(model ?? ''));
}

const ONE_LINER_PATTERNS = [
  'AI-native [workflow] for [buyer/vertical]',
  'The [infrastructure layer] for [agent/dev] teams',
  '[Outcome] automation for [entity type]',
];

const GENERATION_SYSTEM_CORE = `You are a venture analyst generating plausible synthetic YC startup profiles for taxonomy gap analysis.

target_cell must be copied exactly from the prompt. phenotype_primary_id must match target_cell.phenotype_primary_id.
delivery and buyer are string arrays using taxonomy enums where possible (SaaS, API, Services, Developer, Enterprise, etc.).

Business quality (required):
- Set idea_primitive_id to default_primitive_type_id from the prompt (or another listed primitive_types id).
- Fill why_good_idea with concrete pain, urgency, ai_wedge, buyer_budget, proof_from_batch.
- For empty matrix cells, proof_from_batch MUST explain what transfers from transfer_analogs (cite slug or company pattern, not name copying).
- analog_slugs: slugs of transfer_analogs you used (if any).
- Reject generic "AI platform" positioning — name buyer + workflow from vertical.
- generation_rationale ties the idea to the target cell and chosen primitive.

Goodness index: maximize buyer_budget, workflow_pain, ai_wedge, urgency, transfer_proof, sharpness. Avoid every anti-pattern phrase listed in the reference material below.

The reference material below applies to every generation request.`;

/**
 * Frozen system block shared across all cells. Rebuilt only when the
 * taxonomy or human-judgment files change (which also rotates the cache).
 */
export function buildStaticSystem() {
  return cachedByFiles(
    'generator-static-system',
    [EVAL_PATHS.taxonomy, LIBRARY_PATH, ARCHIVE_PATH, JUDGMENTS_PATH],
    () => {
      const taxonomy = loadTaxonomyV01();
      const exemplars = harvestJudgmentExemplars();
      const reference = {
        business_model_definitions: taxonomy.business_models ?? {},
        primitive_type_catalog: PRIMITIVE_TYPES,
        goodness_dimensions: {
          buyer_budget: 'Who pays, from what budget line?',
          workflow_pain: 'What manual workflow breaks?',
          ai_wedge: 'What does AI do specifically?',
          urgency: 'Why now?',
          transfer_proof: 'How does a batch analog pattern transfer here?',
          sharpness: 'Concrete one-liner, no buzzwords',
        },
        hard_constraints: [
          'Name a specific buyer role from vertical.buyers when available',
          'Address the workflow pain implied by vertical.workflow',
          'Explain AI wedge using phenotype value_wedge and ai_application',
          'Apply a generalized idea primitive — adapt transfer_analogs to this vertical, do not copy one-liners',
          'why_good_idea.proof_from_batch: why YC would fund this in THIS cell (cite analog pattern if cell is empty)',
          'one_liner: ≤12 words, concrete, YC directory tone',
          'long_description: 2-3 sentences (problem → approach → buyer)',
          'Do NOT copy train exemplar wording verbatim',
          'Do NOT use real YC company names from exemplars',
          'The idea must be distinct from every real company shown — re-skins get rejected',
        ],
        one_liner_patterns: ONE_LINER_PATTERNS,
        global_anti_patterns: SHARPNESS_BLOCKLIST,
        human_rejected_examples:
          exemplars.rejects.length > 0
            ? {
                note: 'Human reviewers rejected these generated ideas. Do not produce ideas with the same failure modes.',
                examples: exemplars.rejects,
              }
            : null,
      };
      return `${GENERATION_SYSTEM_CORE}\n\n${JSON.stringify(reference, null, 2)}`;
    }
  );
}

/** Per-cell payload (second cache breakpoint, shared by the N candidates). */
export function buildCellPayload({ cell, vertical, phenotype, exemplars, ideaContext }) {
  return JSON.stringify(
    {
      task: 'Generate a synthetic YC-style startup for the target taxonomy cell',
      target_cell: cell,
      idea_primitives: ideaContext
        ? {
            default_primitive_type_id: ideaContext.default_primitive_type_id,
            primitive_types: ideaContext.primitive_types,
            thesis_checklist: ideaContext.primitive_types?.[0]?.thesis_checklist ?? [],
            transfer_analogs: ideaContext.transfer_analogs,
            same_cell_instances: ideaContext.same_cell_instances,
            requires_analog_proof: ideaContext.requires_analog_proof,
            anti_patterns: ideaContext.anti_patterns,
          }
        : null,
      vertical: vertical
        ? {
            id: vertical.id,
            label: vertical.label,
            workflow: vertical.workflow,
            buyers: vertical.buyers ?? [],
            regulatory: vertical.regulatory ?? [],
            sector_label: vertical.sector_label,
          }
        : null,
      phenotype: phenotype
        ? {
            id: phenotype.id,
            label: phenotype.label,
            family: phenotype.family,
            value_wedge: phenotype.value_wedge,
            ai_application: phenotype.ai_application,
            description: phenotype.description,
          }
        : null,
      train_exemplars_same_cell: exemplars,
    },
    null,
    2
  );
}

/** Distinct generation angles so parallel candidates explore the cell differently. */
export function buildAngleHints({ ideaContext, vertical }, n) {
  const analogs = ideaContext?.transfer_analogs ?? [];
  const buyers = vertical?.buyers ?? [];
  return Array.from({ length: n }, (_, i) => {
    const parts = [`You are generating variant ${i + 1} of ${n}; take a distinct angle.`];
    if (analogs.length) {
      const a = analogs[i % analogs.length];
      parts.push(`Primary transfer analog to adapt: ${a.name} (${a.slug}) — ${a.one_liner}`);
    }
    if (buyers.length) parts.push(`Anchor the buyer on: ${buyers[i % buyers.length]}`);
    parts.push(
      `One-liner shape to lean toward: "${ONE_LINER_PATTERNS[i % ONE_LINER_PATTERNS.length]}"`
    );
    return parts.join('\n');
  });
}

function jaccardSets(A, B) {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Token sets for every real company + existing library card, cached on file mtimes. */
function noveltyCorpus() {
  return cachedByFiles(
    'novelty-corpus',
    [EVAL_PATHS.normalized, LIBRARY_PATH, ARCHIVE_PATH],
    () => {
      const entries = [];
      for (const r of loadNormalizedAssignments()) {
        if (!r.one_liner) continue;
        entries.push({
          kind: 'company',
          slug: r.slug,
          name: r.name,
          one_liner: r.one_liner,
          nameKey: normalizeText(r.name),
          tokens: tokenSet(`${r.one_liner} ${r.what_they_sell ?? ''}`),
        });
      }
      for (const c of [...loadLibraryDoc().cards, ...loadArchiveDoc().cards]) {
        const s = c.startup ?? {};
        if (!s.one_liner) continue;
        entries.push({
          kind: 'card',
          slug: c.id,
          name: s.name,
          one_liner: s.one_liner,
          nameKey: normalizeText(s.name),
          tokens: tokenSet(`${s.one_liner} ${s.long_description ?? ''}`),
        });
      }
      return entries;
    }
  );
}

export const NOVELTY_DROP_THRESHOLD = 0.8;
export const NOVELTY_FLAG_THRESHOLD = 0.5;

/**
 * Content-similarity gate vs all real companies and existing library cards.
 * >NOVELTY_DROP_THRESHOLD (or a name collision) is disqualifying; above the
 * flag threshold the nearest match is handed to the judge as a
 * differentiation challenge.
 */
export function noveltyCheck(record) {
  const candTokens = tokenSet(`${record.one_liner ?? ''} ${record.long_description ?? ''}`);
  const nameKey = normalizeText(record.name ?? '');
  let best = { sim: 0, entry: null };
  let nameCollision = null;

  for (const entry of noveltyCorpus()) {
    if (nameKey && entry.nameKey === nameKey) nameCollision = entry;
    const sim = jaccardSets(candTokens, entry.tokens);
    if (sim > best.sim) best = { sim, entry };
  }

  const nearest = best.entry
    ? {
        kind: best.entry.kind,
        slug: best.entry.slug,
        name: best.entry.name,
        one_liner: best.entry.one_liner,
        similarity: Math.round(best.sim * 100) / 100,
      }
    : null;

  return {
    max_similarity: Math.round(best.sim * 100) / 100,
    nearest: best.sim >= NOVELTY_FLAG_THRESHOLD ? nearest : null,
    name_collision: nameCollision ? { name: nameCollision.name, kind: nameCollision.kind } : null,
    pass: best.sim <= NOVELTY_DROP_THRESHOLD && !nameCollision,
  };
}

function generationMessages({ cellPayload, variantHint, syntheticId, variant }) {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: cellPayload, cache_control: { type: 'ephemeral' } },
        {
          type: 'text',
          text: `synthetic_id: ${syntheticId}\nvariant_index: ${variant}\n${variantHint}`,
        },
      ],
    },
  ];
}

function systemWithCache() {
  return [{ type: 'text', text: buildStaticSystem(), cache_control: { type: 'ephemeral' } }];
}

/**
 * Fire candidate 1, wait for its first streamed token (which makes the
 * prompt-cache entry readable), then fire the rest so they hit the cache.
 * A 10s fallback prevents deadlock if the first call stalls or errors.
 */
async function staggeredCalls(n, makeCall) {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const first = makeCall(0, release).finally(release);
  if (n === 1) return Promise.allSettled([first]);
  const timer = setTimeout(release, 10_000);
  await gate;
  clearTimeout(timer);
  const rest = Array.from({ length: n - 1 }, (_, i) => makeCall(i + 1, null));
  return Promise.allSettled([first, ...rest]);
}

/**
 * Generate N candidate records for a cell. Returns settled candidates with
 * per-candidate validation, novelty, and goodness already attached.
 *
 * ctx: { cell, vertical, phenotype, exemplars, ideaContext, trainOneLiners,
 *        assignments, verticalOntology, apiConfig, syntheticId }
 */
export async function generateCandidatesForCell(ctx, { n = 3, temperature = 0.9, onEvent } = {}) {
  const emit = onEvent ?? (() => {});
  const apiConfig = ctx.apiConfig ?? resolveApiConfig();
  const cellPayload = buildCellPayload(ctx);
  const hints = buildAngleHints(ctx, n);
  const effort = supportsEffort(apiConfig?.model) ? GENERATOR_EFFORT : undefined;

  const makeCall = (i, onStart) =>
    chatStructured({
      system: systemWithCache(),
      messages: generationMessages({
        cellPayload,
        variantHint: hints[i],
        syntheticId: `${ctx.syntheticId}-v${i + 1}`,
        variant: i + 1,
      }),
      schema: SYNTHETIC_RECORD_SCHEMA,
      apiConfig,
      temperature,
      maxTokens: 3000,
      effort,
      onStart: onStart ?? undefined,
    });

  const settled = await staggeredCalls(n, makeCall);

  const candidates = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'rejected') {
      emit({
        type: 'candidate',
        index: i + 1,
        status: 'error',
        error: String(s.reason?.message ?? s.reason),
      });
      continue;
    }
    const record = s.value.data;
    record.synthetic_id = record.synthetic_id || `${ctx.syntheticId}-v${i + 1}`;
    record.target_cell = ctx.cell;
    record.phenotype_primary_id = ctx.cell.phenotype_primary_id;
    record.generated_at = new Date().toISOString();

    const validation = await validateSyntheticFull(record, {
      verticalOntology: ctx.verticalOntology,
      trainOneLiners: ctx.trainOneLiners,
      assignments: ctx.assignments,
      ideaContext: ctx.ideaContext,
    });
    const novelty = noveltyCheck(record);
    const goodness_index = computeGoodnessIndex(record, {
      vertical: ctx.vertical,
      ideaContext: ctx.ideaContext,
    });

    emit({
      type: 'candidate',
      index: i + 1,
      status: novelty.pass ? 'ok' : 'dropped_duplicate',
      name: record.name,
      one_liner: record.one_liner,
      usage: s.value.usage ?? null,
    });

    candidates.push({ record, validation, novelty, goodness_index, usage: s.value.usage ?? null });
  }
  return candidates;
}

async function refineWinner(ctx, winner, critique, apiConfig, emit) {
  emit({ type: 'status', phase: 'refining' });
  const hints = winner.goodness_index?.feedback ?? '';
  const refineBlock = JSON.stringify(
    {
      task: 'Revise the startup record below. Keep target_cell, synthetic_id and the overall concept; fix the weaknesses named by the judge.',
      judge_critique: critique,
      heuristic_feedback: hints,
      validation_issues: winner.validation?.errors ?? [],
      nearest_real_company: winner.novelty?.nearest ?? null,
      record: winner.record,
    },
    null,
    2
  );

  const { data } = await chatStructured({
    system: systemWithCache(),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildCellPayload(ctx), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: refineBlock },
        ],
      },
    ],
    schema: SYNTHETIC_RECORD_SCHEMA,
    apiConfig,
    temperature: 0.3,
    maxTokens: 3000,
    effort: supportsEffort(apiConfig?.model) ? GENERATOR_EFFORT : undefined,
  });

  data.synthetic_id = winner.record.synthetic_id;
  data.target_cell = ctx.cell;
  data.phenotype_primary_id = ctx.cell.phenotype_primary_id;
  data.generated_at = new Date().toISOString();

  const validation = await validateSyntheticFull(data, {
    verticalOntology: ctx.verticalOntology,
    trainOneLiners: ctx.trainOneLiners,
    assignments: ctx.assignments,
    ideaContext: ctx.ideaContext,
  });
  return {
    record: data,
    validation,
    novelty: noveltyCheck(data),
    goodness_index: computeGoodnessIndex(data, {
      vertical: ctx.vertical,
      ideaContext: ctx.ideaContext,
    }),
  };
}

/**
 * Full generate-then-select pipeline for one cell.
 * Returns { winner, judge, candidates_considered, refined }.
 */
export async function generateBestForCell(ctx, { n = 3, onEvent } = {}) {
  const emit = onEvent ?? (() => {});
  const apiConfig = ctx.apiConfig ?? resolveApiConfig();

  emit({ type: 'status', phase: 'generating', total: n });
  const candidates = await generateCandidatesForCell({ ...ctx, apiConfig }, { n, onEvent: emit });
  if (!candidates.length) {
    throw new Error('All candidate generations failed');
  }

  // Hard gate: drop near-duplicates of real companies unless that leaves nothing.
  let pool = candidates.filter((c) => c.novelty.pass);
  if (!pool.length) pool = candidates;

  emit({ type: 'status', phase: 'judging', candidates: pool.length });
  const judge = await judgeCandidates({
    cell: ctx.cell,
    vertical: ctx.vertical,
    ideaContext: ctx.ideaContext,
    candidates: pool,
  });
  let winner = pool[judge.winnerIndex];
  winner.judge = judge.verdicts[judge.winnerIndex];

  let refined = false;
  const winnerScore = winner.judge?.judge_score ?? 0;
  if (
    winnerScore < REFINE_THRESHOLD &&
    (winner.judge?.critique || winner.validation?.errors?.length)
  ) {
    try {
      const revised = await refineWinner(
        ctx,
        winner,
        winner.judge?.critique ?? '',
        apiConfig,
        emit
      );
      const rematch = await judgeCandidates({
        cell: ctx.cell,
        vertical: ctx.vertical,
        ideaContext: ctx.ideaContext,
        candidates: [winner, revised],
      });
      if (rematch.winnerIndex === 1 && revised.novelty.pass) {
        revised.judge = rematch.verdicts[1];
        winner = revised;
        refined = true;
      } else {
        winner.judge = rematch.verdicts[0];
      }
    } catch (err) {
      emit({ type: 'status', phase: 'refine_failed', error: String(err?.message ?? err) });
    }
  }

  return {
    winner,
    judge: {
      winner_rationale: judge?.winner_rationale ?? null,
      verdict: winner.judge ?? null,
    },
    candidates_considered: candidates.length,
    refined,
  };
}
