import type { GapCandidate, GeneratedStartup } from '../types';
import { apiUrl } from '../lib/apiBase';

const API_BASE = apiUrl('/api/generator');

export async function checkGeneratorHealth(): Promise<{ ok: boolean; llm_configured: boolean }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Generator API unavailable. Run: npm run explorer:dev');
  return res.json();
}

/** Auto-pick whitespace + generate. Optional query steers selection; otherwise seeded surprise. */
export async function discoverStartup(params: {
  query?: string;
  seed?: number;
}): Promise<GeneratedStartup> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: params.query?.trim() || undefined,
      seed: params.seed ?? Date.now(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Generation failed');
  return data;
}

export type { GapCandidate, GeneratedStartup };
