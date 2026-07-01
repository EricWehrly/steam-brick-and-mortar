#!/usr/bin/env bash
# Full asset pipeline: extract from VPK, then convert to GLB.
# Output is streamed to console and saved to desktop/source-extract/logs/.
#
# Usage (from project root or here):
#   bash desktop/source-extract/run.sh [options]
#
# Options:
#   --game portal2              Game to process (default: portal2)
#   --models sentry,wheatley    Comma-delimited manifest names to target
#   --manifest-file portal2-manifest.json   Manifest filename (relative to scripts/)
#   --force-extract             Re-extract even if files already exist in extracted/
#   --skip-extract              Skip VPK extraction (convert only — files must already exist)
#   --skip-convert              Skip Blender conversion (extract only)
#   --dry-run                   Show what would be extracted without doing it (extract step only)
#
# Examples:
#   bash run.sh
#   bash run.sh --models sentry_turret,wheatley
#   bash run.sh --skip-extract --models companion_cube
#   bash run.sh --force-extract --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/pipeline-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

SKIP_EXTRACT=false
SKIP_CONVERT=false
PASSTHROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-extract)
            SKIP_EXTRACT=true; shift ;;
        --skip-convert)
            SKIP_CONVERT=true; shift ;;
        *)
            PASSTHROUGH_ARGS+=("$1"); shift ;;
    esac
done

run_pipeline() {
    echo "=== Steam Brick and Mortar — Asset Pipeline ==="
    echo "Started: $(date)"
    echo "Log:     $LOG_FILE"
    echo

    if [[ "$SKIP_EXTRACT" == false ]]; then
        echo "--- Extract ---"
        bash "$SCRIPT_DIR/scripts/extract.sh" "${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}"
        echo
    else
        echo "--- Extract: skipped ---"
        echo
    fi

    if [[ "$SKIP_CONVERT" == false ]]; then
        echo "--- Convert ---"
        bash "$SCRIPT_DIR/scripts/convert.sh" "${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}"
        echo
    else
        echo "--- Convert: skipped ---"
        echo
    fi

    echo "=== Done: $(date) ==="
}

run_pipeline 2>&1 | tee "$LOG_FILE"
echo
echo "Log saved: $LOG_FILE"
