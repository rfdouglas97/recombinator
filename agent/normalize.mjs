import { findPhenotype } from './ontology.mjs';

const ID_ALIASES = [
  'phenotype_primary_id',
  'phenotype_id',
  'primary_phenotype_id',
  'primary_phenotype',
  'phenotype',
];

/** Map LLM JSON to canonical fields; infer phenotype id when model omits it. */
export function normalizeLlmResult(raw, ontology) {
  const out = { ...raw };

  for (const key of ID_ALIASES) {
    if (typeof out[key] === 'string' && out[key]) {
      out.phenotype_primary_id = out[key];
      break;
    }
  }

  if (!out.phenotype_primary_id && out.proposed_phenotype?.id) {
    out.phenotype_primary_id = out.proposed_phenotype.id;
  }

  if (!out.phenotype_primary_id && typeof out.rationale === 'string') {
    for (const p of ontology.phenotypes) {
      if (out.rationale.includes(p.id)) {
        out.phenotype_primary_id = p.id;
        break;
      }
    }
  }

  if (!out.phenotype_primary_id && typeof out.rationale === 'string') {
    const lower = out.rationale.toLowerCase();
    for (const p of ontology.phenotypes) {
      if (lower.includes(p.label.toLowerCase())) {
        out.phenotype_primary_id = p.id;
        break;
      }
    }
  }

  const pheno = out.phenotype_primary_id ? findPhenotype(ontology, out.phenotype_primary_id) : null;
  if (pheno) {
    out.phenotype_primary_id = pheno.id;
    out.phenotype_primary_label = out.phenotype_primary_label ?? pheno.label;
    out.value_wedge = out.value_wedge ?? pheno.value_wedge;
    out.ai_application = out.ai_application ?? pheno.ai_application;
  }

  if (!out.who_pays) out.who_pays = 'Enterprise';
  if (!out.rationale) out.rationale = 'Classified by LLM (no rationale returned).';

  return out;
}
