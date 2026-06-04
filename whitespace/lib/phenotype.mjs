import { PHENOTYPE_TO_BM } from '../../taxonomy/phenotype-to-bm.mjs';

const BM_DEFAULTS = {
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

/** Pick default phenotype for a gap cell (first compatible with BM). */
export function inferPhenotypeForGap(gap) {
  for (const [phenotypeId, bms] of Object.entries(PHENOTYPE_TO_BM)) {
    if (bms.includes(gap.business_model)) return phenotypeId;
  }
  return BM_DEFAULTS[gap.business_model] ?? 'vertical-workflow-agent';
}
