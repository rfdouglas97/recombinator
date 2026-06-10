/**
 * Apply human-curated kill-list rules to gap candidates.
 */

function verticalMatchesPrefix(verticalId, prefixes) {
  if (!prefixes?.length) return false;
  return prefixes.some((p) => verticalId === p || verticalId.startsWith(`${p}.`));
}

function ruleMatches(gap, rule) {
  const m = rule.match ?? {};
  if (m.sector_id && gap.sector_id !== m.sector_id) return false;
  if (m.business_model && gap.business_model !== m.business_model) return false;
  if (m.vertical_id && gap.vertical_id !== m.vertical_id) return false;
  if (m.vertical_prefix && !verticalMatchesPrefix(gap.vertical_id, [m.vertical_prefix])) {
    return false;
  }
  if (rule.unless_vertical_prefix?.length) {
    if (verticalMatchesPrefix(gap.vertical_id, rule.unless_vertical_prefix)) return false;
  }
  return true;
}

/**
 * @returns {{ killed: boolean, reason: string | null }}
 */
export function evaluateKillList(gap, killList) {
  if (killList.sector_block?.includes(gap.sector_id)) {
    return { killed: true, reason: `sector_block:${gap.sector_id}` };
  }
  for (const prefix of killList.vertical_prefix_block ?? []) {
    if (verticalMatchesPrefix(gap.vertical_id, [prefix])) {
      return { killed: true, reason: `vertical_prefix_block:${prefix}` };
    }
  }
  if (killList.business_model_block?.includes(gap.business_model)) {
    return { killed: true, reason: `business_model_block:${gap.business_model}` };
  }
  for (const rule of killList.rules ?? []) {
    if (ruleMatches(gap, rule)) {
      return { killed: true, reason: rule.reason ?? 'rule_match' };
    }
  }
  return { killed: false, reason: null };
}
