/**
 * Phenotype → compatible business model codes for BM × vertical gap analysis and synthetic generation.
 */

export const BM_LABELS = {
  'BM-01': 'Vertical AI SaaS',
  'BM-02': 'Horizontal AI SaaS',
  'BM-03': 'AI devtools / infrastructure',
  'BM-04': 'AI labor / managed service',
  'BM-05': 'Fintech / insurance product',
  'BM-06': 'Data / intelligence product',
  'BM-07': 'Marketplace / network',
  'BM-08': 'Hardware + software',
  'BM-09': 'Biotech / R&D platform',
  'BM-10': 'Consumer app / prosumer',
  'BM-11': 'Defense / gov-critical infrastructure',
  'BM-12': 'Open source + commercial',
};

/** @type {Record<string, string[]>} */
export const PHENOTYPE_TO_BM = {
  'vertical-workflow-agent': ['BM-01', 'BM-04'],
  'horizontal-copilot-saas': ['BM-02'],
  'agent-runtime-infra': ['BM-03'],
  'agent-context-infra': ['BM-03'],
  'agent-context-data': ['BM-03', 'BM-06'],
  'agent-observability-evals': ['BM-03'],
  'training-data-synthetic': ['BM-03', 'BM-06'],
  'domain-data-ontology': ['BM-06'],
  'ai-forward-consulting': ['BM-04'],
  'fintech-insurance-ai-product': ['BM-05'],
  'research-terminal-intel': ['BM-06'],
  'compliance-gov-automation': ['BM-01', 'BM-04'],
  'consumer-ai-app': ['BM-10'],
  'robotics-embodied-ai': ['BM-08'],
  'biotech-rd-agent': ['BM-09'],
  'ai-native-prime-contractor': ['BM-04', 'BM-11'],
  'marketplace-network-ai': ['BM-07'],
  'managed-ai-service': ['BM-04'],
  'open-source-commercial': ['BM-12'],
  'ai-compute-physical-infra': ['BM-03', 'BM-08'],
  'ai-enabled-physical-systems': ['BM-08'],
  'ai-native-service-provider': ['BM-04'],
  'ai-operated-business': ['BM-04', 'BM-01'],
  'edge-ai-runtime': ['BM-03', 'BM-08'],
  'semantic-translation-layer': ['BM-06', 'BM-03'],
  'vertical-infra-api': ['BM-03'],
  'ai-research-automation': ['BM-09'],
};

/** Default primary BM when only phenotype is known (first compatible code). */
export function primaryBmForPhenotype(phenotypeId) {
  const allowed = PHENOTYPE_TO_BM[phenotypeId];
  return allowed?.[0] ?? 'BM-02';
}

/** Collapse to exactly one BM code for company matrix placement. */
export function asSingleBusinessModels(codes, phenotypeId = null) {
  if (Array.isArray(codes) && codes.length === 1) return codes;
  if (Array.isArray(codes) && codes.length > 1) return [codes[0]];
  if (typeof codes === 'string' && codes) return [codes];
  return [primaryBmForPhenotype(phenotypeId)];
}

export function phenotypeAllowedForBm(phenotypeId, bmCode) {
  const allowed = PHENOTYPE_TO_BM[phenotypeId];
  if (!allowed) return true;
  return allowed.includes(bmCode);
}

export function cellKey(bm, verticalId, phenotypeId) {
  return `${bm}::${verticalId}::${phenotypeId}`;
}
