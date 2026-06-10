/**
 * Company search for chat and explorer fallback — keyword retrieval with query understanding.
 */

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'between',
  'under',
  'again',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'now',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'any',
  'both',
  'find',
  'show',
  'list',
  'tell',
  'give',
  'get',
  'want',
  'know',
  'see',
  'look',
  'like',
  'help',
  'about',
  'using',
  'use',
  'used',
  'make',
  'made',
  'building',
  'build',
  'built',
  'working',
  'work',
  'companies',
  'company',
  'startup',
  'startups',
  'similar',
  'comparable',
  'peers',
  'competitors',
  'database',
  'explorer',
  'please',
  'thanks',
  'hello',
  'hey',
  'phenotype',
  'phenotypes',
  'vertical',
  'verticals',
  'sector',
  'sectors',
]);

/** Extra tokens to OR-match when a user term appears in the query. */
const TERM_EXPANSIONS = {
  fintech: ['financial', 'payments', 'lending', 'banking', 'fintech'],
  healthcare: ['health', 'medical', 'clinical', 'pharma', 'hospital', 'patient'],
  health: ['healthcare', 'medical', 'clinical'],
  biotech: ['biotech', 'pharma', 'therapeutic', 'drug', 'r&d'],
  pharma: ['pharmaceutical', 'pharma', 'drug'],
  agents: ['agent', 'agents', 'agentic', 'autonomous'],
  agent: ['agents', 'agentic'],
  devtools: ['developer', 'devtools', 'sdk', 'api'],
  enterprise: ['enterprise', 'b2b', 'saas'],
  saas: ['saas', 'software'],
  insurance: ['insurance', 'insurtech', 'payer'],
  robotics: ['robotics', 'robot', 'automation'],
  defense: ['defense', 'military', 'national security'],
  voice: ['voice', 'speech', 'audio', 'telephony'],
  ai: ['ai', 'artificial', 'ml', 'machine learning', 'llm'],
  llm: ['llm', 'language model', 'generative'],
  legal: ['legal', 'law', 'compliance'],
  security: ['security', 'cyber', 'cybersecurity'],
  sales: ['sales', 'gtm', 'revenue'],
  marketing: ['marketing', 'ads', 'advertising'],
  restaurant: ['restaurant', 'hospitality', 'food service', 'dining'],
  automotive: ['automotive', 'fleet', 'vehicle', 'mobility'],
  semiconductor: ['semiconductor', 'chip', 'silicon'],
};

const BATCH_ALIASES = [
  [/\b(w26|winter\s*['']?26|winter\s*2026)\b/i, 'Winter 2026'],
  [/\b(s26|spring\s*['']?26|spring\s*2026)\b/i, 'Spring 2026'],
  [/\b(x26|summer\s*['']?26|summer\s*2026)\b/i, 'Summer 2026'],
  [/\b(f26|fall\s*['']?26|fall\s*2026)\b/i, 'Fall 2026'],
  [/\b(w25|winter\s*2025)\b/i, 'Winter 2025'],
  [/\b(s25|spring\s*2025)\b/i, 'Spring 2025'],
];

const SECTOR_HINTS = [
  [/\b(fintech|payments?|lending|banking|insurtech)\b/i, 'financial-services'],
  [
    /\b(healthcare|health\s*tech|digital\s*health|medical|clinical|hospital)\b/i,
    'healthcare-life-sciences',
  ],
  [/\b(biotech|pharma|therapeutic|drug\s*discovery)\b/i, 'healthcare-life-sciences'],
  [/\b(enterprise|b2b\s*saas|devtools?|developer\s*tools)\b/i, 'enterprise-software'],
  [/\b(ai\s*infra|agent\s*(platform|runtime|infrastructure))\b/i, 'ai-infrastructure'],
  [/\b(robotics?|manufacturing|industrial)\b/i, 'industrials-defense'],
  [/\b(defense|military|aerospace)\b/i, 'industrials-defense'],
  [/\b(consumer|retail|e-?commerce)\b/i, 'retail-commerce'],
  [/\b(real\s*estate|proptech|construction)\b/i, 'real-estate-construction'],
  [/\b(government|govtech|public\s*sector)\b/i, 'government-public'],
];

const PHENOTYPE_FAMILY_HINTS = [
  [/\b(agent\s*runtime|agent\s*infrastructure|agent\s*platform)\b/i, 'agent_infrastructure'],
  [/\b(workflow\s*agent|vertical\s*saas)\b/i, 'vertical_saas'],
  [/\b(biotech\s*r&d|life\s*sciences|pharma\s*r&d)\b/i, 'life_sciences'],
  [/\b(r&d\s*platform|research\s*platform|rd\s*tooling)\b/i, 'rd_tooling'],
];

export function normalizeQueryText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferStructuredHints(query) {
  const q = String(query ?? '');
  const hints = {};

  for (const [re, batch] of BATCH_ALIASES) {
    if (re.test(q)) {
      hints.batch = batch;
      break;
    }
  }

  for (const [re, sector] of SECTOR_HINTS) {
    if (re.test(q)) {
      hints.sector = sector;
      break;
    }
  }

  for (const [re, family] of PHENOTYPE_FAMILY_HINTS) {
    if (re.test(q)) {
      hints.phenotypeFamily = family;
      break;
    }
  }

  const parsed = parseSearchQuery(q);
  if (parsed.businessModel) hints.businessModel = parsed.businessModel;

  return hints;
}

/**
 * Hard filters = sidebar/explicit only. Soft hints = parsed from query (boost ranking, do not exclude).
 */
export function splitSearchFilters(query, explicit = {}) {
  const inferred = inferStructuredHints(query);
  const hard = {
    batch: explicit.batch || '',
    sector: explicit.sector || '',
    industry: explicit.industry || '',
    phenotypeFamily: explicit.phenotypeFamily || '',
    businessModel: explicit.businessModel || '',
    minConfidence: explicit.minConfidence ?? 0,
    search: explicit.search?.trim() || '',
  };
  const soft = {
    batch: hard.batch ? '' : inferred.batch || '',
    sector: hard.sector ? '' : inferred.sector || '',
    phenotypeFamily: hard.phenotypeFamily ? '' : inferred.phenotypeFamily || '',
    businessModel: hard.businessModel ? '' : inferred.businessModel || '',
  };
  return { hard, soft };
}

/** @deprecated use splitSearchFilters — kept for callers that expect merged filters */
export function inferFiltersFromQuery(query, explicit = {}) {
  const { hard, soft } = splitSearchFilters(query, explicit);
  return {
    ...hard,
    batch: hard.batch || soft.batch,
    sector: hard.sector || soft.sector,
    phenotypeFamily: hard.phenotypeFamily || soft.phenotypeFamily,
    businessModel: hard.businessModel || soft.businessModel,
  };
}

/**
 * @returns {{ normalized: string, focusTokens: string[], matchTokens: string[], quoted: string[], businessModel: string|null }}
 */
export function parseSearchQuery(text) {
  const raw = String(text ?? '').trim();
  const normalized = normalizeQueryText(raw);
  const quoted = [...raw.matchAll(/"([^"]+)"/g)].map((m) => normalizeQueryText(m[1]));

  const bmMatch = normalized.match(/\bbm-?(\d{2})\b/i);
  const rawParts = normalized
    .replace(/bm-?\d{2}/gi, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const focusTokens = rawParts.filter((t) => !STOP_WORDS.has(t)).slice(0, 8);
  const matchTokens = new Set(focusTokens);

  for (const t of focusTokens.slice(0, 4)) {
    for (const alt of (TERM_EXPANSIONS[t] ?? []).slice(0, 3)) {
      const part = alt
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .trim();
      for (const piece of part.split(/\s+/).filter((x) => x.length >= 2)) {
        matchTokens.add(piece);
      }
    }
  }
  if (bmMatch) matchTokens.add(`bm-${bmMatch[1]}`);

  return {
    normalized,
    focusTokens,
    matchTokens: [...matchTokens],
    /** @deprecated alias */
    tokens: [...matchTokens],
    quoted,
    businessModel: bmMatch ? `BM-${bmMatch[1]}` : null,
  };
}

export function scoreSoftHints(c, soft = {}) {
  let score = 0;
  if (soft.batch && c.batch === soft.batch) score += 32;
  if (soft.sector && c.vertical_sector_id === soft.sector) score += 28;
  if (soft.phenotypeFamily && c.phenotype_family === soft.phenotypeFamily) score += 22;
  if (soft.businessModel && (c.business_models ?? []).includes(soft.businessModel)) score += 22;
  return score;
}

export function companyHaystack(c) {
  return [
    c.name,
    c.slug,
    c.one_liner,
    c.description_combined ?? c.description,
    c.industry_sub_vertical,
    c.vertical_label,
    c.vertical_id,
    c.vertical_sector_id,
    c.phenotype_primary_label,
    c.phenotype_primary_id,
    c.phenotype_family,
    c.what_they_sell,
    c.ai_play,
    c.who_pays,
    c.value_wedge,
    ...(c.yc_tags ?? []),
    ...(c.business_models ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function tokenHits(c, token) {
  const hay = companyHaystack(c);
  const name = c.name?.toLowerCase() ?? '';
  const slug = c.slug?.toLowerCase() ?? '';
  const slugCompact = slug.replace(/-/g, '');

  if (name.includes(token)) return { hit: true, weight: 14, field: 'name' };
  if (slug === token || slug.startsWith(`${token}-`) || slug.endsWith(`-${token}`)) {
    return { hit: true, weight: 16, field: 'slug' };
  }
  if (slug.includes(token)) return { hit: true, weight: 11, field: 'slug' };
  if (slugCompact.includes(token)) return { hit: true, weight: 10, field: 'slug' };
  if (hay.includes(token)) return { hit: true, weight: 4, field: 'haystack' };
  return { hit: false, weight: 0, field: null };
}

export function scoreCompanyRecord(c, parsed, boost = 0, softHints = {}) {
  const { normalized, matchTokens, focusTokens, tokens, quoted } = parsed;
  const match = matchTokens ?? tokens ?? [];
  const focus = focusTokens?.length ? focusTokens : match.slice(0, 8);
  if (!match.length && !quoted.length && !normalized) return boost + scoreSoftHints(c, softHints);

  const hay = companyHaystack(c);
  let score = boost + scoreSoftHints(c, softHints);
  let matchedFocus = 0;

  if (normalized.length >= 3 && hay.includes(normalized)) score += 48;
  for (const phrase of quoted) {
    if (phrase.length >= 2 && hay.includes(phrase)) score += 42;
  }

  const seen = new Set();
  for (const t of match) {
    if (seen.has(t)) continue;
    seen.add(t);
    const { hit, weight } = tokenHits(c, t);
    if (hit) score += weight;
  }

  for (const t of focus) {
    if (tokenHits(c, t).hit) matchedFocus += 1;
  }

  if (focus.length > 0) {
    score += Math.round((matchedFocus / focus.length) * 20);
    if (focus.length >= 2 && matchedFocus < 1 && scoreSoftHints(c, softHints) === 0) return 0;
  } else if (score <= boost + scoreSoftHints(c, softHints)) {
    return 0;
  }

  if (c.batch && normalized.includes(String(c.batch).toLowerCase())) score += 6;

  return score;
}

/** True when the user mainly wants a ranked list, not a long analytical answer. */
export function isListingIntent(query) {
  const q = String(query ?? '').trim();
  if (!q) return false;
  if (
    /\b(find|search|show|list|lookup|look\s+up|which\s+compan|what\s+compan|who\s+(is|are|builds|sells)|companies\s+(in|with|that|doing|building)|startups\s+(in|with|that))\b/i.test(
      q
    )
  ) {
    return true;
  }
  const parsed = parseSearchQuery(q);
  return parsed.focusTokens.length > 0 && parsed.focusTokens.length <= 6 && q.length < 80;
}
