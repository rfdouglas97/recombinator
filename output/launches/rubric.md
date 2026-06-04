# YC Launch Conformance Rubric

Version 1.0

## Taxonomy dimensions

### Phenotype alignment (weight 0.25)
Launch narrative matches the assigned/canonical business archetype (value wedge, AI application, workflow pattern).

- **strong**: ≥0.75 — launch keywords and thesis map clearly to phenotype family
- **acceptable**: 0.50–0.74 — partial match; secondary phenotype may fit better
- **weak**: <0.50 — launch reads as a different archetype than classification

### Vertical / workflow fit (weight 0.25)
Launch describes buyers, pain, and workflow steps that match the canonical vertical leaf.

- **strong**: ≥0.75 — buyers/workflow terms from vertical appear in launch body
- **acceptable**: 0.50–0.74 — sector correct but workflow leaf is approximate
- **weak**: <0.50 — launch targets a different industry workflow

### Business model fit (weight 0.15)
Monetization and delivery signals (SaaS, managed service, marketplace, etc.) match BM code.

- **strong**: ≥0.75 — BM is unambiguous from launch
- **acceptable**: 0.50–0.74 — BM plausible but multi-model
- **weak**: <0.50 — BM mismatch or unclassifiable

### Ontology completeness (weight 0.15)
All three taxonomy layers resolve without fallback or missing vertical/phenotype.

- **strong**: 1.0 — phenotype, vertical, BM all resolved with confidence ≥0.7
- **acceptable**: 0.6 — one layer inferred heuristically
- **weak**: <0.6 — missing layer or low confidence across board

### Thesis coherence (weight 0.2)
Launch has clear what-they-sell, who-pays, and AI wedge (not generic AI platform language).

- **strong**: ≥0.75 — sharp one-liner + specific buyer + concrete AI mechanism
- **acceptable**: 0.50–0.74 — thesis present but vague on buyer or wedge
- **weak**: <0.50 — buzzword-heavy or horizontal positioning

## Predictor checks

- **cell_was_whitespace**: Was (BM × vertical) an empty matrix cell before this company?
- **ranked_gap_match**: Did the cell appear in gap-opportunity-ranked.json?
- **synthetic_idea_match**: Did we generate a synthetic startup card for this cell?
- **analog_in_gap_flags**: Was this company slug cited as an analog in a ranked gap?
- **retro_transfer_score**: Goodness-index score if launch thesis were placed in the target cell

## Predictability bands

- **predicted**: Cell was top-50 ranked gap, OR synthetic card exists, OR slug was gap analog — model would have surfaced this niche
- **plausible**: Cell was in gap list (lower rank) or adjacent cluster had high opportunity — structurally foreseeable
- **occupied_first**: Company is first occupant of cell — not predictable as whitespace but taxonomy-conforming
- **surprise**: Classification mismatch or launch narrative diverges from assigned cell
- **out_of_scope**: Cannot classify; outside ontology or batch scope