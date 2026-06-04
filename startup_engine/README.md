# Startup library

Batch-generate startup **cards** from ranked matrix whitespace — same format as the explorer Startup Generator modal, but at scale.

## Quick start

```bash
# Refresh gaps + idea primitives + whitespace rankings (run when taxonomy changes)
npm run startup-library:refresh

# Preview top picks (no LLM cost)
npm run startup-library -- --dry-run --top 10

# Generate 20 ideas from top 20 whitespace gaps
npm run startup-library -- --top 20

# 10 gaps × 2 variants each = 20 cards
npm run startup-library -- --top 10 --k 2

# Filter by sector
npm run startup-library -- --top 15 --sector healthcare-life-sciences
```

## Outputs

| File | Purpose |
|------|---------|
| `output/startup-library/library.json` | Sorted card library (browse in explorer) |
| `output/startup-library/cards.jsonl` | Append-only log (one card per line) |
| `startup_engine/output/ideas-*.json` | Raw generation batch |
| `startup_engine/output/shortlist-*.json` | Which gaps were picked |

## Browse & judge

1. Run `npm run data:bundle` (copies library into explorer)
2. Open explorer → **Idea library** tab
3. Sort by goodness or whitespace opportunity
4. Mark cards **Promising / Maybe / Reject** (saved in browser localStorage)

## Card shape

Each card has:

- **Whitespace** — BM × vertical cell, sector, workflow, opportunity rank
- **Startup** — name, one-liner, sells/AI play/who pays, rationale
- **Scores** — goodness index + validation

## Pipeline

```
gap-candidates.json (974 cells)
  → whitespace/build.mjs ranks by fit + transfer + opportunity
  → startup_engine/pick-whitespace.mjs shortlists sharp wedges
  → generator-lib.mjs LLM generation per cell
  → card-lib.mjs normalizes to library cards
```
