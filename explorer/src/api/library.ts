import type { CardJudgment, StartupLibrary } from '../types';

const API_BASE = '/api/library';

export interface LibraryResponse extends StartupLibrary {
  ok: boolean;
  llm_configured: boolean;
  batches?: {
    at: string;
    requested: number;
    picked: number;
    succeeded: number;
    failed: number;
    guidance: Record<string, string>;
  }[];
  stats?: {
    judged: number;
    reject: number;
    promising: number;
    archived?: number;
  };
  archived_count?: number;
}

export async function fetchLibrary(archived = false): Promise<LibraryResponse> {
  const res = await fetch(`${API_BASE}${archived ? '?archived=1' : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Library API unavailable. Run: npm run explorer:dev');
  }
  return res.json();
}

export async function generateLibraryCards(params: {
  count: number;
  query?: string;
  sectorId?: string;
  industryId?: string;
  businessModel?: string;
}): Promise<{ ok: boolean; new_cards: LibraryResponse['cards']; library: LibraryResponse; stats: unknown }> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Generation failed');
  return data;
}

export async function saveCardJudgment(
  cardId: string,
  judgment: CardJudgment,
): Promise<{ ok: boolean; library: LibraryResponse }> {
  const res = await fetch(`${API_BASE}/judgments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId, ...judgment }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to save judgment');
  return data;
}

export async function archiveCard(
  cardId: string,
  notes?: string,
): Promise<{ ok: boolean; library: LibraryResponse }> {
  const res = await fetch(`${API_BASE}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId, notes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to archive card');
  return data;
}

export async function restoreCard(cardId: string): Promise<{ ok: boolean; library: LibraryResponse }> {
  const res = await fetch(`${API_BASE}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to restore card');
  return data;
}
