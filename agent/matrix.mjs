export function buildMatrix(assignments, ontology) {
  const cells = {};
  const phenotypeCounts = {};
  const industryCounts = {};
  const patterns = {};

  for (const a of assignments) {
    const p = a.phenotype_primary_id;
    const i = a.industry_sub_vertical ?? 'Unknown';
    const key = `${p}|||${i}`;
    if (!cells[key]) {
      cells[key] = {
        phenotype_id: p,
        phenotype_label: a.phenotype_primary_label,
        industry_sub_vertical: i,
        count: 0,
        companies: [],
      };
    }
    cells[key].count += 1;
    if (cells[key].companies.length < 8) {
      cells[key].companies.push({
        slug: a.slug,
        name: a.name,
        website: a.website,
        one_liner: a.one_liner,
      });
    }

    phenotypeCounts[p] = (phenotypeCounts[p] ?? 0) + 1;
    industryCounts[i] = (industryCounts[i] ?? 0) + 1;

    for (const pat of a.ai_application_patterns ?? []) {
      patterns[pat] = (patterns[pat] ?? 0) + 1;
    }
  }

  const sparse = Object.values(cells).sort((a, b) => b.count - a.count);

  // Per-phenotype industry breakdown
  const phenotypeByIndustry = {};
  for (const c of sparse) {
    if (!phenotypeByIndustry[c.phenotype_id]) {
      phenotypeByIndustry[c.phenotype_id] = { phenotype_label: c.phenotype_label, industries: [] };
    }
    phenotypeByIndustry[c.phenotype_id].industries.push({
      industry_sub_vertical: c.industry_sub_vertical,
      count: c.count,
    });
  }
  for (const pid of Object.keys(phenotypeByIndustry)) {
    phenotypeByIndustry[pid].industries.sort((a, b) => b.count - a.count);
  }

  const emptyCells = [];
  for (const p of ontology.phenotypes) {
    const hasAny = sparse.some((c) => c.phenotype_id === p.id);
    if (!hasAny) emptyCells.push({ phenotype_id: p.id, phenotype_label: p.label });
  }

  return {
    generated_at: new Date().toISOString(),
    dimensions: {
      row: 'phenotype (business archetype)',
      column: 'industry_sub_vertical',
    },
    summary: {
      total_assignments: assignments.length,
      unique_phenotypes_used: Object.keys(phenotypeCounts).length,
      unique_industries: Object.keys(industryCounts).length,
      sparse_cell_count: sparse.length,
      empty_phenotype_rows: emptyCells.length,
    },
    phenotype_totals: Object.entries(phenotypeCounts)
      .map(([id, count]) => ({
        phenotype_id: id,
        phenotype_label: ontology.phenotypes.find((p) => p.id === id)?.label ?? id,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    industry_totals: Object.entries(industryCounts)
      .map(([industry_sub_vertical, count]) => ({ industry_sub_vertical, count }))
      .sort((a, b) => b.count - a.count),
    ai_pattern_totals: Object.entries(patterns)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count),
    sparse_matrix: sparse,
    phenotype_by_industry: phenotypeByIndustry,
    empty_phenotypes: emptyCells,
  };
}
