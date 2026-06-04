import type { Filters } from '../types';
import { apiUrl } from '../lib/apiBase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatMatch {
  slug: string;
  name: string;
  batch: string;
  one_liner: string | null;
  vertical_label: string | null;
  phenotype_primary_label: string | null;
  what_they_sell?: string | null;
  ai_play?: string | null;
  website?: string | null;
  yc_profile_url?: string | null;
}

export interface ChatResponse {
  ok: boolean;
  reply: string;
  matches: ChatMatch[];
  llm: boolean;
  /** True when off-topic — no LLM call was made. */
  refused?: boolean;
}

const API_BASE = apiUrl('/api/chat');

export async function checkChatHealth(): Promise<{
  ok: boolean;
  llm_configured: boolean;
  company_count: number;
  model: string | null;
}> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Chat API unavailable. Run: npm run explorer:dev');
  return res.json();
}

export async function sendChatMessage(params: {
  messages: ChatMessage[];
  filters?: Partial<Filters>;
  filterSlugs?: string[];
  selectedSlug?: string | null;
  limit?: number;
}): Promise<ChatResponse> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: params.messages,
      filters: params.filters ?? {},
      filterSlugs: params.filterSlugs,
      selectedSlug: params.selectedSlug ?? undefined,
      limit: params.limit ?? 12,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Chat request failed');
  return data;
}
