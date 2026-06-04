/**
 * Back-compat re-exports — per-slug overrides removed; use infer-archetype rules.
 */
import { refineArchetype, refineArchetypeBatch, inferArchetype, ARCHETYPE_DISAMBIGUATION_PROMPT } from './infer-archetype.mjs';

export { refineArchetype, refineArchetypeBatch, inferArchetype, ARCHETYPE_DISAMBIGUATION_PROMPT };

/** @deprecated */
export const CLASSIFICATION_OVERRIDES = {};

/** @deprecated */
export function applyClassificationOverride(record) {
  return refineArchetype(record);
}

export function applyClassificationOverrides(rows) {
  return refineArchetypeBatch(rows);
}
