/**
 * Business-thesis primitives: generalized patterns + real YC instances
 * transferable across BM × vertical × phenotype pairings.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadVerticalOntology } from '../taxonomy/verticals.mjs';
import { phenotypeAllowedForBm } from '../taxonomy/phenotype-to-bm.mjs';
import { loadNormalizedAssignments, getVerticalById, normalizeText, tokenSet } from './eval-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const IDEA_PRIMITIVES_PATH = join(ROOT, 'output/generator/idea-primitives.json');

/** Abstract idea patterns observed across the YC batch (generalize across pairings). */
export const PRIMITIVE_TYPES = [
  {
    id: 'workflow-department',
    name: 'AI-native department for a vertical workflow',
    phenotype_ids: ['vertical-workflow-agent', 'ai-native-service-provider', 'ai-forward-consulting'],
    business_models: ['BM-01', 'BM-04'],
    thesis_checklist: [
      'Name the manual workflow step that costs the buyer time or money today',
      'Explain why full-job automation (not copilot) is credible now',
      'Tie revenue to the buyer who already owns this budget line',
    ],
    invalid_signals: [
      'generic ai platform',
      'for any industry',
      'all-in-one',
      'copilot for everyone',
      'horizontal saas',
    ],
  },
  {
    id: 'agent-infra-pickaxe',
    name: 'Infrastructure pickaxe for agent builders',
    phenotype_ids: ['agent-runtime-infra', 'agent-context-infra', 'agent-context-data'],
    business_models: ['BM-03'],
    thesis_checklist: [
      'Name the builder persona (platform team, agent vendor) who hits this bottleneck',
      'Quantify the failure mode (latency, token cost, reliability, context limits)',
      'Show why this is a narrow API/layer, not a vertical app',
    ],
    invalid_signals: ['marketing teams', 'end consumers', 'insurance claims', 'clinical trial'],
  },
  {
    id: 'regulated-fintech-sku',
    name: 'Regulated financial or insurance product',
    phenotype_ids: ['fintech-insurance-ai-product'],
    business_models: ['BM-05'],
    thesis_checklist: [
      'Name the regulated artifact (policy, payment rail, credential, ledger)',
      'Explain compliance/audit requirement that blocks naive automation',
      'Identify licensed buyer or sponsor bank / carrier / sponsor',
    ],
    invalid_signals: ['devtools', 'developer api', 'consumer social', 'game'],
  },
  {
    id: 'data-intel-terminal',
    name: 'Data / intelligence product for decision-makers',
    phenotype_ids: ['research-terminal-intel'],
    business_models: ['BM-06'],
    thesis_checklist: [
      'Name the decision (invest, underwrite, procure) improved by proprietary data',
      'Explain data moat or freshness vs spreadsheets / public feeds',
      'Buyer is analyst, PM, or exec with research budget',
    ],
    invalid_signals: ['workflow automation for clerks', 'hardware robot'],
  },
  {
    id: 'marketplace-liquidity',
    name: 'Two-sided marketplace with AI matching / ops',
    phenotype_ids: ['marketplace-network-ai'],
    business_models: ['BM-07'],
    thesis_checklist: [
      'Name both sides of the market and the liquidity failure today',
      'Explain AI wedge on matching, pricing, or trust — not just listing site',
      'Revenue model: take rate, lead fee, or subscription to one side',
    ],
    invalid_signals: ['single-player saas', 'internal it tool only'],
  },
  {
    id: 'physical-systems-ai',
    name: 'Hardware + software with AI-enabled physical system',
    phenotype_ids: ['robotics-embodied-ai', 'ai-enabled-physical-systems'],
    business_models: ['BM-08'],
    thesis_checklist: [
      'Name the physical system and operational environment',
      'Explain what AI unlocks (sensing, control, cost curve) vs legacy automation',
      'Buyer owns capex/opex for that physical asset',
    ],
    invalid_signals: ['pure saas spreadsheet', 'browser extension', 'content app'],
  },
  {
    id: 'biotech-rd-acceleration',
    name: 'R&D / lab / clinical workflow acceleration',
    phenotype_ids: ['biotech-rd-agent', 'ai-research-automation'],
    business_models: ['BM-09'],
    thesis_checklist: [
      'Name the scientific or clinical workflow step (characterization, protocol, IND)',
      'Explain accuracy / validation bar and who signs off',
      'Buyer is R&D, CRO, or biopharma ops with existing spend on this step',
    ],
    invalid_signals: ['consumer wellness', 'real estate', 'e-commerce checkout'],
  },
  {
    id: 'consumer-ai-app',
    name: 'Prosumer / consumer AI application',
    phenotype_ids: ['consumer-ai-app'],
    business_models: ['BM-10'],
    thesis_checklist: [
      'Name the end-user job-to-be-done and habit loop',
      'Explain distribution wedge (viral, community, device, creator)',
      'Monetization: subscription, usage, or hardware attach',
    ],
    invalid_signals: ['enterprise procurement', 'defense prime', 'fda submission b2b only'],
  },
  {
    id: 'defense-gov-outcome',
    name: 'Defense / gov-critical outcome delivery',
    phenotype_ids: ['ai-native-prime-contractor', 'compliance-gov-automation'],
    business_models: ['BM-11', 'BM-04'],
    thesis_checklist: [
      'Name the program office, mission, or compliance regime',
      'Explain certification / security / liability barrier to entry',
      'Revenue tied to contract, clearance, or audit outcome',
    ],
    invalid_signals: ['consumer app store', 'dtc wellness', 'restaurant pos'],
  },
  {
    id: 'open-source-commercial',
    name: 'Open-source core + commercial layer',
    phenotype_ids: ['open-source-commercial'],
    business_models: ['BM-12'],
    thesis_checklist: [
      'Name the OSS component developers already adopt',
      'Explain hosted / enterprise monetization path',
      'Buyer is engineering org with existing OSS in stack',
    ],
    invalid_signals: ['fully proprietary black box', 'no developer audience'],
  },
  {
    id: 'horizontal-copilot',
    name: 'Horizontal seat-based copilot',
    phenotype_ids: ['horizontal-copilot-saas'],
    business_models: ['BM-02'],
    thesis_checklist: [
      'Name the cross-industry job function (sales, support, eng, legal)',
      'Explain 10x productivity on repeatable knowledge work',
      'Seat expansion path across departments',
    ],
    invalid_signals: ['single-industry regulated workflow only', 'defense contracting'],
  },
];

const GENERIC_BLOCKLIST = [
  'revolutionize',
  'disrupt every',
  'leverage ai to',
  'cutting-edge platform',
  'next-generation platform for everything',
  'ai-powered solution for all',
  'transform industries',
];

export function loadIdeaPrimitives(path = IDEA_PRIMITIVES_PATH) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function primitiveTypesForCell(cell) {
  return PRIMITIVE_TYPES.filter(
    (t) =>
      t.phenotype_ids.includes(cell.phenotype_primary_id) &&
      t.business_models.includes(cell.business_model),
  );
}

export function defaultPrimitiveTypeForCell(cell) {
  const matches = primitiveTypesForCell(cell);
  return matches[0] ?? PRIMITIVE_TYPES.find((t) => t.phenotype_ids.includes(cell.phenotype_primary_id)) ?? null;
}

function instanceFromRecord(record, vertical) {
  const bm = record.business_models?.[0];
  const rationale = String(record.rationale ?? '').trim();
  const whyFromRationale =
    rationale.length > 60 && !rationale.startsWith('Local scorer')
      ? rationale.slice(0, 320)
      : null;

  return {
    slug: record.slug,
    name: record.name,
    cell: {
      business_model: bm,
      vertical_id: record.vertical_id,
      phenotype_primary_id: record.phenotype_primary_id,
    },
    sector_id: record.vertical_sector_id ?? vertical?.sector_id ?? null,
    workflow: vertical?.workflow ?? null,
    pain: vertical?.workflow ?? record.vertical_label ?? record.industry_sub_vertical,
    wedge: record.value_wedge ?? null,
    ai_application: record.ai_application ?? null,
    buyer: record.who_pays ?? null,
    one_liner: record.one_liner,
    what_they_sell: String(record.what_they_sell ?? '').slice(0, 220),
    why_this_works: whyFromRationale,
    transfer_tags: [
      record.phenotype_primary_id,
      bm,
      vertical?.workflow,
      record.vertical_sector_id,
      record.value_wedge,
    ].filter(Boolean),
  };
}

/** Second segment under fintech.* — insurance vs trading vs lending must not mix. */
function fintechBranch(verticalId) {
  const parts = String(verticalId ?? '').split('.');
  if (parts[0] !== 'fintech' || parts.length < 2) return null;
  return parts[1];
}

function scoreTransferAnalog(instance, cell, vertical) {
  let score = 0;
  if (instance.cell.vertical_id === cell.vertical_id) return -1;

  const cellBranch = fintechBranch(cell.vertical_id);
  const instBranch = fintechBranch(instance.cell.vertical_id);
  if (cellBranch && instBranch && cellBranch !== instBranch) return 0;

  if (instance.cell.phenotype_primary_id === cell.phenotype_primary_id) score += 4;
  if (instance.cell.business_model === cell.business_model) score += 2;
  if (vertical?.workflow && instance.workflow === vertical.workflow) score += 3;
  else if (vertical?.sector_id && instance.sector_id === vertical.sector_id) score += 1;
  if (instance.wedge && vertical) score += 1;
  return score;
}

function buildTransferNote(instance, cell, vertical) {
  const parts = [];
  if (instance.cell.phenotype_primary_id === cell.phenotype_primary_id) {
    parts.push('same archetype (phenotype)');
  }
  if (instance.sector_id === vertical?.sector_id) parts.push('same sector');
  if (instance.workflow === vertical?.workflow) parts.push(`same workflow tag (${instance.workflow})`);
  if (instance.cell.business_model === cell.business_model) parts.push('same business model');
  return `Transfer from ${instance.name}: ${parts.join(', ') || 'adjacent vertical'}`;
}

/**
 * Context injected into generation prompts for a target cell.
 */
export function getIdeaContextForCell(cell, { assignments, primitivesBundle = null } = {}) {
  const verticalOntology = loadVerticalOntology();
  const vertical = getVerticalById(cell.vertical_id, verticalOntology);
  const primitiveTypes = primitiveTypesForCell(cell);
  const defaultType = defaultPrimitiveTypeForCell(cell);

  const rows = assignments ?? loadNormalizedAssignments();
  const instances = rows
    .filter((r) => r.vertical_id && r.phenotype_primary_id && r.business_models?.[0])
    .map((r) => instanceFromRecord(r, getVerticalById(r.vertical_id, verticalOntology)));

  const sameCell = instances.filter(
    (i) =>
      i.cell.business_model === cell.business_model &&
      i.cell.vertical_id === cell.vertical_id &&
      i.cell.phenotype_primary_id === cell.phenotype_primary_id,
  );

  const transferPool = instances
    .map((i) => ({ instance: i, score: scoreTransferAnalog(i, cell, vertical) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const transferAnalogs = transferPool.slice(0, 3).map(({ instance, score }) => ({
    ...instance,
    transfer_score: score,
    transfer_note: buildTransferNote(instance, cell, vertical),
  }));

  const bundleInstances = primitivesBundle?.instances ?? [];
  const typeFromBundle = primitivesBundle?.primitive_types?.find((t) => t.id === defaultType?.id);

  return {
    default_primitive_type_id: defaultType?.id ?? null,
    primitive_types: (typeFromBundle ? [typeFromBundle] : primitiveTypes).map((t) => ({
      id: t.id,
      name: t.name,
      thesis_checklist: t.thesis_checklist,
      invalid_signals: t.invalid_signals,
    })),
    same_cell_instances: sameCell.slice(0, 3),
    transfer_analogs: transferAnalogs,
    vertical_buyers: vertical?.buyers ?? [],
    vertical_workflow: vertical?.workflow ?? null,
    vertical_regulatory: vertical?.regulatory ?? [],
    requires_analog_proof: sameCell.length === 0,
    anti_patterns: [
      ...GENERIC_BLOCKLIST,
      ...(defaultType?.invalid_signals ?? []),
      'positioning that does not name a buyer from vertical.buyers',
      'one-liner with no workflow-specific noun',
    ],
  };
}

function textBlob(record) {
  return normalizeText(
    [
      record.one_liner,
      record.long_description,
      record.what_they_sell,
      record.generation_rationale,
      record.why_good_idea?.pain,
      record.why_good_idea?.urgency,
      record.why_good_idea?.ai_wedge,
      record.why_good_idea?.buyer_budget,
      record.why_good_idea?.proof_from_batch,
    ].join(' '),
  );
}

function hasBuyerSignal(record, vertical) {
  const blob = textBlob(record);
  const buyers = vertical?.buyers ?? [];
  for (const b of buyers) {
    const tokens = normalizeText(b).split(' ').filter((t) => t.length > 3);
    if (tokens.some((t) => blob.includes(t))) return true;
  }
  const whoPays = normalizeText(record.who_pays);
  if (whoPays && whoPays.length > 2 && blob.includes(whoPays)) return true;
  return buyers.length === 0;
}

function hasWorkflowSignal(record, vertical) {
  const wf = vertical?.workflow;
  if (!wf) return true;
  const blob = textBlob(record);
  const wfNorm = normalizeText(wf.replace(/_/g, ' '));
  if (blob.includes(wfNorm)) return true;
  for (const t of wfNorm.split(' ').filter((x) => x.length > 4)) {
    if (blob.includes(t)) return true;
  }
  const label = normalizeText(vertical?.label ?? '');
  if (label && blob.includes(label.split(' ')[0])) return true;
  return false;
}

function hitsBlocklist(record, extraBlocklist = []) {
  const blob = textBlob(record);
  const all = [...GENERIC_BLOCKLIST, ...extraBlocklist];
  for (const phrase of all) {
    if (blob.includes(normalizeText(phrase))) return phrase;
  }
  return null;
}

/**
 * Business-quality validation beyond schema / taxonomy fit.
 */
export function validateBusinessThesis(record, { verticalOntology, ideaContext = null, cell = null } = {}) {
  const errors = [];
  const targetCell = cell ?? record.target_cell;
  if (!targetCell) return { valid: false, errors: ['missing target_cell for thesis validation'] };

  const vertical = getVerticalById(targetCell.vertical_id, verticalOntology);
  const ctx = ideaContext ?? getIdeaContextForCell(targetCell);
  const primitiveType = ctx.primitive_types?.[0] ?? defaultPrimitiveTypeForCell(targetCell);

  if (!record.idea_primitive_id) {
    errors.push('missing idea_primitive_id (must cite a generalized primitive type)');
  } else if (primitiveType && record.idea_primitive_id !== primitiveType.id) {
    const allowed = primitiveTypesForCell(targetCell).map((t) => t.id);
    if (allowed.length && !allowed.includes(record.idea_primitive_id)) {
      errors.push(`idea_primitive_id ${record.idea_primitive_id} not valid for this cell (expected one of: ${allowed.join(', ')})`);
    }
  }

  const why = record.why_good_idea;
  if (!why || typeof why !== 'object') {
    errors.push('missing why_good_idea object');
  } else {
    for (const key of ['pain', 'urgency', 'ai_wedge', 'buyer_budget', 'proof_from_batch']) {
      const val = String(why[key] ?? '').trim();
      if (val.length < 12) errors.push(`why_good_idea.${key} too short or missing (need concrete thesis)`);
    }
    if (ctx.requires_analog_proof) {
      const proof = String(why.proof_from_batch ?? '');
      const hasAnalog =
        (record.analog_slugs?.length ?? 0) > 0 ||
        /transfer|analog|similar|same archetype|e\.g\.|for example/i.test(proof);
      if (!hasAnalog) {
        errors.push('empty cell: why_good_idea.proof_from_batch must cite transfer analog from YC batch');
      }
    }
  }

  if (!record.generation_rationale || String(record.generation_rationale).length < 40) {
    errors.push('generation_rationale must explain why this idea fits the cell (≥40 chars)');
  }

  if (!hasBuyerSignal(record, vertical)) {
    errors.push('copy does not reference a buyer role from vertical.buyers or who_pays');
  }

  if (!hasWorkflowSignal(record, vertical)) {
    errors.push('copy does not reference vertical workflow or domain nouns');
  }

  const blocked = hitsBlocklist(record, primitiveType?.invalid_signals ?? []);
  if (blocked) errors.push(`generic / weak positioning detected: "${blocked}"`);

  if (record.one_liner) {
    const ol = normalizeText(record.one_liner);
    if (ol.split(' ').length <= 3) errors.push('one_liner too vague');
    if (/^ai (for|platform|solution)/.test(ol) && !hasWorkflowSignal(record, vertical)) {
      errors.push('one_liner reads as generic AI platform');
    }
  }

  return { valid: errors.length === 0, errors, idea_context: ctx };
}

export function buildPrimitivesBundle(assignments) {
  const verticalOntology = loadVerticalOntology();
  const instances = [];
  const indexes = {
    by_phenotype: {},
    by_bm_sector: {},
    by_workflow: {},
  };

  for (const r of assignments) {
    if (!r.vertical_id || !r.phenotype_primary_id || !r.business_models?.[0]) continue;
    const vertical = getVerticalById(r.vertical_id, verticalOntology);
    const inst = instanceFromRecord(r, vertical);
    instances.push(inst);

    const p = r.phenotype_primary_id;
    if (!indexes.by_phenotype[p]) indexes.by_phenotype[p] = [];
    indexes.by_phenotype[p].push(r.slug);

    const bs = `${r.business_models[0]}::${r.vertical_sector_id ?? vertical?.sector_id ?? 'unknown'}`;
    if (!indexes.by_bm_sector[bs]) indexes.by_bm_sector[bs] = [];
    indexes.by_bm_sector[bs].push(r.slug);

    if (vertical?.workflow) {
      if (!indexes.by_workflow[vertical.workflow]) indexes.by_workflow[vertical.workflow] = [];
      indexes.by_workflow[vertical.workflow].push(r.slug);
    }
  }

  const primitive_types = PRIMITIVE_TYPES.map((t) => ({
    ...t,
    instance_count: instances.filter((i) => t.phenotype_ids.includes(i.cell.phenotype_primary_id)).length,
  }));

  return {
    generated_at: new Date().toISOString(),
    meta: {
      company_count: instances.length,
      primitive_type_count: primitive_types.length,
    },
    primitive_types,
    instances,
    indexes,
  };
}
