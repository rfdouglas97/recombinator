#!/bin/bash
# Daily YC Launches check — scrape, evaluate, enrich DB, refresh explorer bundle.
# Logs append to output/launches/logs/daily-YYYY-MM-DD.log

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/output/launches/logs"
LOG_FILE="$LOG_DIR/daily-$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

{
  echo "=== YC launch check $(date -Iseconds) ==="
  echo "Project: $ROOT"

  cd "$ROOT"

  export PLAYWRIGHT_BROWSERS_PATH="$ROOT/.playwright-browsers"

  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node not found in PATH"
    exit 1
  fi

  echo "Node: $(node -v) at $(command -v node)"

  node scripts/check-launches.mjs --ingest --refresh

  echo "=== Done $(date -Iseconds) ==="
} >>"$LOG_FILE" 2>&1
