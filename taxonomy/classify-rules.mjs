/**
 * Heuristic draft classifier for pilot / review — not final agent labels.
 */

const BM = {
  VERTICAL_SAAS: 'BM-01',
  HORIZONTAL_SAAS: 'BM-02',
  DEVTOOLS_INFRA: 'BM-03',
  MANAGED_SERVICE: 'BM-04',
  FINTECH: 'BM-05',
  DATA_INTEL: 'BM-06',
  MARKETPLACE: 'BM-07',
  HARDWARE: 'BM-08',
  BIOTECH: 'BM-09',
  CONSUMER: 'BM-10',
  DEFENSE_GOV: 'BM-11',
  OSS_COMMERCIAL: 'BM-12',
};

function textBlob(company) {
  return [
    company.name,
    company.one_liner,
    company.long_description,
    ...(company.industries ?? []),
    ...(company.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function sectorFromIndustries(industries = []) {
  const [a, b] = industries;
  if (
    a === 'Healthcare' ||
    b?.includes('Healthcare') ||
    b?.includes('Biotech') ||
    b?.includes('Drug')
  ) {
    return 'Healthcare / life sciences';
  }
  if (a === 'Fintech' || b?.includes('Finance') || b?.includes('Insurance')) {
    return 'Fintech / insurance';
  }
  if (
    a === 'Industrials' ||
    b === 'Defense' ||
    b?.includes('Manufacturing') ||
    b?.includes('Aviation')
  ) {
    return 'Industrials / hard tech';
  }
  if (a === 'Consumer') return 'Consumer';
  if (a === 'Real Estate and Construction') return 'Real estate / construction';
  if (a === 'Government') return 'Government';
  return 'Enterprise software';
}

export function classifyHeuristic(company) {
  const t = textBlob(company);
  const industries = company.industries ?? [];
  const tags = (company.tags ?? []).map((x) => x.toLowerCase());
  const sector = sectorFromIndustries(industries);

  let primary = BM.HORIZONTAL_SAAS;
  let aiRole = 'core_product';
  const delivery = new Set();
  const buyer = new Set();
  const flags = [];

  if (/open source|open-source|oss/.test(t)) {
    primary = BM.OSS_COMMERCIAL;
    delivery.add('OpenSource');
  } else if (
    /defense|military|atc|missile|drone|aerospace|satellite|robot|hardware|sensor|teleoperat|manufactur/.test(
      t
    )
  ) {
    primary = /drone|robot|hardware|sensor|teleoperat|aerial|satellite|chip|co-design/.test(t)
      ? BM.HARDWARE
      : BM.DEFENSE_GOV;
    aiRole = /infrastructure|platform|layer|runtime|api/.test(t)
      ? 'infrastructure'
      : 'core_product';
    delivery.add('Hardware');
    buyer.add('Government');
    buyer.add('Enterprise');
  } else if (/biotech|biopharma|clinical trial|fda|drug discovery|lab/.test(t)) {
    primary = BM.BIOTECH;
    delivery.add('SaaS');
    delivery.add('Services');
    buyer.add('Enterprise');
  } else if (
    /insurance|underwrit|payment|wallet|lending|banking|crypto|trading|actuarial|fintech|finance/.test(
      t
    )
  ) {
    primary = BM.FINTECH;
    delivery.add(/insurance|underwrit|liability/.test(t) ? 'Insurance' : 'SaaS');
    buyer.add('Enterprise');
    buyer.add('SMB');
  } else if (/marketplace|two-sided|connect.*buyers|network of/.test(t)) {
    primary = BM.MARKETPLACE;
    delivery.add('Marketplace');
  } else if (
    /infrastructure|developer tool|devtools|api|sdk|runtime|observability|logging|sandbox|authorization layer|platform for agent/.test(
      t
    ) ||
    tags.some((x) => ['developer tools', 'infrastructure', 'api'].includes(x))
  ) {
    primary = BM.DEVTOOLS_INFRA;
    aiRole = 'infrastructure';
    delivery.add('API');
    delivery.add('SaaS');
    buyer.add('Developer');
  } else if (
    /consulting|regulatory service|operations partner|we run|managed|outsourc|staffing|recruitment workflow/.test(
      t
    )
  ) {
    primary = BM.MANAGED_SERVICE;
    delivery.add('Services');
    buyer.add('Enterprise');
  } else if (/terminal|bloomberg|analytics|data feed|intelligence for|research/.test(t)) {
    primary = BM.DATA_INTEL;
    delivery.add('SaaS');
    buyer.add('Enterprise');
  } else if (
    industries[0] === 'Consumer' ||
    /consumer|tiktok|game|buddy on your mac|prosumer/.test(t)
  ) {
    primary = BM.CONSUMER;
    delivery.add('SaaS');
    buyer.add('Consumer');
  } else if (
    /for (healthcare|hospital|clinic|legal|law |insurance|retail|restaurant|property|real estate|accounting|auto body|staffing)/.test(
      t
    ) ||
    /ai-native .+ for /.test(t)
  ) {
    primary = BM.VERTICAL_SAAS;
    delivery.add('SaaS');
    buyer.add('Enterprise');
    buyer.add('SMB');
  }

  if (/agent|llm|generative ai|artificial intelligence|\bai\b/.test(t)) {
    if (primary === BM.HORIZONTAL_SAAS && /infrastructure|layer|runtime|api/.test(t)) {
      primary = BM.DEVTOOLS_INFRA;
      aiRole = 'infrastructure';
    }
  } else {
    aiRole = 'enabler';
  }

  if (/wrapper|chatgpt clone|thin/.test(t)) flags.push('wrapper_risk');
  if (tags.includes('saas') || /saas|subscription|software/.test(t)) delivery.add('SaaS');
  if (tags.includes('api') || /\bapi\b/.test(t)) delivery.add('API');
  if (delivery.size === 0) delivery.add('SaaS');

  if (buyer.size === 0) {
    if (industries[0] === 'B2B') buyer.add('Enterprise');
    else buyer.add('SMB');
  }

  let confidence = 0.55;
  if (primary !== BM.HORIZONTAL_SAAS) confidence = 0.65;
  if (company.long_description?.length > 100) confidence += 0.1;
  if (/ai-native|infrastructure|insurance|clinical|robot|marketplace/.test(t)) confidence += 0.05;
  confidence = Math.min(confidence, 0.85);

  const monetization =
    primary === BM.FINTECH
      ? delivery.has('Insurance')
        ? 'premium / underwriting'
        : 'transaction or subscription'
      : primary === BM.DEVTOOLS_INFRA
        ? 'usage-based API or seats'
        : primary === BM.MANAGED_SERVICE
          ? 'services retainer or outcome-based'
          : primary === BM.MARKETPLACE
            ? 'take rate'
            : 'subscription SaaS';

  return {
    sector_primary: sector,
    sector_secondary: industries[1] ?? null,
    business_model_primary: primary,
    business_model_secondary: null,
    ai_role: aiRole,
    delivery: [...delivery],
    buyer: [...buyer],
    monetization_hypothesis: monetization,
    flags,
    confidence: Math.round(confidence * 100) / 100,
    rationale: buildRationale(company, primary, aiRole, sector),
    method: 'heuristic_draft',
  };
}

function buildRationale(company, primary, aiRole, sector) {
  const bits = [
    `Sector mapped from YC industries → ${sector}.`,
    `Primary business model ${primary} from one-liner/tags/industry keywords.`,
    `AI role ${aiRole}.`,
  ];
  if (company.one_liner)
    bits.push(
      `One-liner: "${company.one_liner.slice(0, 120)}${company.one_liner.length > 120 ? '…' : ''}"`
    );
  return bits.join(' ');
}
