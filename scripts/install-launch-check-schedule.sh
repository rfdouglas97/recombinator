#!/bin/bash
# Install or uninstall the daily launch-check LaunchAgent (macOS launchd).
#
# Usage:
#   ./scripts/install-launch-check-schedule.sh install
#   ./scripts/install-launch-check-schedule.sh uninstall
#   ./scripts/install-launch-check-schedule.sh status

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$ROOT/scripts/com.ycscrape.launch-check.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.ycscrape.launch-check.plist"
LABEL="com.ycscrape.launch-check"

cmd="${1:-install}"

case "$cmd" in
  install)
    chmod +x "$ROOT/scripts/run-daily-launch-check.sh"
    mkdir -p "$ROOT/output/launches/logs"
    cp "$PLIST_SRC" "$PLIST_DST"
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
    echo "Installed. Runs daily at 8:00 AM (edit Hour/Minute in $PLIST_SRC, then re-run install)."
    echo "Test now: $ROOT/scripts/run-daily-launch-check.sh"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST_DST"
    echo "Uninstalled $LABEL"
    ;;
  status)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null || echo "Not loaded"
    ;;
  *)
    echo "Usage: $0 {install|uninstall|status}"
    exit 1
    ;;
esac
