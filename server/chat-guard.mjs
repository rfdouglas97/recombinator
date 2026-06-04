/**
 * Scope guard for YC Database Chat — skip LLM calls on off-topic prompts (saves API credits).
 */

const OFF_TOPIC_PATTERNS = [
  /\b(write|draft|create|generate)\s+.{0,60}\b(code|script|program|function|essay|poem|story|email|resume)\b/i,
  /\b(write|draft|create)\s+(me\s+)?(a\s+)?(code|script|program|essay|poem|story|email|resume|cover letter)\b/i,
  /\b(debug|fix|explain)\s+(this|my)\s+(code|bug|error|function)\b/i,
  /\b(python|javascript|typescript|react|sql|css|html)\s+(help|tutorial|course|lesson)\b/i,
  /\b(translate|summarize)\s+(this|the following)\s+(article|text|paragraph|email)\b/i,
  /\b(recipe|workout|diet|medical advice|legal advice|tax advice)\b/i,
  /\b(homework|exam|assignment)\s+(help|answer)\b/i,
  /\b(ignore|disregard|forget)\s+(previous|all|your)\s+(instructions|rules)\b/i,
  /\b(you are now|act as|pretend to be|roleplay as)\b/i,
  /\b(chatgpt|general knowledge|world news|politics|crypto price|stock price prediction)\b/i,
];

const DB_SCOPE_SIGNALS = [
  /\b(compan(y|ies)|startup|startups|yc\b|y combinator)\b/i,
  /\b(batch|vertical|phenotype|sector|sub-industry|business model|bm-\d{2})\b/i,
  /\b(fintech|healthcare|biotech|saas|devtools|enterprise|consumer|insurance)\b/i,
  /\b(gap|whitespace|matrix|ontology|classification|classified)\b/i,
  /\b(who (is|are|builds|sells)|which (compan(y|ies)|startup)|find (me )?compan)/i,
  /\b(similar to|comparable to|competitors?|peers?)\b/i,
  /\b(one[- ]?liner|what they sell|ai play|who pays)\b/i,
  /\b(how many compan|what batches|what sectors|in (the )?database)\b/i,
];

function filtersActive(filters = {}) {
  return Boolean(
    filters.batch ||
      filters.sector ||
      filters.industry ||
      filters.phenotypeFamily ||
      filters.businessModel ||
      (filters.minConfidence ?? 0) > 0 ||
      String(filters.search ?? '').trim(),
  );
}

/** Short company-name or keyword lookups are in scope for this explorer. */
function looksLikeCompanyLookup(query) {
  const q = String(query ?? '').trim();
  if (!q || q.length > 120) return false;
  if (OFF_TOPIC_PATTERNS.some((re) => re.test(q))) return false;
  if (q.length <= 48 && /[a-z0-9]/i.test(q)) return true;
  return false;
}

/**
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function assessChatScope(query, { filters = {}, filterSlugs = null, matchCount = 0 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return { allowed: false, reason: 'empty' };

  if (OFF_TOPIC_PATTERNS.some((re) => re.test(q))) {
    return { allowed: false, reason: 'off_topic_pattern' };
  }

  if (Array.isArray(filterSlugs) && filterSlugs.length > 0) return { allowed: true };
  if (filtersActive(filters)) return { allowed: true };
  if (matchCount > 0) return { allowed: true };
  if (DB_SCOPE_SIGNALS.some((re) => re.test(q))) return { allowed: true };
  if (looksLikeCompanyLookup(q)) return { allowed: true };

  return { allowed: false, reason: 'not_database_scope' };
}

export function refusalReply(reason = 'not_database_scope') {
  if (reason === 'empty') {
    return 'Ask a question about companies in this database — e.g. "healthcare AI agents in Winter 2026" or "fintech workflow automation".';
  }
  return (
    'I only answer questions about the YC company database in this explorer (search, verticals, phenotypes, batches). ' +
    'I cannot help with general coding, writing, or other tasks. Try a company-focused question about this YC database.'
  );
}

/** Cap chat history sent to the LLM. */
export function trimChatHistory(messages, maxTurns = 6) {
  const usable = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  return usable.slice(-maxTurns);
}
