#!/usr/bin/env node
/**
 * Merge pipeline outputs into explorer/public/data.bundle.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'explorer/public/data.bundle.json');

function readJson(rel, fallback = null) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function truncate(s, max = 2000) {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function buildIndustryVerticalTree(verticalOntology, companiesByVertical) {
  const { sectors, industries, verticals } = verticalOntology;
  const industryById = Object.fromEntries(industries.map((i) => [i.id, i]));

  const root = { id: 'root', label: 'All verticals', type: 'root', children: [] };

  for (const sector of sectors) {
    const sectorIndustries = industries.filter((i) => i.sector_id === sector.id);
    const sectorNode = {
      id: sector.id,
      label: sector.label,
      type: 'sector',
      children: [],
    };

    for (const ind of sectorIndustries) {
      const indVerts = verticals.filter((v) => v.industry_id === ind.id);
      const indNode = {
        id: ind.id,
        label: ind.label,
        type: 'industry',
        children: [],
      };

      for (const v of indVerts) {
        const slugs = companiesByVertical[v.id] ?? [];
        indNode.children.push({
          id: v.id,
          label: v.label,
          type: 'vertical',
          workflow: v.workflow ?? null,
          companyCount: slugs.length,
          children: slugs.map((slug) => ({
            id: slug,
            label: slug,
            type: 'company',
            children: [],
          })),
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
          children: slugs.map((slug) => ({
            id: slug,
            label: slug,
            type: 'company',
            children: [],
          })),
        };
      }),
    };
    root.children.push(familyNode);
  }
  return root;
}

function main() {
  const assignments = readJson('output/verticals/normalized-assignments.json', []);
  const verticalOntology = readJson('taxonomy/verticals.json', null);
  const phenotypeOntology = readJson('output/phenotypes/ontology.json', { phenotypes: [] });
  const bmMatrix = readJson('output/verticals/bm-vertical-matrix.json', { observed_cells: [] });
  const gaps = readJson('output/verticals/gap-candidates.json', { gaps: [] });
  const phenotypeMatrix = readJson('output/phenotypes/matrix.json', { sparse_matrix: [] });
  const bmTaxonomy = readJson('taxonomy/v0.1.json', { business_models: {} });

  if (!verticalOntology || !assignments.length) {
    console.error('Missing normalized-assignments.json or verticals.json. Run verticals:normalize first.');
    process.exit(1);
  }

  const companiesByVertical = {};
  const companiesByPhenotype = {};
  const companies = {};

  for (const a of assignments) {
    const desc = truncate(a.description_combined ?? a.one_liner);
    companies[a.slug] = {
      slug: a.slug,
      name: a.name,
      website: a.website ?? null,
      yc_profile_url: a.yc_profile_url,
      batch: a.batch,
      one_liner: a.one_liner ?? null,
      description: desc,
      industry_sub_vertical: a.industry_sub_vertical,
      vertical_id: a.vertical_id,
      vertical_label: a.vertical_label,
      vertical_sector_id: a.vertical_sector_id,
      phenotype_primary_id: a.phenotype_primary_id,
      phenotype_primary_label: a.phenotype_primary_label,
      phenotype_family: a.phenotype_family,
      phenotype_secondary_id: a.phenotype_secondary_id ?? null,
      business_models: a.business_models ?? [],
      confidence: a.confidence ?? null,
      what_they_sell: a.what_they_sell ?? null,
      ai_play: a.ai_play ?? null,
      yc_tags: a.yc_tags ?? [],
    };

    if (a.vertical_id) {
      if (!companiesByVertical[a.vertical_id]) companiesByVertical[a.vertical_id] = [];
      companiesByVertical[a.vertical_id].push(a.slug);
    }
    if (a.phenotype_primary_id) {
      if (!companiesByPhenotype[a.phenotype_primary_id]) companiesByPhenotype[a.phenotype_primary_id] = [];
      companiesByPhenotype[a.phenotype_primary_id].push(a.slug);
    }
  }

  const bm_vertical = {};
  for (const cell of bmMatrix.observed_cells ?? []) {
    const key = `${cell.business_model}|${cell.vertical_id}`;
    bm_vertical[key] = {
      count: cell.companies?.length ?? 0,
      slugs: cell.companies ?? [],
      business_model_label: cell.business_model_label,
      vertical_label: cell.vertical_label,
      sector_id: cell.sector_id,
    };
  }

  const bm_vertical_gaps = new Set();
  for (const g of gaps.gaps ?? []) {
    bm_vertical_gaps.add(`${g.business_model}|${g.vertical_id}`);
  }

  const phenotype_industry = {};
  for (const cell of phenotypeMatrix.sparse_matrix ?? []) {
    const key = `${cell.phenotype_id}|${cell.industry_sub_vertical}`;
    phenotype_industry[key] = {
      count: cell.count,
      slugs: (cell.companies ?? []).map((c) => (typeof c === 'string' ? c : c.slug)),
      phenotype_label: cell.phenotype_label,
      industry_sub_vertical: cell.industry_sub_vertical,
    };
  }

  const businessModels = Object.entries(bmTaxonomy.business_models ?? {}).map(([id, m]) => ({
    id,
    label: m.label,
    definition: m.definition,
  }));

  const batches = [...new Set(assignments.map((a) => a.batch).filter(Boolean))].sort();
  const sectors = verticalOntology.sectors;
  const phenotypeFamilies = [...new Set(phenotypeOntology.phenotypes.map((p) => p.family))].sort();

  const bundle = {
    generated_at: new Date().toISOString(),
    meta: {
      assignment_count: assignments.length,
      vertical_count: verticalOntology.verticals?.length ?? 0,
      phenotype_count: phenotypeOntology.phenotypes?.length ?? 0,
      observed_bm_vertical_cells: Object.keys(bm_vertical).length,
      gap_count: bm_vertical_gaps.size,
      sources: [
        'output/verticals/normalized-assignments.json',
        'taxonomy/verticals.json',
        'output/phenotypes/ontology.json',
        'output/verticals/bm-vertical-matrix.json',
        'output/verticals/gap-candidates.json',
        'output/phenotypes/matrix.json',
      ],
    },
    facets: {
      batches,
      sectors: sectors.map((s) => ({ id: s.id, label: s.label })),
      industries: verticalOntology.industries.map((i) => ({
        id: i.id,
        label: i.label,
        sector_id: i.sector_id,
      })),
      businessModels,
      phenotypeFamilies,
      phenotypes: phenotypeOntology.phenotypes.map((p) => ({
        id: p.id,
        label: p.label,
        family: p.family,
      })),
      verticals: verticalOntology.verticals.map((v) => ({
        id: v.id,
        label: v.label,
        sector_id: v.sector_id,
        industry_id: v.industry_id,
        industry_label: v.industry_label,
        sector_label: v.sector_label,
      })),
    },
    trees: {
      industry_vertical: buildIndustryVerticalTree(verticalOntology, companiesByVertical),
      phenotype: buildPhenotypeTree(phenotypeOntology, companiesByPhenotype),
    },
    companies,
    matrices: {
      bm_vertical,
      bm_vertical_gaps: [...bm_vertical_gaps],
      phenotype_industry,
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bundle));

  const librarySrc = join(ROOT, 'output/startup-library/library.json');
  const libraryOut = join(ROOT, 'explorer/public/startup-library.json');
  if (existsSync(librarySrc)) {
    writeFileSync(libraryOut, readFileSync(librarySrc));
    console.log(`Copied startup library → ${libraryOut}`);
  }

  const mb = (Buffer.byteLength(JSON.stringify(bundle)) / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${OUT} (${mb} MB, ${assignments.length} companies)`);
}

main();
