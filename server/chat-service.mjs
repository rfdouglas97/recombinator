import { resolveChatApiConfig, chatMessages } from '../agent/llm.mjs';
import {
  searchCompanies,
  buildRetrievalContext,
  formatSearchReply,
  loadCompanyRecords,
  isListingIntent,
} from './chat-context.mjs';
import { splitSearchFilters } from './company-search.mjs';
import { assessChatScope, refusalReply, trimChatHistory } from './chat-guard.mjs';

const SYSTEM_PROMPT = `You are a scoped research assistant for a YC company database explorer ONLY.

STRICT RULES (never break):
1. Answer ONLY about companies in the "Retrieved companies" section below, or brief meta about this dataset (batch counts, how to search).
2. REFUSE any request unrelated to exploring these startups: no general coding help, writing, trivia, news, recipes, life advice, or tasks using outside knowledge.
3. If the user asks something off-topic, reply in one sentence that you only help with this YC company database and suggest a company-focused question. Do NOT answer the off-topic request.
4. Do not invent companies. Every named company must appear in retrieved context.
5. Be concise (2–5 sentences unless they want a list). Include slug in parentheses when naming companies.`;

const LISTING_LLM_PROMPT = `You are summarizing search results from a YC company database.
Rules: 2–4 sentences max. Mention only companies from the retrieved list. Include slugs in parentheses. No outside knowledge.`;

export function getChatMeta() {
  const companies = loadCompanyRecords();
  const chatConfig = resolveChatApiConfig();
  return {
    company_count: companies.length,
    llm_configured: Boolean(chatConfig),
    model: chatConfig?.model ?? null,
  };
}

export async function handleChat({
  messages = [],
  filters = {},
  filterSlugs = null,
  selectedSlug = null,
  limit = 40,
}) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUser?.content ?? '';
  const searchLimit = Math.min(Math.max(Number(limit) || 40, 12), 60);
  const { hard: hardFilters } = splitSearchFilters(query, filters);
  const listing = isListingIntent(query);

  const matches = searchCompanies({
    query,
    filters: hardFilters,
    filterSlugs,
    selectedSlug,
    limit: searchLimit,
  });

  const scope = assessChatScope(query, { filters: hardFilters, filterSlugs, matchCount: matches.length });
  if (!scope.allowed) {
    return {
      reply: refusalReply(scope.reason),
      matches,
      llm: false,
      refused: true,
    };
  }

  const meta = getChatMeta();
  const apiConfig = resolveChatApiConfig();
  const searchReply = formatSearchReply(query, matches);

  if (!apiConfig) {
    return {
      reply: searchReply,
      matches,
      llm: false,
      refused: false,
    };
  }

  if (listing) {
    if (!matches.length) {
      return {
        reply: searchReply,
        matches,
        llm: false,
        refused: false,
      };
    }

    const context = buildRetrievalContext(matches, { filters: hardFilters, selectedSlug, meta });
    const summary = await chatMessages({
      system: `${LISTING_LLM_PROMPT}\n\n---\n${context}`,
      messages: [{ role: 'user', content: query }],
      apiConfig,
      maxTokens: 400,
    });

    return {
      reply: `${searchReply}\n\n${summary.trim()}`,
      matches,
      llm: true,
      refused: false,
    };
  }

  const context = buildRetrievalContext(matches, { filters: hardFilters, selectedSlug, meta });
  const system = `${SYSTEM_PROMPT}\n\n---\n${context}`;

  const reply = await chatMessages({
    system,
    messages: trimChatHistory(
      messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
      6,
    ),
    apiConfig,
    maxTokens: 1024,
  });

  return {
    reply: matches.length ? `${searchReply}\n\n${reply.trim()}` : reply,
    matches,
    llm: true,
    refused: false,
  };
}
