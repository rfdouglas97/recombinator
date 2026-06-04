import { resolveChatApiConfig, chatMessages } from '../agent/llm.mjs';
import {
  searchCompanies,
  buildRetrievalContext,
  formatSearchReply,
  loadCompanyRecords,
} from './chat-context.mjs';
import { assessChatScope, refusalReply, trimChatHistory } from './chat-guard.mjs';

const SYSTEM_PROMPT = `You are a scoped research assistant for a YC company database explorer ONLY.

STRICT RULES (never break):
1. Answer ONLY about companies in the "Retrieved companies" section below, or brief meta about this dataset (batch counts, how to search).
2. REFUSE any request unrelated to exploring these startups: no general coding help, writing, trivia, news, recipes, life advice, or tasks using outside knowledge.
3. If the user asks something off-topic, reply in one sentence that you only help with this YC company database and suggest a company-focused question. Do NOT answer the off-topic request.
4. Do not invent companies. Every named company must appear in retrieved context.
5. Be concise (2–5 sentences unless they want a list). Include slug in parentheses when naming companies.`;

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
  limit = 12,
}) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUser?.content ?? '';

  const matches = searchCompanies({
    query,
    filters,
    filterSlugs,
    selectedSlug,
    limit: Math.min(limit, 20),
  });

  const scope = assessChatScope(query, { filters, filterSlugs, matchCount: matches.length });
  if (!scope.allowed) {
    return {
      reply: refusalReply(scope.reason),
      matches: [],
      llm: false,
      refused: true,
    };
  }

  const meta = getChatMeta();
  const apiConfig = resolveChatApiConfig();

  if (!apiConfig) {
    return {
      reply: formatSearchReply(query, matches),
      matches,
      llm: false,
      refused: false,
    };
  }

  const context = buildRetrievalContext(matches, { filters, selectedSlug, meta });
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
    reply,
    matches,
    llm: true,
    refused: false,
  };
}
