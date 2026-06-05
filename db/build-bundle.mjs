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
import { buildYcIndustryVerticalTree } from '../taxonomy/yc-industries.mjs';

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
  const { cohort_batches, ...facets } = await getFacets(assignments);
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
      cohort_batches: cohort_batches ?? [],
      assignment_count: assignments.length,
      vertical_count: ontologies.verticals.length,
      phenotype_count: ontologies.phenotypes.length,
      observed_bm_vertical_cells: Object.keys(bm_vertical).length,
      gap_count: bm_vertical_gaps.length,
      sources: ['postgres'],
    },
    facets,
    trees: {
      industry_vertical: buildYcIndustryVerticalTree(companies, verticalOntology),
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
