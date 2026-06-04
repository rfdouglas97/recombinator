/**
 * Shared classification audit helpers (used by audit-classifications + tiered-audit).
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { chatJson } from './llm.mjs';
import { auditSystemPrompt, auditUserPrompt, compactPhenotypeCatalog } from './audit-prompts.mjs';
import { loadVerticalOntology, normalizeVertical } from '../taxonomy/verticals.mjs';
import { PHENOTYPE_TO_BM } from '../taxonomy/phenotype-to-bm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const AUDIT_OUT = join(ROOT, 'output/audit');

export const AUDIT_PATHS = {
  jsonl: join(ROOT, 'output/phenotypes/assignments.jsonl'),
  classified: join(ROOT, 'output/yc_companies_classified.json'),
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
  state: join(AUDIT_OUT, 'audit-state.json'),
  audits: join(AUDIT_OUT, 'classification-audits.json'),
  auditsJsonl: join(AUDIT_OUT, 'classification-audits.jsonl'),
  log: join(AUDIT_OUT, 'audit-run.log'),
  tieredState: join(AUDIT_OUT, 'tiered-audit-state.json'),
  tieredLog: join(AUDIT_OUT, 'tiered-audit-run.log'),
};

export function auditLog(msg, logPath = AUDIT_PATHS.log) {
  console.log(msg);
  appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
}

export function loadAssignmentsFromJsonl() {
  if (!existsSync(AUDIT_PATHS.jsonl)) return [];
  const bySlug = new Map();
  for (const line of readFileSync(AUDIT_PATHS.jsonl, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    bySlug.set(r.slug, r);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function loadNormalizedMap() {
  if (!existsSync(AUDIT_PATHS.normalized)) return new Map();
  const rows = JSON.parse(readFileSync(AUDIT_PATHS.normalized, 'utf8'));
  return new Map(rows.map((r) => [r.slug, r]));
}

export function loadHeuristicBmMap() {
  if (!existsSync(AUDIT_PATHS.classified)) return new Map();
  const data = JSON.parse(readFileSync(AUDIT_PATHS.classified, 'utf8'));
  const companies = data.companies ?? data;
  const map = new Map();
  for (const c of companies) {
    const code =
      c.taxonomy?.business_model_primary ??
      c.taxonomy?.business_model?.code ??
      c.taxonomy?.business_model;
    if (code) map.set(c.slug, code);
  }
  return map;
}

export function enrichCompany(assignment, normalizedMap, verticalOntology, heuristicBm) {
  const norm = normalizedMap.get(assignment.slug);
  let vertical_id = norm?.vertical_id ?? null;
  let vertical_label = norm?.vertical_label ?? null;
  let vertical_sector_id = norm?.vertical_sector_id ?? null;
  let vertical_normalize_method = norm?.vertical_normalize_method ?? null;
  let vertical_normalize_confidence = norm?.vertical_normalize_confidence ?? null;
  let business_models = norm?.business_models ?? [];

  if (!vertical_id) {
    const n = normalizeVertical(
      { industry_sub_vertical: assignment.industry_sub_vertical, yc_industries: assignment.yc_industries },
      verticalOntology,
    );
    vertical_id = n.vertical_id;
    vertical_label = n.vertical?.label ?? null;
    vertical_sector_id = n.vertical?.sector_id ?? null;
    vertical_normalize_method = n.method;
    vertical_normalize_confidence = n.confidence;
  }

  if (!business_models.length) {
    const h = heuristicBm.get(assignment.slug);
    if (h) business_models = [h];
    else if (PHENOTYPE_TO_BM[assignment.phenotype_primary_id]) {
      business_models = PHENOTYPE_TO_BM[assignment.phenotype_primary_id];
    } else {
      business_models = ['BM-02'];
    }
  }

  return {
    ...assignment,
    vertical_id,
    vertical_label,
    vertical_sector_id,
    vertical_normalize_method,
    vertical_normalize_confidence,
    business_models,
    heuristic_business_model: heuristicBm.get(assignment.slug) ?? null,
  };
}

export function verticalCandidatesFor(company, verticalOntology) {
  const verts = verticalOntology.verticals ?? [];
  const sectorId = company.vertical_sector_id;
  let pool = sectorId ? verts.filter((v) => v.sector_id === sectorId) : verts;

  if (pool.length > 30) {
    const current = company.vertical_id;
    const scored = pool.map((v) => {
      let score = 0;
      if (v.id === current) score += 10;
      if (company.industry_sub_vertical && v.label) {
        const words = company.industry_sub_vertical.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
        const label = v.label.toLowerCase();
        score += words.filter((w) => label.includes(w)).length;
      }
      return { v, score };
    });
    scored.sort((a, b) => b.score - a.score);
    pool = scored.slice(0, 28).map((x) => x.v);
    if (current && !pool.some((v) => v.id === current)) {
      const cur = verts.find((v) => v.id === current);
      if (cur) pool.unshift(cur);
    }
  }

  return pool.slice(0, 30);
}

export function resolveAuditApiConfig(base, { model, maxTokens } = {}) {
  return {
    ...base,
    model: model ?? process.env.CLASSIFICATION_AUDIT_MODEL ?? 'claude-haiku-4-5-20251001',
    maxTokens: maxTokens ?? parseInt(process.env.CLASSIFICATION_AUDIT_MAX_TOKENS ?? '2048', 10),
  };
}

export function normalizeAuditResult(raw, company, model) {
  const verdict = ['ok', 'minor_fix', 'wrong'].includes(raw.verdict) ? raw.verdict : 'minor_fix';
  const severity =
    raw.severity ?? (verdict === 'wrong' ? 3 : verdict === 'minor_fix' ? 2 : 1);
  let classification_confidence = parseFloat(raw.classification_confidence);
  if (Number.isNaN(classification_confidence)) {
    classification_confidence =
      verdict === 'ok' ? 0.9 : verdict === 'minor_fix' ? 0.75 : 0.45;
  }
  classification_confidence = Math.max(0, Math.min(1, classification_confidence));

  return {
    slug: company.slug,
    name: company.name,
    verdict,
    severity,
    classification_confidence,
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    suggested_phenotype_primary_id: raw.suggested_phenotype_primary_id ?? null,
    suggested_vertical_id: raw.suggested_vertical_id ?? null,
    suggested_industry_sub_vertical: raw.suggested_industry_sub_vertical ?? null,
    suggested_business_models: raw.suggested_business_models ?? [],
    rationale: raw.rationale ?? '',
    current: {
      phenotype_primary_id: company.phenotype_primary_id,
      industry_sub_vertical: company.industry_sub_vertical,
      vertical_id: company.vertical_id,
      vertical_normalize_method: company.vertical_normalize_method,
      business_models: company.business_models,
    },
    audited_at: new Date().toISOString(),
    model,
  };
}

export async function auditOne(company, context, apiConfig) {
  const { phenotypeCatalog, verticalOntology, heuristicBm } = context;
  const candidates = verticalCandidatesFor(company, verticalOntology);
  const allowedBms = PHENOTYPE_TO_BM[company.phenotype_primary_id] ?? ['BM-02'];

  const raw = await chatJson({
    system: auditSystemPrompt(phenotypeCatalog),
    user: auditUserPrompt({
      company,
      verticalCandidates: candidates,
      heuristicBm: heuristicBm.get(company.slug),
      allowedBms,
    }),
    apiConfig,
  });

  return normalizeAuditResult(raw, company, apiConfig.model);
}

export function loadAuditState(path = AUDIT_PATHS.state) {
  if (!existsSync(path)) {
    return { processed_slugs: [], audits: [], started_at: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveAuditState(state, paths = AUDIT_PATHS) {
  state.updated_at = new Date().toISOString();
  writeFileSync(paths.state, JSON.stringify(state, null, 2));
  writeFileSync(paths.audits, JSON.stringify({ generated_at: state.updated_at, audits: state.audits }, null, 2));
}

export function resetAuditOutputs(paths = AUDIT_PATHS) {
  mkdirSync(AUDIT_OUT, { recursive: true });
  for (const p of [paths.state, paths.audits, paths.auditsJsonl]) {
    if (existsSync(p)) unlinkSync(p);
  }
}

export { compactPhenotypeCatalog };

export function tieredAuditConfig() {
  return {
    escalateBelow: parseFloat(process.env.TIERED_ESCALATE_BELOW ?? '0.85'),
    fintechEscalateBelow: parseFloat(process.env.TIERED_FINTECH_ESCALATE_BELOW ?? '0.92'),
    escalateMinorFix: process.env.TIERED_ESCALATE_MINOR_FIX === '1',
    tier1Model: process.env.TIERED_TIER1_MODEL ?? 'claude-haiku-4-5-20251001',
    tier2Model: process.env.TIERED_TIER2_MODEL ?? 'claude-sonnet-4-5-20250929',
  };
}

/** @returns {string[]} */
export function escalationReasons(tier1, company, cfg = tieredAuditConfig()) {
  const reasons = [];
  const conf = tier1.classification_confidence ?? 1;

  if (tier1.verdict === 'wrong') reasons.push('verdict_wrong');
  if (cfg.escalateMinorFix && tier1.verdict === 'minor_fix') reasons.push('verdict_minor_fix');
  else if (tier1.verdict === 'minor_fix' && conf < cfg.escalateBelow) {
    reasons.push('minor_fix_low_confidence');
  }
  if (conf < cfg.escalateBelow) reasons.push('low_classification_confidence');
  if (
    company.phenotype_primary_id === 'fintech-insurance-ai-product' &&
    conf < cfg.fintechEscalateBelow
  ) {
    reasons.push('fintech_phenotype_low_confidence');
  }

  const vm = company.vertical_normalize_method ?? company.vertical_method ?? '';
  if (vm.includes('yc_') || vm === 'yc_subindustry_default') reasons.push('yc_vertical_fallback');

  const assignConf = company.confidence ?? company.phenotype_confidence;
  if (typeof assignConf === 'number' && assignConf < 0.75) reasons.push('low_assignment_confidence');

  if (tier1.error) reasons.push('tier1_error');

  return [...new Set(reasons)];
}

export function shouldEscalate(tier1, company, cfg = tieredAuditConfig()) {
  return escalationReasons(tier1, company, cfg).length > 0;
}
