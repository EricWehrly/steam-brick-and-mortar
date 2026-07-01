#!/usr/bin/env bash
# Print the detected VPK path for a game.
# Useful for diagnosing install detection issues.
#
# Usage: bash locate.sh [game]
#   game — manifest game key (default: portal2)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$PROJECT_ROOT"

GAME="${1:-portal2}"
python desktop/scripts/source-extract/vpk.py locate "$GAME"
