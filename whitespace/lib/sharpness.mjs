/**
 * Reject ontology catalog buckets that are not fundable business wedges.
 */

import { getVerticalById } from '../../scripts/eval-utils.mjs';

/** Substrings that indicate a software category, not a buyer-owned problem. */
const NOT_A_BUSINESS_PHRASES = [
  'kubernetes',
  'container deployment',
  'container orchestration',
  'api design, versioning',
  'api lifecycle',
  'lifecycle management',
  'versioning & lifecycle',
  'test automation',
  'software qa',
  'qa & test',
  'devtools',
  'developer tools',
  'cloud infrastructure & virtualization',
  'infrastructure & virtualization',
  'it service management',
  'service management',
  'platform & infrastructure',
  'observability & monitoring',
  'cost optimization',
  'configuration management',
  'deployment & release',
  'release management',
  'data platform',
  'integration platform',
  'middleware',
  'orchestration platform',
];

/** Label endings that are usually taxonomy buckets, not startups. */
const WEAK_SUFFIX_RE = /\b(management|operations|platform|infrastructure|automation|orchestration|virtualization|monitoring|optimization|tooling|devtools)\s*$/i;

/** Whole-label patterns that are too horizontal. */
const WEAK_LABEL_RE = [
  /^enterprise\s+(it|cyber|security|ai)\s/i,
  /^cloud\s+infrastructure/i,
  /^application\s+(&|and)\s+mobile\s+security$/i,
  /^saas\s+customization/i,
];

export function verticalDepth(verticalId) {
  return String(verticalId ?? '').split('.').filter(Boolean).length;
}

/**
 * @returns {{ reject: boolean, reason: string | null, generic_score: number }}
 * generic_score 0 = sharp, 1 = catalog bucket
 */
export function evaluateLabelSharpness(gap, verticalOntology) {
  const label = String(gap.vertical_label ?? '').trim();
  const norm = label.toLowerCase();
  const depth = verticalDepth(gap.vertical_id);
  const vertical = getVerticalById(gap.vertical_id, verticalOntology);
  const buyers = vertical?.buyers ?? [];
  const workflow = vertical?.workflow ?? gap.workflow;

  let generic_score = 0;

  if (depth < 3) generic_score += 0.45;

  for (const phrase of NOT_A_BUSINESS_PHRASES) {
    if (norm.includes(phrase)) {
      generic_score = Math.max(generic_score, 0.95);
      return {
        reject: true,
        reason: `catalog_bucket:${phrase.replace(/\s+/g, '_')}`,
        generic_score,
      };
    }
  }

  if (WEAK_SUFFIX_RE.test(label) && depth < 4) {
    generic_score = Math.max(generic_score, 0.75);
  }

  for (const re of WEAK_LABEL_RE) {
    if (re.test(label)) generic_score = Math.max(generic_score, 0.8);
  }

  // Needs a concrete workflow tag and at least one buyer role
  if (!workflow || workflow.length < 3) generic_score += 0.25;
  if (!buyers.length) generic_score += 0.2;

  // Long compound labels with "&" often = merged taxonomy nodes
  if (label.split('&').length >= 2 && depth <= 3) generic_score += 0.15;

  generic_score = Math.min(1, generic_score);

  if (generic_score >= 0.7) {
    return {
      reject: true,
      reason: 'generic_catalog_label',
      generic_score,
    };
  }

  return { reject: false, reason: null, generic_score: Math.round(generic_score * 100) / 100 };
}
