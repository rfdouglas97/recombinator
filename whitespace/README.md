# Whitespace opportunity ranking

Ranks empty **business model × vertical** cells from `gap-candidates.json` through a four-stage funnel:

1. **Fit** — only pre-filtered gaps (sector × BM rules in `fit-priority.json`)
2. **Transfer** — proto goodness / `transfer_score` from `scripts/goodness-rubric.mjs`
3. **Opportunity** — batch-native signals (analogs, adjacency, specificity, BM fit boost)
4. **Kill-list** — human exclusions in `kill-list.json`

Most structurally absurd pairings never appear in `gap-candidates.json`; use `kill-list.json` for extra rejects (e.g. sectors you do not want to pursue).

## Commands

```bash
npm run whitespace:rank      # write output/whitespace/*.json
npm run whitespace:refresh   # verticals:gaps + idea primitives + rank
```

Options:

```bash
node whitespace/build.mjs --sector healthcare-life-sciences
node whitespace/build.mjs --min-opportunity 55 --top 30
node whitespace/build.mjs --no-write   # print JSON to stdout
```

## Outputs

| File | Purpose |
|------|---------|
| `output/whitespace/gap-opportunity-ranked.json` | All ranked gaps (`rank`, scores, flags) |
| `output/whitespace/sector-summary.json` | Top N per sector + averages |
| `output/whitespace/rejected-kill-list.json` | Gaps removed by kill-list |

## Scores

**`transfer_score`** (0–100) — how well a proto thesis fits the cell (buyer, workflow, analog proof).

**`opportunity_score`** (0–100) — composite:

```
round(100 × (0.40 × transfer/100 + 0.25 × analog + 0.20 × adjacency + 0.15 × specificity)) + bm_fit_boost
```

- **analog_strength** — `min(1, transfer_analogs / 3)`; 0 if analog required and missing
- **adjacency** — 1.0 prefix cluster, 0.85 sector+phenotype family, 0.5 sector, 0.2 else
- **specificity** — vertical depth + workflow + buyers
- **bm_fit_boost** — +3 if gap BM is first preferred for sector in `fit-priority.json`

**Flags:** `vertical_desert`, `sibling_gap`, `bm_hole`, `low_transfer`, `no_analog`, `missing_workflow`, `kill_match`

## Archetype rules (generalized)

[`taxonomy/infer-archetype.mjs`](../taxonomy/infer-archetype.mjs) refines phenotype + BM from `what_they_sell`, `who_pays`, and `ai_play` — no per-slug table. Applied on:

- Initial classification (`agent/run.mjs`)
- Reclassify (`agent/reclassify-classifications.mjs`)
- Normalize write (`npm run verticals:normalize -- --write`)
- Whitespace ranking load path

Fintech analog matching requires the same **sub-industry** (`fintech.insurance` vs `fintech.trading` vs `fintech.lending`).

## Generator integration

After ranking, `pickWhitespaceCell` in `scripts/generator-lib.mjs`:

- Prefers gaps with `opportunity_score >= 55` when ranked JSON exists
- Seeded surprise picks from top 30 by opportunity
- Falls back to `transfer_score >= 45` if ranked file is missing

## Weekly workflow

1. `npm run whitespace:refresh`
2. Review top 30 in `gap-opportunity-ranked.json` or `sector-summary.json`
3. Edit `kill-list.json` for bad fits; re-rank
4. Generate startups for top cells via explorer or `generate-synthetic.mjs --cell …`

## Editing kill-list

```json
{
  "sector_block": ["consumer"],
  "vertical_prefix_block": ["media.gaming"],
  "business_model_block": ["BM-12"],
  "rules": [
    {
      "match": { "sector_id": "healthcare-life-sciences", "business_model": "BM-09" },
      "reason": "biotech_without_lab_workflow",
      "unless_vertical_prefix": ["healthcare", "life-sciences"]
    }
  ]
}
```

Re-run `npm run whitespace:rank` after changes.
