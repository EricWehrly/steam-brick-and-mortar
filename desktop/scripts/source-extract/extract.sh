#!/usr/bin/env bash
# Extract model and material files from a game's VPK archive.
# Reads the manifest and skips already-extracted assets unless --force-extract is given.
#
# Usage (from project root or here):
#   bash desktop/scripts/source-extract/extract.sh [options]
#
# Options:
#   --game portal2              Game to extract from (default: portal2)
#   --models sentry,wheatley    Comma-delimited manifest names to target
#   --manifest path/to/file     Override manifest path
#   --force-extract             Re-extract even if files already exist
#   --dry-run                   Show what would be extracted without doing it

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$PROJECT_ROOT"

GAME="portal2"
PASSTHROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --game)
            GAME="$2"; shift 2 ;;
        *)
            PASSTHROUGH_ARGS+=("$1"); shift ;;
    esac
done

python desktop/scripts/source-extract/vpk.py extract "$GAME" "${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}"
