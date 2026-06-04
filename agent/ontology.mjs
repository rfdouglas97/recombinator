import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export function loadSeeds(seedsPath) {
  return JSON.parse(readFileSync(seedsPath, 'utf8'));
}

export function loadOntology(ontologyPath, seedsPath) {
  if (existsSync(ontologyPath)) {
    return JSON.parse(readFileSync(ontologyPath, 'utf8'));
  }
  const seeds = loadSeeds(seedsPath);
  return {
    version: seeds.version,
    updated_at: new Date().toISOString(),
    phenotypes: [...seeds.phenotypes],
    families: [...new Set(seeds.phenotypes.map((p) => p.family))],
    proposals_pending: [],
  };
}

export function saveOntology(ontologyPath, ontology) {
  mkdirSync(dirname(ontologyPath), { recursive: true });
  ontology.updated_at = new Date().toISOString();
  writeFileSync(ontologyPath, JSON.stringify(ontology, null, 2));
}

export function getOntologySummary(ontology) {
  return ontology.phenotypes
    .map(
      (p) =>
        `- ${p.id}: ${p.label} [${p.family}] — ${p.description} (wedge: ${p.value_wedge}, ai: ${p.ai_application})`
    )
    .join('\n');
}

export function mergeProposals(ontology, proposals) {
  const ids = new Set(ontology.phenotypes.map((p) => p.id));
  for (const prop of proposals ?? []) {
    if (!prop?.id || ids.has(prop.id)) continue;
    ontology.phenotypes.push({
      id: prop.id,
      label: prop.label,
      family: prop.family ?? 'discovered',
      value_wedge: prop.value_wedge ?? 'unknown',
      ai_application: prop.ai_application ?? 'unknown',
      description: prop.description ?? prop.label,
      discovered_at: new Date().toISOString(),
      source: 'agent_proposal',
    });
    ids.add(prop.id);
  }
  ontology.families = [...new Set(ontology.phenotypes.map((p) => p.family))];
  ontology.proposals_pending = [];
  return ontology;
}

export function findPhenotype(ontology, id) {
  return ontology.phenotypes.find((p) => p.id === id) ?? null;
}
