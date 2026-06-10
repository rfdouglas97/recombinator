/**
 * Rule-based archetype refinement after LLM classification.
 * Disambiguates fintech-insurance-ai-product vs vertical-workflow-agent vs marketplace.
 */

import { PHENOTYPE_TO_BM, phenotypeAllowedForBm } from './phenotype-to-bm.mjs';

const NO_AI_RE = /\b(no ai|not ai|none identified|no ai component|without ai|non-ai)\b/i;

const MARKETPLACE_RE =
  /\b(marketplace|liquidity layer|two-sided|connects buyers and sellers|trading venue|exchange|perpetual futures?|perps\b|order book|self-custodial trading|on-ramp|retail traders)\b/i;

const B2B_SOFTWARE_TO_FINANCE_RE =
  /\b(platform for|sold to|sells to|for (banks|hedge funds|brokers|insurers|lenders|financial institutions|private market)|saas for|software for|automation for (banks|brokers|hedge)|agents for (hedge|banks)|teams at (banks|hedge)|analysts at|participants in private)\b/i;

const IS_REGULATED_PRODUCT_RE =
  /\b(hedge fund capital|limited partners|lps invest|investing capital into the (fund|hedge)|returns to (lps|investors)|we are (a|the) (bank|insurer|neobank|payment|wallet)|issues policies|underwrites policies|payment rail|bank charter|insurance product|loan product|credit product)\b/i;

const TRADING_INFRA_B2B_RE =
  /\b(infrastructure for private markets|automate(s)? (diligence|valuation|investor matching)|private (market|secondaries)|venture-backed secondaries)\b/i;

function textBlob(record) {
  return [
    record.one_liner,
    record.description_combined,
    record.what_they_sell,
    record.ai_play,
    record.who_pays,
    record.industry_sub_vertical,
    record.value_wedge,
    record.rationale,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasAiWedge(record) {
  const blob = textBlob(record);
  if (NO_AI_RE.test(blob)) return false;
  if (record.ai_application_patterns?.length > 0) return true;
  const aiPlay = String(record.ai_play ?? '').trim();
  if (aiPlay.length >= 24 && !NO_AI_RE.test(aiPlay)) return true;
  return /\b(ai|agent|ml|model|llm|automat)\b/i.test(blob);
}

function primaryBm(phenotypeId) {
  const bms = PHENOTYPE_TO_BM[phenotypeId];
  return bms?.[0] ?? 'BM-02';
}

function result(phenotypeId, rule, note) {
  const bms = PHENOTYPE_TO_BM[phenotypeId] ?? ['BM-02'];
  return {
    phenotype_primary_id: phenotypeId,
    business_models: [...bms],
    rule,
    note,
  };
}

/**
 * Infer corrected archetype from assignment fields (no per-slug table).
 * @returns {{ phenotype_primary_id: string, business_models: string[], rule: string, note: string }}
 */
export function inferArchetype(record) {
  const blob = textBlob(record);
  const verticalId = record.vertical_id ?? record.canonical_vertical_id ?? '';
  const current = record.phenotype_primary_id;

  // --- B2B workflow software sold TO financial institutions (before marketplace) ---
  if (
    B2B_SOFTWARE_TO_FINANCE_RE.test(blob) ||
    TRADING_INFRA_B2B_RE.test(blob) ||
    (/\bfor hedge funds\b/i.test(blob) &&
      /\b(agent|platform|software|saas|automation)\b/i.test(blob))
  ) {
    if (!IS_REGULATED_PRODUCT_RE.test(blob)) {
      return result(
        'vertical-workflow-agent',
        'b2b_financial_workflow',
        'Sells AI workflow software to banks, funds, or private-market participants.'
      );
    }
  }

  // --- Trading venue / marketplace (often mis-tagged as fintech-insurance) ---
  if (MARKETPLACE_RE.test(blob) && !IS_REGULATED_PRODUCT_RE.test(blob)) {
    if (current !== 'marketplace-network-ai') {
      return result(
        'marketplace-network-ai',
        'trading_marketplace',
        'Exchange, perps, or liquidity network — not an insurance/fintech SKU.'
      );
    }
    return result(current, 'unchanged', '');
  }

  // --- Company IS the regulated financial product (fund, bank, insurer) ---
  if (IS_REGULATED_PRODUCT_RE.test(blob) && hasAiWedge(record)) {
    if (current !== 'fintech-insurance-ai-product') {
      return result(
        'fintech-insurance-ai-product',
        'regulated_financial_product',
        'Operates as the financial product (fund, bank, insurer) with AI wedge.'
      );
    }
    return result(current, 'unchanged', '');
  }

  // --- fintech-insurance-ai-product without AI wedge → downgrade ---
  if (current === 'fintech-insurance-ai-product' && !hasAiWedge(record)) {
    if (MARKETPLACE_RE.test(blob)) {
      return result('marketplace-network-ai', 'fintech_sku_no_ai_marketplace', '');
    }
    return result(
      'vertical-workflow-agent',
      'fintech_sku_no_ai_b2b',
      'Tagged as AI fintech product but copy has no AI wedge — treat as vertical/B2B.'
    );
  }

  // --- fintech-insurance on trading vertical but B2B infra shape ---
  if (
    current === 'fintech-insurance-ai-product' &&
    (verticalId.startsWith('fintech.trading') || TRADING_INFRA_B2B_RE.test(blob)) &&
    !IS_REGULATED_PRODUCT_RE.test(blob)
  ) {
    return result(
      'vertical-workflow-agent',
      'trading_vertical_b2b',
      'Trading-domain company selling workflow/platform, not issuing a regulated SKU.'
    );
  }

  // --- fintech-insurance when buyer is clearly an enterprise customer (not LP/capital) ---
  if (current === 'fintech-insurance-ai-product') {
    const who = String(record.who_pays ?? '').toLowerCase();
    const enterpriseBuyer =
      /\b(banks?|hedge funds?|brokers?|insurers?|lenders?|enterprises?|teams?|analysts?|cfos?|operations?)\b/.test(
        who
      ) &&
      !/\b(limited partners|lps|institutional investors investing|capital providers)\b/.test(who);
    if (enterpriseBuyer && B2B_SOFTWARE_TO_FINANCE_RE.test(blob)) {
      return result(
        'vertical-workflow-agent',
        'enterprise_buyer_not_sku',
        'Who pays is an operating enterprise buyer, not capital into a financial product.'
      );
    }
  }

  // Keep current if BM aligns
  const bm = record.business_models?.[0] ?? primaryBm(current);
  if (!phenotypeAllowedForBm(current, bm)) {
    return result(current, 'bm_phenotype_align', `Aligned BM to ${primaryBm(current)}`);
  }

  return result(current, 'unchanged', '');
}

function arraysEqual(a, b) {
  const A = a ?? [];
  const B = b ?? [];
  return A.length === B.length && A.every((v, i) => v === B[i]);
}

/**
 * Apply inference when it changes phenotype or BM; attach audit metadata.
 */
export function refineArchetype(record) {
  if (!record?.phenotype_primary_id) return record;

  const inferred = inferArchetype(record);
  const priorPhenotype = record.phenotype_primary_id;
  const priorBm = record.business_models ?? [];

  if (
    inferred.rule === 'unchanged' &&
    inferred.phenotype_primary_id === priorPhenotype &&
    arraysEqual(inferred.business_models, priorBm)
  ) {
    return record;
  }

  const primaryBmCode = inferred.business_models[0] ?? primaryBm(inferred.phenotype_primary_id);

  return {
    ...record,
    phenotype_primary_id: inferred.phenotype_primary_id,
    business_models: phenotypeAllowedForBm(inferred.phenotype_primary_id, primaryBmCode)
      ? inferred.business_models
      : (PHENOTYPE_TO_BM[inferred.phenotype_primary_id] ?? inferred.business_models),
    archetype_refined: true,
    archetype_refine_rule: inferred.rule,
    archetype_refine_note: inferred.note || null,
    archetype_refined_from: {
      phenotype_primary_id: priorPhenotype,
      business_models: priorBm,
    },
  };
}

export function refineArchetypeBatch(rows) {
  return rows.map(refineArchetype);
}

/** Prompt block for LLM classifiers (phenotype agent, reclassify, audit). */
export const ARCHETYPE_DISAMBIGUATION_PROMPT = `
Fintech / capital-markets archetype rules (critical):
- fintech-insurance-ai-product (BM-05): The startup IS the regulated financial product — bank, insurer, payment product, or fund taking LP/capital. AI changes the SKU. Example: AI-native insurer, neobank, hedge fund managing LP money.
- vertical-workflow-agent (BM-01): Sells software/agents that automate a workflow FOR operators — banks, brokers, hedge funds, private-market teams as customers. Example: agentic equity research sold to hedge funds; private-markets diligence automation sold to investors/sellers.
- marketplace-network-ai (BM-07): Trading venue, exchange, perps platform, or two-sided liquidity — not insurance and not vertical SaaS.
- Do NOT use fintech-insurance-ai-product for: perps/exchange with no insurance SKU; B2B platforms sold to funds; "no AI" trading apps.
- Hedge fund TOOLS sold to funds → vertical-workflow-agent. Hedge fund THAT IS the product taking LPs → fintech-insurance-ai-product (if AI-native).
`.trim();
