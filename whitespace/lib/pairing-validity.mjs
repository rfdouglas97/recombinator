/**
 * BM × vertical pairing sanity — beyond sector×BM allowlists.
 * Blocks structurally "empty" cells that don't form a credible startup thesis
 * (e.g. Biotech R&D platform × dental benefits administration).
 */

import { phenotypeAllowedForBm } from '../../taxonomy/phenotype-to-bm.mjs';
import { normalizeText } from '../../scripts/eval-utils.mjs';
import { inferPhenotypeForGap } from './phenotype.mjs';

const PAYER_ADMIN = /^payer_/;
const ENTERPRISE_BACKOFFICE = /^(itsm|accounting|recruiting|hris|sales|audit|contracts|order_to_cash|process_automation)/;

const BIOTECH_RD = /\b(biotech|genomic|drug|pharma|laboratory|lab_|clinical.?trial|discovery|therapeutic|protein|omics|molecule|assay|cell.?line|screening|chemistry)\b/;

const FINTECH = /\b(fintech|finance|insurance|payment|lending|banking|trading|billing|claims|payer|underwriting|credit|bnpl|treasury|payroll)\b/;

const CONSUMER = /\b(consumer|prosumer|personal|creator|social|gaming|retail.?shopper)\b/;

const DEFENSE_GOV = /\b(defense|gov|government|military|public.?sector|critical.?infra|clearance|contracting)\b/;

const HARDWARE = /\b(hardware|robot|robotics|sensor|drone|autonomous|manufacturing|industrial|energy.?grid|construction.?site)\b/;

function haystack(gap, vertical = null) {
  return normalizeText(
    [
      gap.vertical_id,
      gap.vertical_label,
      gap.industry_label,
      gap.workflow,
      gap.sector_label,
      vertical?.industry_id,
      vertical?.label,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function workflow(gap, vertical = null) {
  return gap.workflow ?? vertical?.workflow ?? '';
}

/**
 * @returns {{ valid: boolean, reason: string | null, code: string | null }}
 */
export function evaluatePairingValidity(gap, { phenotypeId = null, vertical = null } = {}) {
  const bm = gap.business_model;
  if (!bm || !gap.vertical_id) {
    return { valid: false, reason: 'missing_cell', code: 'invalid_cell' };
  }

  const wf = workflow(gap, vertical);
  const hay = haystack(gap, vertical);
  const phenotype = phenotypeId ?? inferPhenotypeForGap(gap);

  if (!phenotypeAllowedForBm(phenotype, bm)) {
    return {
      valid: false,
      reason: `phenotype_${phenotype}_incompatible_with_${bm}`,
      code: 'phenotype_bm_mismatch',
    };
  }

  // --- BM-specific coherence rules ---

  if (bm === 'BM-09') {
    if (PAYER_ADMIN.test(wf)) {
      return { valid: false, reason: 'biotech_rd_on_payer_admin_workflow', code: 'bogus_pairing' };
    }
    if (ENTERPRISE_BACKOFFICE.test(wf) && !BIOTECH_RD.test(hay)) {
      return { valid: false, reason: 'biotech_rd_on_enterprise_backoffice', code: 'bogus_pairing' };
    }
    if (/\b(dental|vision.?benefit|benefit.?admin|member.?services|appeals|enrollment)\b/.test(hay) && !BIOTECH_RD.test(hay)) {
      return { valid: false, reason: 'biotech_rd_on_admin_benefits_vertical', code: 'bogus_pairing' };
    }
    if (!BIOTECH_RD.test(hay) && !/\b(life.?sci|research|rd|clinical|lab|pharma|biotech)\b/.test(hay)) {
      return { valid: false, reason: 'biotech_rd_without_rd_vertical', code: 'bogus_pairing' };
    }
  }

  if (bm === 'BM-08') {
    if (PAYER_ADMIN.test(wf) || ENTERPRISE_BACKOFFICE.test(wf)) {
      return { valid: false, reason: 'hardware_bm_on_admin_workflow', code: 'bogus_pairing' };
    }
    if (!HARDWARE.test(hay) && gap.sector_id !== 'industrials-defense' && gap.sector_id !== 'energy-climate') {
      return { valid: false, reason: 'hardware_bm_without_physical_vertical', code: 'bogus_pairing' };
    }
  }

  if (bm === 'BM-05') {
    const inFinanceSector = gap.sector_id === 'financial-services';
    const financeHay = FINTECH.test(hay) || PAYER_ADMIN.test(wf);
    if (!inFinanceSector && !financeHay) {
      return { valid: false, reason: 'fintech_bm_off_finance_vertical', code: 'bogus_pairing' };
    }
  }

  if (bm === 'BM-10') {
    if (gap.sector_id !== 'consumer' && gap.sector_id !== 'media-entertainment' && !CONSUMER.test(hay)) {
      return { valid: false, reason: 'consumer_bm_off_consumer_vertical', code: 'bogus_pairing' };
    }
    if (PAYER_ADMIN.test(wf)) {
      return { valid: false, reason: 'consumer_bm_on_payer_admin', code: 'bogus_pairing' };
    }
  }

  if (bm === 'BM-11') {
    if (gap.sector_id !== 'industrials-defense' && gap.sector_id !== 'government-public' && !DEFENSE_GOV.test(hay)) {
      return { valid: false, reason: 'defense_bm_off_defense_vertical', code: 'bogus_pairing' };
    }
  }

  if (bm === 'BM-03') {
    if (PAYER_ADMIN.test(wf)) {
      return { valid: false, reason: 'devtools_bm_on_payer_admin', code: 'bogus_pairing' };
    }
  }

  if (bm === 'BM-07') {
    if (PAYER_ADMIN.test(wf) || ENTERPRISE_BACKOFFICE.test(wf)) {
      return { valid: false, reason: 'marketplace_bm_on_backoffice_workflow', code: 'bogus_pairing' };
    }
  }

  return { valid: true, reason: null, code: null };
}

/** Filter gaps to pairing-valid cells only. */
export function filterValidPairings(gaps, { verticalOntology = null } = {}) {
  const getVertical = (id) => verticalOntology?.verticals?.find((v) => v.id === id) ?? null;
  return gaps.filter((gap) => {
    const v = getVertical(gap.vertical_id);
    return evaluatePairingValidity(gap, { vertical: v }).valid;
  });
}
