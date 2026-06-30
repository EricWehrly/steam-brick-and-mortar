# Source 1 Asset Extraction Pipeline

Extracts and converts Source Engine (Source 1) models to GLB files for use in the scene.

## Prerequisites

- **vpkeditcli** — placed at `desktop/tools/vpkedit/vpkeditcli.exe` (unzipped from included vpkedit.zip).  
  Tip: `python vpk.py list portal2` will tell you if it's missing and where to put it.
- **Docker** — for the dockerized Blender conversion step.
- **The game installed** — VPK paths are auto-detected from `games.json` for common Steam locations.

## Workflow

### 1. (One-time) Build the file list cache

```bash
python desktop/scripts/source-extract/vpk.py list portal2
```

Dumps all 29,000+ paths from the VPK into `desktop/extracted/.vpk-list-portal2.txt`. Takes ~30s. Cached indefinitely — use `--force` to rebuild.

### 2. (One-time) Extract model and material files

```bash
python desktop/scripts/source-extract/vpk.py extract portal2
```

Reads `portal2-manifest.json` and extracts each asset's `.mdl`, `.vvd`, `.vtx`, `.dx90.vtx` files plus its `materials_dirs` into `desktop/extracted/`. Skips assets with status `converted` or `excluded`.

### 3. Convert to GLB

From the **project root** (not inside client/):

```bash
# Batch — converts all 'pending'/'extracted' assets in the manifest:
MSYS_NO_PATHCONV=1 bash desktop/scripts/source-extract/run_convert.sh \
    --manifest /app/desktop/scripts/source-extract/portal2-manifest.json

# Single model (useful for testing a new path):
MSYS_NO_PATHCONV=1 bash desktop/scripts/source-extract/run_convert.sh \
    --mdl models/player/ballbot/ballbot.mdl
```

Output lands in `desktop/output/`.

### 4. Load in-scene

Copy GLBs to wherever ScenePropsPanel is configured to read from. The app loads them via File System Access API.

## Searching for models

```bash
# Find MDL files matching a term:
python desktop/scripts/source-extract/vpk.py search portal2 turret --ext .mdl

# Find materials for a model:
python desktop/scripts/source-extract/vpk.py search portal2 ballbot --ext .vtf
```

## Files

| File | Purpose |
|------|---------|
| `vpk.py` | CLI: `list`, `search`, `extract` subcommands |
| `games.json` | VPK locations per game / platform |
| `portal2-manifest.json` | Asset list for Portal 2: model paths, material dirs, output names, status |
| `convert_mdl.py` | Blender Python script: MDL → GLB via SourceIO |
| `run_convert.sh` | Docker wrapper around `convert_mdl.py` |

## Asset statuses (manifest)

| Status | Meaning |
|--------|---------|
| `pending` | Not yet extracted or converted |
| `extracted` | Files in `desktop/extracted/`, ready to convert |
| `converted` | GLB produced; skip on re-run |
| `excluded` | Not wanted in the scene; skip permanently |
| `path_unknown` | VPK path not found; needs research |

## Extending to a new game

1. Add VPK paths to `games.json`
2. Create `<game>-manifest.json` (copy `portal2-manifest.json` as a template)
3. Use `vpk.py search <game> <term>` to find model paths
4. Update `materials_dirs` — model VMTs reference textures relative to the game root

## Output / extracted directories

Both `desktop/extracted/` and `desktop/output/` are gitignored — they're large and machine-local. The manifest and scripts are committed; the binary assets are not.
