import type { DataBundle } from '../types';

let cache: DataBundle | null = null;

export async function loadBundle(): Promise<DataBundle> {
  if (cache) return cache;
  const res = await fetch('/data.bundle.json');
  if (!res.ok) throw new Error(`Failed to load data.bundle.json (${res.status})`);
  cache = (await res.json()) as DataBundle;
  return cache;
}
