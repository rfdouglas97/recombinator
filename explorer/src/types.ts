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
  /** Primary BM is always business_models[0] after single-BM normalization. */
  business_models: string[];
  primary_bm?: string;
  confidence: number | null;
  what_they_sell: string | null;
  ai_play: string | null;
  yc_tags: string[];
  yc_industries: string[];
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
    cohort_batches?: string[];
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

export type ViewTab = 'ontology' | 'matrix';
export type OntologyMode = 'industry_vertical' | 'phenotype';
export type MatrixMode = 'bm_sector' | 'bm_industry' | 'bm_vertical';
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
  matrixHideEmptyCols: boolean;
  vizLayout: VizLayout;
  ontologyFocusId: string | null;
}
