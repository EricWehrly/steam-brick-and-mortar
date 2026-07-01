#!/usr/bin/env bash
# Convert extracted Source 1 models to GLB via Blender (Docker).
# Replaces the old run_convert.sh with --models support.
#
# Usage (from project root or here):
#   bash desktop/source-extract/scripts/convert.sh [options]
#
# Options:
#   --game portal2              Game manifest to use (default: portal2)
#   --models sentry,wheatley    Comma-delimited manifest names to target (bypasses status check)
#   --manifest-file portal2-manifest.json   Override manifest filename (relative to scripts/)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$PROJECT_ROOT"

GAME="portal2"
MANIFEST_FILE=""
PASSTHROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --game)
            GAME="$2"; shift 2 ;;
        --manifest-file)
            MANIFEST_FILE="$2"; shift 2 ;;
        --force-extract)
            shift ;;  # extract-only flag, not forwarded to Blender
        *)
            PASSTHROUGH_ARGS+=("$1"); shift ;;
    esac
done

if [[ -z "$MANIFEST_FILE" ]]; then
    MANIFEST_FILE="${GAME}-manifest.json"
fi

MANIFEST_DOCKER="/app/desktop/source-extract/scripts/${MANIFEST_FILE}"
SCRIPT_DOCKER="/app/desktop/source-extract/scripts/convert_mdl.py"

MSYS_NO_PATHCONV=1 docker compose run --rm blender \
    blender --background \
    --python "$SCRIPT_DOCKER" \
    -- \
    --manifest "$MANIFEST_DOCKER" \
    "${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}"
