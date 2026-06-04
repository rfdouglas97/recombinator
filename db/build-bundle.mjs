/**
 * Build explorer DataBundle shape from Postgres.
 */

import {
  fetchAssignmentsForBundle,
  fetchBmVerticalMatrix,
  fetchPhenotypeIndustryMatrix,
  fetchGapCellKeys,
  fetchOntologies,
  getFacets,
} from './queries.mjs';

function buildIndustryVerticalTree(verticalOntology, companiesByVertical) {
  const { sectors, industries, verticals } = verticalOntology;
  const root = { id: 'root', label: 'All verticals', type: 'root', children: [] };

  for (const sector of sectors) {
    const sectorIndustries = industries.filter((i) => i.sector_id === sector.id);
    const sectorNode = { id: sector.id, label: sector.label, type: 'sector', children: [] };

    for (const ind of sectorIndustries) {
      const indVerts = verticals.filter((v) => v.industry_id === ind.id);
      const indNode = { id: ind.id, label: ind.label, type: 'industry', children: [] };

      for (const v of indVerts) {
        const slugs = companiesByVertical[v.id] ?? [];
        indNode.children.push({
          id: v.id,
          label: v.label,
          type: 'vertical',
          workflow: v.workflow ?? null,
          companyCount: slugs.length,
          children: slugs.map((slug) => ({ id: slug, label: slug, type: 'company', children: [] })),
        });
      }
      if (indNode.children.length) sectorNode.children.push(indNode);
    }
    if (sectorNode.children.length) root.children.push(sectorNode);
  }
  return root;
}

function buildPhenotypeTree(ontology, companiesByPhenotype) {
  const families = [...new Set(ontology.phenotypes.map((p) => p.family))];
  const root = { id: 'root', label: 'All phenotypes', type: 'root', children: [] };

  for (const family of families.sort()) {
    const phenos = ontology.phenotypes.filter((p) => p.family === family);
    const familyNode = {
      id: family,
      label: family.replace(/_/g, ' '),
      type: 'family',
      children: phenos.map((p) => {
        const slugs = companiesByPhenotype[p.id] ?? [];
        return {
          id: p.id,
          label: p.label,
          type: 'phenotype',
          value_wedge: p.value_wedge,
          companyCount: slugs.length,
          children: slugs.map((slug) => ({ id: slug, label: slug, type: 'company', children: [] })),
        };
      }),
    };
    root.children.push(familyNode);
  }
  return root;
}

export async function buildBundleFromDb() {
  const assignments = await fetchAssignmentsForBundle();
  const ontologies = await fetchOntologies();
  const facets = await getFacets();
  const [bm_vertical, phenotype_industry, bm_vertical_gaps] = await Promise.all([
    fetchBmVerticalMatrix(),
    fetchPhenotypeIndustryMatrix(),
    fetchGapCellKeys(),
  ]);

  const companiesByVertical = {};
  const companiesByPhenotype = {};
  const companies = {};

  for (const a of assignments) {
    companies[a.slug] = a;
    if (a.vertical_id) {
      (companiesByVertical[a.vertical_id] ??= []).push(a.slug);
    }
    if (a.phenotype_primary_id) {
      (companiesByPhenotype[a.phenotype_primary_id] ??= []).push(a.slug);
    }
  }

  const phenotypeOntology = { phenotypes: ontologies.phenotypes };
  const verticalOntology = {
    sectors: ontologies.sectors,
    industries: ontologies.industries,
    verticals: ontologies.verticals,
  };

  return {
    generated_at: new Date().toISOString(),
    source: 'postgres',
    meta: {
      assignment_count: assignments.length,
      vertical_count: ontologies.verticals.length,
      phenotype_count: ontologies.phenotypes.length,
      observed_bm_vertical_cells: Object.keys(bm_vertical).length,
      gap_count: bm_vertical_gaps.length,
      sources: ['postgres'],
    },
    facets,
    trees: {
      industry_vertical: buildIndustryVerticalTree(verticalOntology, companiesByVertical),
      phenotype: buildPhenotypeTree(phenotypeOntology, companiesByPhenotype),
    },
    companies,
    matrices: {
      bm_vertical,
      bm_vertical_gaps,
      phenotype_industry,
    },
  };
}
