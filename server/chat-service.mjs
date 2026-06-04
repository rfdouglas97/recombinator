import { resolveApiConfig, chatMessages } from '../agent/llm.mjs';
import {
  searchCompanies,
  buildRetrievalContext,
  formatSearchReply,
  loadCompanyRecords,
} from './chat-context.mjs';

const SYSTEM_PROMPT = `You are a research assistant for a YC company database explorer.
The user is browsing ~401 YC companies classified by vertical, phenotype (AI play pattern), and business model.

Answer using ONLY the retrieved company context below plus general knowledge about YC batches and startup patterns.
When listing companies, include name and slug. Be concise (2–6 sentences unless they ask for a list).
If nothing matched their query, say so and suggest 2–3 alternative search angles.
Do not invent companies not in the retrieved context.`;

export function getChatMeta() {
  const companies = loadCompanyRecords();
  return {
    company_count: companies.length,
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

  const meta = getChatMeta();
  const apiConfig = resolveApiConfig();

  if (!apiConfig) {
    return {
      reply: formatSearchReply(query, matches),
      matches,
      llm: false,
    };
  }

  const context = buildRetrievalContext(matches, { filters, selectedSlug, meta });
  const system = `${SYSTEM_PROMPT}\n\n---\n${context}`;

  const reply = await chatMessages({
    system,
    messages: messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
    apiConfig,
    maxTokens: 2048,
  });

  return {
    reply,
    matches,
    llm: true,
  };
}
