#!/usr/bin/env bash
# Run the MDL -> GLB conversion inside the Blender Docker service.
# Run from the project root: bash desktop/scripts/run_convert.sh
set -euo pipefail

docker compose run --rm blender \
  blender --background --python /app/desktop/scripts/convert_mdl.py
