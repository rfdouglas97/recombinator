export type TreeNodeType = 'root' | 'sector' | 'industry' | 'vertical' | 'family' | 'phenotype' | 'company';

export interface TreeNode {
  id: string;
  label: string;
  type: TreeNodeType;
  workflow?: string | null;
  companyCount?: number;
  value_wedge?: string;
  children: TreeNode[];
}

export interface Company {
  slug: string;
  name: string;
  website: string | null;
  yc_profile_url: string;
  batch: string;
  one_liner: string | null;
  description: string | null;
  industry_sub_vertical: string;
  vertical_id: string;
  vertical_label: string;
  vertical_sector_id: string;
  phenotype_primary_id: string;
  phenotype_primary_label: string;
  phenotype_family: string;
  phenotype_secondary_id: string | null;
  business_models: string[];
  confidence: number | null;
  what_they_sell: string | null;
  ai_play: string | null;
  yc_tags: string[];
}

export interface MatrixCellData {
  count: number;
  slugs: string[];
  business_model_label?: string;
  vertical_label?: string;
  sector_id?: string;
  phenotype_label?: string;
  industry_sub_vertical?: string;
}

export interface DataBundle {
  generated_at: string;
  meta: {
    assignment_count: number;
    vertical_count: number;
    phenotype_count: number;
    observed_bm_vertical_cells: number;
    gap_count: number;
    sources: string[];
  };
  facets: {
    batches: string[];
    sectors: { id: string; label: string }[];
    industries: { id: string; label: string; sector_id: string }[];
    businessModels: { id: string; label: string; definition: string }[];
    phenotypeFamilies: string[];
    phenotypes: { id: string; label: string; family: string }[];
    verticals: {
      id: string;
      label: string;
      sector_id: string;
      industry_id: string;
      industry_label: string;
      sector_label: string;
    }[];
  };
  trees: {
    industry_vertical: TreeNode;
    phenotype: TreeNode;
  };
  companies: Record<string, Company>;
  matrices: {
    bm_vertical: Record<string, MatrixCellData>;
    bm_vertical_gaps: string[];
    phenotype_industry: Record<string, MatrixCellData>;
  };
}

export type ViewTab = 'ontology' | 'matrix' | 'library';
export type OntologyMode = 'industry_vertical' | 'phenotype';
export type MatrixMode = 'bm_vertical' | 'phenotype_industry';
export type MatrixDisplay = 'density' | 'gaps' | 'both';
export type VizLayout = 'sunburst' | 'icicle';

export interface TargetCell {
  business_model: string;
  vertical_id: string;
  phenotype_primary_id: string;
}

export interface GapCandidate {
  business_model: string;
  business_model_label: string;
  vertical_id: string;
  vertical_label: string;
  sector_id: string;
  sector_label: string;
  industry_label: string;
  workflow: string | null;
  relevance_score: number | null;
  target_cell: TargetCell;
  cell_key: string;
}

export interface SyntheticRecord {
  synthetic_id: string;
  target_cell: TargetCell;
  name: string;
  one_liner: string;
  long_description: string;
  industry_sub_vertical: string;
  phenotype_primary_id: string;
  what_they_sell: string;
  ai_play: string;
  who_pays: string;
  ai_application_patterns: string[];
  delivery: string[];
  buyer: string[];
  yc_industries_hypothesis: string[];
  generation_rationale: string;
  generated_at?: string;
}

export interface GeneratedStartup {
  record: SyntheticRecord;
  validation: { valid: boolean; errors: string[] };
  exemplars_used: string[];
  gap_context: {
    vertical_label: string;
    sector_label: string;
    workflow: string | null;
  } | null;
  selected_gap?: GapCandidate;
  selection_method?: 'best_match' | 'seeded_surprise';
}

export interface StartupWhitespace {
  business_model: string;
  business_model_label: string;
  vertical_id: string;
  vertical_label: string;
  sector_id?: string;
  sector_label: string;
  industry_label?: string | null;
  workflow: string | null;
  cell_key: string;
  target_cell: TargetCell;
  opportunity_score: number | null;
  opportunity_rank: number | null;
  transfer_score: number | null;
  transfer_band?: string | null;
  matrix_gap_count?: number | null;
}

export interface StartupCardCompany {
  name: string;
  one_liner: string;
  long_description: string;
  what_they_sell: string;
  ai_play: string;
  who_pays: string;
  generation_rationale: string;
  why_good_idea?: {
    pain?: string;
    urgency?: string;
    ai_wedge?: string;
    buyer_budget?: string;
    proof_from_batch?: string;
  } | null;
  chips: string[];
  target_cell: TargetCell;
}

export interface GoodnessIndex {
  overall: number;
  band: string;
  dimensions?: Record<string, number>;
}

export interface StartupIdeaCard {
  id: string;
  card_rank: number;
  variant?: number;
  generated_at: string;
  whitespace: StartupWhitespace;
  startup: StartupCardCompany;
  scores: {
    goodness_index: GoodnessIndex | null;
    validation: { valid: boolean; errors: string[] } | null;
    gap_opportunity_score?: number | null;
    gap_transfer_score?: number | null;
  };
  judgment?: 'promising' | 'maybe' | 'reject' | null;
  human_score?: number | null;
  notes?: string;
  judged_at?: string | null;
  sort_score?: number;
}

export interface CardJudgment {
  verdict?: 'promising' | 'maybe' | 'reject' | null;
  human_score?: number | null;
  notes?: string;
}

export interface StartupLibrary {
  updated_at: string | null;
  card_count: number;
  cards: StartupIdeaCard[];
  batches?: {
    at: string;
    requested: number;
    picked: number;
    succeeded: number;
    failed: number;
    guidance: Record<string, string>;
  }[];
  stats?: {
    judged: number;
    reject: number;
    promising: number;
    succeeded?: number;
    requested?: number;
    gaps?: number;
  };
}

export interface Filters {
  batch: string;
  sector: string;
  industry: string;
  phenotypeFamily: string;
  businessModel: string;
  minConfidence: number;
  search: string;
}

export interface GapSelection {
  kind: 'gap';
  businessModel: string;
  businessModelLabel: string;
  verticalId: string;
  verticalLabel: string;
  sectorId?: string;
}

export interface CellSelection {
  kind: 'cell';
  rowId: string;
  colId: string;
  slugs: string[];
  count: number;
  isGap: boolean;
}

export type DrawerSelection =
  | { kind: 'company'; slug: string }
  | { kind: 'companies'; slugs: string[]; title: string }
  | CellSelection
  | GapSelection
  | null;

export interface FilterState extends Filters {
  view: ViewTab;
  ontologyMode: OntologyMode;
  matrixMode: MatrixMode;
  matrixDisplay: MatrixDisplay;
  vizLayout: VizLayout;
  sectorCollapsed: boolean;
  ontologyFocusId: string | null;
}
