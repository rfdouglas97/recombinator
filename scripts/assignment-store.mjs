/**
 * Shared load/save for the two assignment snapshots that together define the
 * ontology corpus: output/verticals/normalized-assignments.json (canonical)
 * and output/phenotypes/assignments.json (phenotype view). Both are kept as
 * slug-keyed Maps and written back slug-sorted for stable git diffs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const ASSIGNMENT_PATHS = {
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
};

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function toArray(doc) {
  if (!doc) return [];
  return Array.isArray(doc) ? doc : Object.values(doc);
}

export function loadAssignmentMaps() {
  const normalized = new Map(
    toArray(loadJson(ASSIGNMENT_PATHS.normalized, [])).map((r) => [r.slug, r])
  );
  const assignments = new Map(
    toArray(loadJson(ASSIGNMENT_PATHS.assignments, [])).map((r) => [r.slug, r])
  );
  return { normalized, assignments };
}

export function saveAssignmentMaps({ normalized, assignments }) {
  const sortedValues = (map) => [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const [path, map] of [
    [ASSIGNMENT_PATHS.normalized, normalized],
    [ASSIGNMENT_PATHS.assignments, assignments],
  ]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(sortedValues(map), null, 2));
  }
}
