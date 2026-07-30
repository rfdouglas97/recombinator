/**
 * Process-level memoization for pipeline data files, keyed by file mtime.
 *
 * The generator API re-reads multi-MB JSON corpora from disk on every request;
 * caching here turns repeat loads into Map lookups while staying correct when
 * a pipeline script rewrites a file (the mtime signature changes).
 */

import { statSync } from 'fs';

const store = new Map();

export function filesSignature(paths) {
  return paths
    .map((p) => {
      try {
        return `${p}:${statSync(p).mtimeMs}`;
      } catch {
        return `${p}:absent`;
      }
    })
    .join('|');
}

/**
 * Return the cached value for `key` if every file in `paths` is unchanged
 * since the value was computed; otherwise recompute via `compute()`.
 */
export function cachedByFiles(key, paths, compute) {
  const sig = filesSignature(paths);
  const hit = store.get(key);
  if (hit && hit.sig === sig) return hit.value;
  const value = compute();
  store.set(key, { sig, value });
  return value;
}

export function clearDataCache() {
  store.clear();
}
