/**
 * Offline phenotype matcher — scores companies against seed ontology.
 * Used when no API key; good enough to bootstrap the matrix.
 */

const KEYWORDS = {
  'agent-runtime-infra': [
    'runtime',
    'sandbox',
    'orchestr',
    'harness',
    'authorization',
    'tool',
    'reliable',
    'infra',
    'platform for agent',
    'agent-native cloud',
  ],
  'agent-context-data': [
    'context',
    'web data',
    'crawl',
    'enrichment',
    'api layer',
    'structured',
    'token',
    'realtime web',
    'extract',
  ],
  'agent-observability-evals': [
    'eval',
    'observability',
    'monitor',
    'trace',
    'benchmark',
    'red team',
    'testing',
    'compliance test',
    'sox',
  ],
  'training-data-synthetic': [
    'training data',
    'synthetic',
    'dataset',
    'label',
    'benchmark data',
    'rl env',
    'fine-tun',
  ],
  'domain-data-ontology': [
    'ontology',
    'knowledge graph',
    'schema',
    'registry',
    'entity',
    'canonical',
    'terminology',
  ],
  'vertical-workflow-agent': [
    'ai-native',
    'automate',
    'department',
    'workflow',
    'for healthcare',
    'for legal',
    'for insurance',
    'property management',
    'credentialing',
    'leasing',
    'order to cash',
  ],
  'ai-forward-consulting': [
    'consulting',
    'regulatory service',
    'operations partner',
    'managed',
    'we run',
    'implementation',
    'servicenow',
  ],
  'horizontal-copilot-saas': [
    'copilot',
    'growth team',
    'productivity',
    'customize your software',
    'developer relations',
    'sales',
    'marketing',
  ],
  'fintech-insurance-ai-product': [
    'insurance',
    'underwrit',
    'payment',
    'wallet',
    'lending',
    'banking',
    'actuarial',
    'liability',
    'fintech',
    'perps',
  ],
  'research-terminal-intel': [
    'terminal',
    'bloomberg',
    'equities',
    'research',
    'intelligence',
    'market data',
  ],
  'robotics-embodied-ai': [
    'robot',
    'drone',
    'teleoperat',
    'hardware',
    'sensor',
    'aerial',
    'satellite',
    'co-design',
    'manufactur',
  ],
  'biotech-rd-agent': [
    'biopharma',
    'clinical trial',
    'fda',
    'drug',
    'imaging',
    'lab',
    'biotech',
    'credentialing',
  ],
  'compliance-gov-automation': [
    'sox',
    'fda regulatory',
    'defense supply',
    'gov',
    'audit',
    'compliance',
    'control testing',
  ],
  'consumer-ai-app': [
    'consumer',
    'tiktok',
    'game',
    'personal finance',
    'buddy',
    'mac app',
  ],
  'open-source-commercial': [
    'open source',
    'open-source',
    'oss',
    'alternative to',
  ],
};

function industrySubVertical(company) {
  const [, sub] = company.yc_industries ?? [];
  const tags = company.yc_tags ?? [];
  if (sub && sub !== 'B2B' && sub !== 'Industrials') return sub;
  const tag = tags.find((t) => !['B2B', 'AI', 'Artificial Intelligence', 'SaaS'].includes(t));
  if (tag) return tag;
  const sector = company.taxonomy?.sector_primary;
  const one = (company.description?.one_liner ?? '').toLowerCase();
  if (/healthcare|clinical|hospital|patient/.test(one)) return 'Healthcare (inferred)';
  if (/insurance|underwrit/.test(one)) return 'Insurance (inferred)';
  if (/legal|law /.test(one)) return 'Legal (inferred)';
  if (/property|real estate|leasing/.test(one)) return 'Real estate / property (inferred)';
  if (/defense|military|drone/.test(one)) return 'Defense / aerospace (inferred)';
  return sector ?? 'General B2B';
}

export function classifyLocal(company, ontology) {
  const text = [
    company.name,
    company.description?.combined,
    ...(company.yc_industries ?? []),
    ...(company.yc_tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  let bestId = 'horizontal-copilot-saas';
  let bestScore = 0;

  for (const p of ontology.phenotypes) {
    const kws = KEYWORDS[p.id] ?? [];
    let score = 0;
    for (const kw of kws) {
      if (text.includes(kw)) score += kw.split(' ').length > 1 ? 2 : 1;
    }
    if (p.id === 'open-source-commercial' && /open source|open-source/.test(text)) score += 3;
    if (score > bestScore) {
      bestScore = score;
      bestId = p.id;
    }
  }

  const pheno = ontology.phenotypes.find((p) => p.id === bestId);
  const patterns = [];
  if (/agent/.test(text)) patterns.push('agent_tooling');
  if (/api/.test(text)) patterns.push('api_delivery');
  if (/automat/.test(text)) patterns.push('workflow_automation');
  if (patterns.length === 0) patterns.push('general_ai');

  return {
    slug: company.slug,
    industry_sub_vertical: industrySubVertical(company),
    phenotype_primary_id: bestId,
    phenotype_secondary_id: null,
    phenotype_primary_label: pheno?.label ?? bestId,
    value_wedge: pheno?.value_wedge ?? 'unknown',
    ai_application: pheno?.ai_application ?? 'unknown',
    ai_application_patterns: patterns,
    what_they_sell: company.description?.one_liner ?? '',
    ai_play: `AI applied as ${pheno?.ai_application ?? 'core'} for ${industrySubVertical(company)}`,
    who_pays: (company.taxonomy?.buyer ?? ['Enterprise']).join(', '),
    confidence: Math.min(0.55 + bestScore * 0.05, 0.82),
    rationale: `Local scorer matched "${bestId}" (score ${bestScore}) from description keywords.`,
    proposed_phenotype: null,
    method: 'local_pattern_match',
  };
}
