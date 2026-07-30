/**
 * Normalize generator output into browsable startup "cards" (whitespace + company).
 */

export function gapToWhitespace(gap, { matrixGapCount = null } = {}) {
  return {
    business_model: gap.business_model,
    business_model_label: gap.business_model_label,
    vertical_id: gap.vertical_id,
    vertical_label: gap.vertical_label,
    sector_id: gap.sector_id,
    sector_label: gap.sector_label,
    industry_label: gap.industry_label ?? null,
    workflow: gap.workflow ?? null,
    cell_key: `${gap.business_model}|${gap.vertical_id}`,
    target_cell: gap.target_cell,
    opportunity_score: gap.opportunity_score ?? null,
    opportunity_rank: gap.rank ?? null,
    transfer_score: gap.transfer_score ?? null,
    transfer_band: gap.transfer_band ?? null,
    analog_match_tier: gap.analog_match_tier ?? null,
    analog_slugs: gap.analog_slugs ?? [],
    matrix_gap_count: matrixGapCount,
  };
}

export function recordToStartup(record) {
  const cell = record.target_cell;
  return {
    name: record.name,
    one_liner: record.one_liner,
    long_description: record.long_description,
    what_they_sell: record.what_they_sell,
    ai_play: record.ai_play,
    who_pays: record.who_pays,
    generation_rationale: record.generation_rationale,
    why_good_idea: record.why_good_idea ?? null,
    idea_primitive_id: record.idea_primitive_id ?? null,
    analog_slugs: record.analog_slugs ?? [],
    chips: [cell.business_model, cell.vertical_id, record.phenotype_primary_id],
    target_cell: cell,
  };
}

export function ideaToCard(idea, { matrixGapCount = null, judgment = null } = {}) {
  const record = idea.record;
  const gap = idea.gap ?? {
    rank: idea.rank,
    opportunity_score: idea.opportunity_score,
    transfer_score: idea.transfer_score,
    business_model: idea.target_cell.business_model,
    business_model_label: idea.business_model_label,
    vertical_id: idea.target_cell.vertical_id,
    vertical_label: idea.vertical_label,
    sector_id: record?.target_cell ? undefined : undefined,
    target_cell: idea.target_cell,
  };

  const whitespace = gapToWhitespace(gap, { matrixGapCount });
  const startup = recordToStartup(record);

  return {
    id: record.synthetic_id,
    variant: idea.variant ?? 1,
    generated_at: record.generated_at ?? new Date().toISOString(),
    whitespace,
    startup,
    scores: {
      judge_score: idea.judge_score ?? null,
      judge: idea.judge ?? null,
      goodness_index: idea.goodness_index ?? record.goodness_index ?? null,
      validation: idea.validation ?? null,
      gap_opportunity_score: gap.opportunity_score ?? null,
      gap_transfer_score: gap.transfer_score ?? idea.transfer_score ?? null,
    },
    judgment,
    // judge_score (LLM judge) ranks cards; heuristic goodness is the fallback.
    sort_score: idea.judge_score ?? (idea.goodness_index ?? record.goodness_index)?.overall ?? 0,
  };
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const g = (b.sort_score ?? 0) - (a.sort_score ?? 0);
    if (g !== 0) return g;
    const o = (b.scores.gap_opportunity_score ?? 0) - (a.scores.gap_opportunity_score ?? 0);
    if (o !== 0) return o;
    return String(a.id).localeCompare(String(b.id));
  });
}
