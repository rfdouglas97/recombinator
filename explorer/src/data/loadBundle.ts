import type { DataBundle } from '../types';
import { apiUrl } from '../lib/apiBase';

let cache: DataBundle | null = null;

/**
 * Load explorer data at runtime.
 * Prefers live Postgres via GET /api/bundle; falls back to static file if API unavailable.
 */
export async function loadBundle(): Promise<DataBundle> {
  if (cache) return cache;

  try {
    const res = await fetch(apiUrl('/api/bundle'));
    if (res.ok) {
      cache = (await res.json()) as DataBundle;
      return cache;
    }
    console.warn(`[loadBundle] /api/bundle returned ${res.status}, falling back to static file`);
  } catch (err) {
    console.warn('[loadBundle] API unavailable, falling back to static data.bundle.json', err);
  }

  const res = await fetch('/data.bundle.json');
  if (!res.ok) throw new Error(`Failed to load data (${res.status}). Start API: npm run api:dev`);
  cache = (await res.json()) as DataBundle;
  return cache;
}

/** Clear in-memory cache (e.g. after filter refresh in dev). */
export function clearBundleCache() {
  cache = null;
}
