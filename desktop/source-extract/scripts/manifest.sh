#!/usr/bin/env bash
# Show the manifest status table for a game.
#
# Usage: bash manifest.sh [game]
#   game — manifest game key (default: portal2)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$PROJECT_ROOT"

GAME="${1:-portal2}"
python desktop/source-extract/scripts/vpk.py manifest "$GAME"
