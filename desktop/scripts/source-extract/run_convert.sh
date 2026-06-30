#!/usr/bin/env bash
# Convert extracted Source 1 models to GLB inside the Blender Docker service.
# Run from the project root: bash desktop/scripts/source-extract/run_convert.sh [args]
#
# Args are forwarded to convert_mdl.py after '--':
#   bash desktop/scripts/source-extract/run_convert.sh --manifest /app/desktop/scripts/source-extract/portal2-manifest.json
#   bash desktop/scripts/source-extract/run_convert.sh --mdl models/props/turret_01.mdl
#   bash desktop/scripts/source-extract/run_convert.sh          # default: companion cube
set -euo pipefail

ARGS=("$@")

if [ ${#ARGS[@]} -gt 0 ]; then
    docker compose run --rm blender \
        blender --background --python /app/desktop/scripts/source-extract/convert_mdl.py -- "${ARGS[@]}"
else
    docker compose run --rm blender \
        blender --background --python /app/desktop/scripts/source-extract/convert_mdl.py
fi
