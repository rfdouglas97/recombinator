/**
 * Shared startup generator logic for CLI and explorer API.
 */

import { existsSync } from 'fs';

import { loadDotEnv } from '../agent/env.mjs';
import { chatJson, resolveApiConfig } from '../agent/llm.mjs';
import { loadVerticalOntology } from '../taxonomy/verticals.mjs';
import { PHENOTYPE_TO_BM, phenotypeAllowedForBm } from '../taxonomy/phenotype-to-bm.mjs';

import {
  EVAL_PATHS,
  loadJson,
  loadNormalizedAssignments,
  loadPhenotypeOntology,
  loadTaxonomyV01,
  getPhenotypeById,
  getVerticalById,
  getBmDefinition,
  redactForTrainPrompt,
  validateSyntheticFull,
  normalizeText,
  tokenSet,
} from './eval-utils.mjs';
import { getIdeaContextForCell, loadIdeaPrimitives } from './idea-primitives-lib.mjs';
import { computeGoodnessIndex, rankGapsByGoodness } from './goodness-rubric.mjs';
import { evaluatePairingValidity } from '../whitespace/lib/pairing-validity.mjs';

loadDotEnv();

export const GENERATION_SYSTEM = `You are a venture analyst generating plausible synthetic YC startup profiles for taxonomy gap analysis.

Return ONLY valid JSON matching the required_output_keys. target_cell must be copied exactly from the prompt.
phenotype_primary_id must match target_cell.phenotype_primary_id.
delivery and buyer are string arrays using taxonomy enums where possible (SaaS, API, Services, Developer, Enterprise, etc.).

Business quality (required):
- Set idea_primitive_id to default_primitive_type_id from the prompt (or another listed primitive_types id).
- Fill why_good_idea with concrete pain, urgency, ai_wedge, buyer_budget, proof_from_batch.
- For empty matrix cells, proof_from_batch MUST explain what transfers from transfer_analogs (cite slug or company pattern, not name copying).
- analog_slugs: slugs of transfer_analogs you used (if any).
- Reject generic "AI platform" positioning — name buyer + workflow from vertical.
- generation_rationale ties the idea to the target cell and chosen primitive.

Goodness index: maximize buyer_budget, workflow_pain, ai_wedge, urgency, transfer_proof, sharpness (see goodness_dimensions in prompt). Avoid blocklist phrases.`;

function loadTrainSet() {
  if (existsSync(EVAL_PATHS.trainSlugs)) {
    const doc = loadJson(EVAL_PATHS.trainSlugs);
    const slugs = doc.slugs ?? doc;
    return new Set(Array.isArray(slugs) ? slugs : []);
  }
  // Full classified corpus as exemplar pool when no eval holdout file exists.
  return new Set(
    loadNormalizedAssignments()
      .map((r) => r.slug)
      .filter(Boolean)
  );
}

function buildTrainExemplars(cell, assignments, trainSlugs, max = 3) {
  return assignments
    .filter(
      (r) =>
        trainSlugs.has(r.slug) &&
        r.business_models?.[0] === cell.business_model &&
        r.vertical_id === cell.vertical_id &&
        r.phenotype_primary_id === cell.phenotype_primary_id
    )
    .slice(0, max)
    .map(redactForTrainPrompt);
}

export function buildGenerationPrompt({
  cell,
  vertical,
  phenotype,
  bm,
  exemplars,
  variantIndex,
  ideaContext,
}) {
  return JSON.stringify(
    {
      task: 'Generate a synthetic YC-style startup for the target taxonomy cell',
      variant_index: variantIndex,
      target_cell: cell,
      business_model: bm,
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
      goodness_dimensions: {
        buyer_budget: 'Who pays, from what budget line?',
        workflow_pain: 'What manual workflow breaks?',
        ai_wedge: 'What does AI do specifically?',
        urgency: 'Why now?',
        transfer_proof: 'How does a batch analog pattern transfer here?',
        sharpness: 'Concrete one-liner, no buzzwords',
      },
      constraints: [
        'Name a specific buyer role from vertical.buyers when available',
        'Address the workflow pain implied by vertical.workflow',
        'Explain AI wedge using phenotype value_wedge and ai_application',
        'Apply a generalized idea primitive — adapt transfer_analogs to this vertical, do not copy one-liners',
        'why_good_idea.proof_from_batch: why YC would fund this in THIS cell (cite analog pattern if cell is empty)',
        'one_liner: ≤12 words, concrete, YC directory tone',
        'long_description: 2-3 sentences (problem → approach → buyer)',
        'Do NOT copy train exemplar wording verbatim',
        'Do NOT use real YC company names from exemplars',
        'Avoid all anti_patterns phrases',
      ],
      one_liner_patterns: [
        'AI-native [workflow] for [buyer/vertical]',
        'The [infrastructure layer] for [agent/dev] teams',
        '[Outcome] automation for [entity type]',
      ],
      required_output_keys: [
        'synthetic_id',
        'target_cell',
        'name',
        'one_liner',
        'long_description',
        'industry_sub_vertical',
        'phenotype_primary_id',
        'what_they_sell',
        'ai_play',
        'who_pays',
        'ai_application_patterns',
        'delivery',
        'buyer',
        'yc_industries_hypothesis',
        'idea_primitive_id',
        'why_good_idea',
        'analog_slugs',
        'generation_rationale',
      ],
    },
    null,
    2
  );
}

/** Expand compound hints so e.g. "biopharma" can match gaps labeled "pharma" / "biotech". */
function expandQueryTokens(queryTokens) {
  const out = new Set(queryTokens);
  for (const t of queryTokens) {
    if (t.length < 4) continue;
    if (/pharma|biopharma|biotech|biologic/.test(t)) {
      out.add('pharma');
      out.add('biotech');
      out.add('biopharma');
    }
    if (/fintech|insurtech/.test(t)) {
      out.add('fintech');
      out.add('finance');
      out.add('insurance');
    }
    if (/healthcare|health.?tech|medtech/.test(t)) {
      out.add('healthcare');
      out.add('health');
      out.add('medical');
    }
  }
  return out;
}

function queryTokenMatchesHay(token, hay, hayTokens) {
  if (hayTokens.has(token) || (token.length >= 4 && hay.includes(token))) return true;
  for (const h of hayTokens) {
    if (h.length < 4 || token.length < 4) continue;
    if (h.includes(token) || token.includes(h)) return true;
  }
  return false;
}

function gapSearchScore(gap, queryTokens) {
  if (!queryTokens.size) return 1;
  const hay = normalizeText(
    [
      gap.vertical_id,
      gap.vertical_label,
      gap.industry_label,
      gap.sector_label,
      gap.workflow,
      gap.business_model_label,
    ].join(' ')
  );
  const hayTokens = tokenSet(hay);
  const expanded = expandQueryTokens(queryTokens);
  const queryJoined = [...queryTokens].join(' ');

  let primaryHits = 0;
  let expansionHits = 0;
  for (const t of queryTokens) {
    if (queryTokenMatchesHay(t, hay, hayTokens)) {
      primaryHits++;
      continue;
    }
    for (const alt of expanded) {
      if (alt !== t && queryTokenMatchesHay(alt, hay, hayTokens)) {
        expansionHits++;
        break;
      }
    }
  }
  if (primaryHits === 0 && expansionHits === 0) return 0;

  let score = primaryHits / queryTokens.size + (expansionHits / queryTokens.size) * 0.35;
  if (queryJoined.length >= 4 && hay.includes(normalizeText(queryJoined))) score += 0.4;
  if (
    /pharma|biopharma|biotech|drug|clinical|therapeutic/.test(queryJoined) &&
    /pharma|biotech|drug|clinical|therapeutic|fda/.test(hay)
  ) {
    score += 0.2;
  }
  return score;
}

/** Pick default phenotype for a gap cell (first compatible with BM). */
export function inferPhenotypeForGap(gap) {
  for (const [phenotypeId, bms] of Object.entries(PHENOTYPE_TO_BM)) {
    if (bms.includes(gap.business_model)) return phenotypeId;
  }
  const defaults = {
    'BM-01': 'vertical-workflow-agent',
    'BM-02': 'horizontal-copilot-saas',
    'BM-03': 'agent-runtime-infra',
    'BM-04': 'ai-forward-consulting',
    'BM-05': 'fintech-insurance-ai-product',
    'BM-06': 'research-terminal-intel',
    'BM-07': 'marketplace-network-ai',
    'BM-08': 'robotics-embodied-ai',
    'BM-09': 'biotech-rd-agent',
    'BM-10': 'consumer-ai-app',
    'BM-11': 'ai-native-prime-contractor',
    'BM-12': 'open-source-commercial',
  };
  return defaults[gap.business_model] ?? 'vertical-workflow-agent';
}

/**
 * Find structurally valid whitespace gaps (from gap-candidates.json only).
 */
export function findWhitespaceGaps({
  sectorId = '',
  industryId = '',
  businessModel = '',
  query = '',
  limit = 20,
} = {}) {
  const gaps = loadJson(EVAL_PATHS.gaps)?.gaps ?? [];
  const queryTokens = tokenSet(query);

  let filtered = gaps;

  if (sectorId) {
    filtered = filtered.filter((g) => g.sector_id === sectorId);
  }
  if (industryId) {
    filtered = filtered.filter(
      (g) => g.vertical_id === industryId || g.vertical_id.startsWith(`${industryId}.`)
    );
  }
  if (businessModel) {
    filtered = filtered.filter((g) => g.business_model === businessModel);
  }

  filtered = filtered.filter((g) => evaluatePairingValidity(g).valid);

  const scored = filtered
    .map((g) => ({
      gap: g,
      score: gapSearchScore(g, queryTokens),
    }))
    .filter(({ score }) => score > 0 || !queryTokens.size)
    .sort((a, b) => b.score - a.score || a.gap.vertical_label.localeCompare(b.gap.vertical_label));

  return scored
    .slice(0, limit)
    .map(({ gap, score }) => formatGapCandidate(gap, queryTokens.size ? score : null));
}

function formatGapCandidate(gap, relevanceScore = null) {
  return {
    business_model: gap.business_model,
    business_model_label: gap.business_model_label,
    vertical_id: gap.vertical_id,
    vertical_label: gap.vertical_label,
    sector_id: gap.sector_id,
    sector_label: gap.sector_label,
    industry_label: gap.industry_label,
    workflow: gap.workflow ?? null,
    relevance_score: relevanceScore,
    target_cell: {
      business_model: gap.business_model,
      vertical_id: gap.vertical_id,
      phenotype_primary_id: inferPhenotypeForGap(gap),
    },
    cell_key: `${gap.business_model}|${gap.vertical_id}`,
  };
}

function hashSeed(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Automatically pick one whitespace cell — no manual selection.
 * - With query/industry hint → best matching gap (deterministic)
 * - Without hint → seeded pick from valid gaps (surprise, reproducible per seed)
 */
export function pickWhitespaceCell({
  sectorId = '',
  industryId = '',
  businessModel = '',
  query = '',
  seed = Date.now(),
} = {}) {
  const queryTrim = query.trim();
  const queryTokens = tokenSet(queryTrim);
  const hasGuidance = Boolean(queryTrim || sectorId || industryId || businessModel);

  let pool = findWhitespaceGaps({
    sectorId,
    industryId,
    businessModel,
    query: queryTrim,
    limit: queryTokens.size ? 30 : 400,
  });

  if (!pool.length && hasGuidance) {
    pool = findWhitespaceGaps({ limit: 400 })
      .map((gap) => {
        const hay = normalizeText(
          [
            gap.vertical_id,
            gap.vertical_label,
            gap.industry_label,
            gap.sector_label,
            gap.workflow,
          ].join(' ')
        );
        const score = queryTrim.length >= 3 && hay.includes(normalizeText(queryTrim)) ? 0.5 : 0;
        return { gap, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(({ gap, score }) => ({ ...gap, relevance_score: score }));
  }

  if (!pool.length) {
    throw new Error(
      'No structurally valid whitespace found for that hint. Try a shorter keyword (e.g. pharma, biotech, healthcare) or leave blank for a random gap.'
    );
  }

  const assignments = loadNormalizedAssignments();
  const verticalOntology = loadVerticalOntology();

  if (queryTokens.size) {
    const gap = pool[0];
    const gapRow = {
      ...gap,
      phenotype_primary_id: gap.target_cell.phenotype_primary_id,
    };
    const [ranked] = rankGapsByGoodness([gapRow], {
      inferPhenotype: inferPhenotypeForGap,
      assignments,
      getIdeaContextForCell,
      verticalOntology,
    });
    return {
      gap,
      selection_method: 'best_match',
      transfer_score: ranked?.transfer_score ?? null,
      goodness_index: ranked?.goodness_index ?? null,
    };
  }

  const candidates = pool;
  const gapRows = candidates.map((g) => ({
    ...g,
    phenotype_primary_id: g.target_cell.phenotype_primary_id,
  }));
  const ranked = rankGapsByGoodness(gapRows, {
    inferPhenotype: inferPhenotypeForGap,
    assignments,
    getIdeaContextForCell,
    verticalOntology,
  });
  const pickFrom = ranked.filter((r) => r.transfer_score >= 45).length
    ? ranked.filter((r) => r.transfer_score >= 45)
    : ranked;

  const idx = hashSeed(seed) % pickFrom.length;
  const chosen = pickFrom[idx];
  const gap =
    pool.find(
      (g) =>
        g.vertical_id === chosen.gap.vertical_id && g.business_model === chosen.gap.business_model
    ) ?? pool[0];
  return {
    gap,
    selection_method: 'seeded_surprise',
    transfer_score: chosen.transfer_score,
    goodness_index: chosen.goodness_index,
  };
}

/**
 * Pick whitespace + generate startup in one step.
 */
export async function discoverAndGenerate(options = {}) {
  const picked = pickWhitespaceCell(options);
  const result = await generateSyntheticForCell(picked.gap.target_cell, {
    syntheticId: `syn-ui-${Date.now()}`,
  });
  return {
    ...result,
    selected_gap: picked.gap,
    selection_method: picked.selection_method,
    gap_transfer_score: picked.transfer_score ?? null,
    gap_goodness_index: picked.goodness_index ?? null,
  };
}

/**
 * Generate one synthetic startup for a target taxonomy cell.
 */
export async function generateSyntheticForCell(
  cell,
  { syntheticId = `syn-${Date.now()}`, variantIndex = 1, apiConfig = resolveApiConfig() } = {}
) {
  if (!apiConfig) {
    throw new Error('No ANTHROPIC_API_KEY or OPENAI_API_KEY configured in .env');
  }

  if (!phenotypeAllowedForBm(cell.phenotype_primary_id, cell.business_model)) {
    throw new Error(`Incompatible cell: ${cell.phenotype_primary_id} × ${cell.business_model}`);
  }

  const assignments = loadNormalizedAssignments();
  const trainSlugs = loadTrainSet();
  const verticalOntology = loadVerticalOntology();
  const phenotypeOntology = loadPhenotypeOntology();
  const taxonomy = loadTaxonomyV01();

  const vertical = getVerticalById(cell.vertical_id, verticalOntology);
  const pairing = evaluatePairingValidity(
    {
      business_model: cell.business_model,
      vertical_id: cell.vertical_id,
      vertical_label: vertical?.label,
      industry_label: vertical?.industry_label,
      workflow: vertical?.workflow,
      sector_id: vertical?.sector_id,
    },
    { phenotypeId: cell.phenotype_primary_id, vertical }
  );
  if (!pairing.valid) {
    throw new Error(
      `Invalid BM×vertical pairing (${pairing.reason}). This cell should not be generated.`
    );
  }

  const phenotype = getPhenotypeById(cell.phenotype_primary_id, phenotypeOntology);
  const bm = getBmDefinition(cell.business_model, taxonomy);
  const exemplars = buildTrainExemplars(cell, assignments, trainSlugs);
  const primitivesBundle = loadIdeaPrimitives();
  const ideaContext = getIdeaContextForCell(cell, { assignments, primitivesBundle });

  const user = buildGenerationPrompt({
    cell,
    vertical,
    phenotype,
    bm,
    exemplars,
    variantIndex,
    ideaContext,
  });

  const parsed = await chatJson({ system: GENERATION_SYSTEM, user, apiConfig });

  parsed.synthetic_id = parsed.synthetic_id ?? syntheticId;
  parsed.target_cell = cell;
  parsed.phenotype_primary_id = cell.phenotype_primary_id;
  parsed.generated_at = new Date().toISOString();

  const trainOneLiners = assignments.filter((r) => trainSlugs.has(r.slug)).map((r) => r.one_liner);
  const goodness_index = computeGoodnessIndex(parsed, { vertical, ideaContext });
  parsed.goodness_index = goodness_index;

  const validation = await validateSyntheticFull(parsed, {
    verticalOntology,
    trainOneLiners,
    assignments,
    ideaContext,
  });

  return {
    record: parsed,
    validation,
    goodness_index,
    idea_context: ideaContext,
    exemplars_used: exemplars.map((e) => e.slug),
    gap_context: vertical
      ? {
          vertical_label: vertical.label,
          sector_label: vertical.sector_label,
          workflow: vertical.workflow ?? null,
        }
      : null,
  };
}
