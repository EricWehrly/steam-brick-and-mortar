# Source 1 Asset Extraction Pipeline

Extracts and converts Source Engine (Source 1) models to GLB files for use in the scene.

## Prerequisites

- **Docker** — for the Blender conversion step.
- **The game installed** — VPK paths are auto-detected from `games.json` for common Steam locations. `bash locate.sh <game>` confirms the path resolves.

Nothing to unzip by hand: `vpkedit.zip` (→ `desktop/source-extract/tools/vpkedit/`) and `SourceIO.zip` (→
`blender/addons/SourceIO/`) are both committed to the repo and auto-extract on first use —
`vpk.py`'s `require_cli()` and `convert_mdl.py`'s `ensure_sourceio()` each check whether the
extracted directory exists and unzip if not. This is intentional: the eventual goal is a desktop
app that shells out to `run.sh` and treats it as fire-and-forget — either the pipeline succeeds
and the scene gets new props, or it fails with a clear message in the log and the exit code, with
no manual setup step in between to forget.

## Quick start

Run the full pipeline from the project root:

```bash
# All pending assets:
bash desktop/source-extract/run.sh

# Specific models only (bypasses status, re-converts even if already done):
bash desktop/source-extract/run.sh --models sentry_turret,wheatley

# Re-convert without re-extracting (files already in desktop/source-extract/extracted/):
bash desktop/source-extract/run.sh --skip-extract --models companion_cube

# Extract only, skip Blender:
bash desktop/source-extract/run.sh --skip-convert

# Dry run (shows what extract would do, no files written):
bash desktop/source-extract/run.sh --dry-run
```

Output is logged to `desktop/source-extract/logs/pipeline-TIMESTAMP.log`.

## Component scripts

| Script | Purpose |
|--------|---------|
| `run.sh` | **Entry point** — runs extract then convert, writes log file |
| `extract.sh` | Extract model + material files from VPK into `desktop/source-extract/extracted/` |
| `convert.sh` | Convert extracted MDLs to GLB via Docker/Blender |
| `locate.sh` | Print the detected VPK path for a game (diagnostic) |
| `manifest.sh` | Show manifest asset status table |

All scripts accept `--game portal2` (default) and `--models name1,name2`.

## Python utilities

| Script | Purpose |
|--------|---------|
| `vpk.py` | CLI: `list`, `search`, `extract`, `locate`, `manifest` subcommands |
| `convert_mdl.py` | Blender Python script: MDL → GLB via SourceIO |
| `games.json` | VPK locations per game and platform |
| `portal2-manifest.json` | Asset list: model paths, material dirs, output names, status |

## Searching for models

```bash
# Find MDL files matching a term:
python desktop/source-extract/scripts/vpk.py search portal2 turret --ext .mdl

# Find VTF textures for a model:
python desktop/source-extract/scripts/vpk.py search portal2 ballbot --ext .vtf

# Show all assets and their status:
bash desktop/source-extract/scripts/manifest.sh
```

## Asset statuses (manifest)

| Status | Meaning |
|--------|---------|
| `pending` | Not yet extracted or converted |
| `extracted` | Files in `desktop/source-extract/extracted/`, ready to convert |
| `converted` | GLB produced in `desktop/source-extract/output/` |
| `excluded` | Not wanted in the scene; skipped permanently |
| `path_unknown` | VPK path not found; needs research |

Targeting with `--models` bypasses status — useful for re-converting an already-`converted` asset after a Blender script change.

## Smart extract skip

When running without `--force-extract`, the extract step automatically skips assets whose MDL + companion files already exist in `desktop/source-extract/extracted/`. This avoids the ~30s VPK scan on repeated runs. Use `--force-extract` to override.

## Discovering games on a new machine

If you're on a machine with different Source games installed than the primary dev box (e.g. a
laptop with Team Fortress 2 but not Portal 2), `discover_games.py` automates the manual "is this
a Source 1 game with usable models" check across every installed game at once, instead of doing
it one game at a time by hand:

```bash
python desktop/source-extract/scripts/discover_games.py
```

Scans every Steam library on the machine (via `libraryfolders.vdf`, following the same
`vpk_windows`/`SteamLibrary` conventions as `games.json`), finds every installed game with a
`*_dir.vpk` that actually contains `models/*.mdl` paths, and writes a deterministic JSON report
to `desktop/source-extract/logs/discover-report.json` (gitignored — machine-specific) listing
every model path per game. Options: `--out <path>` to write elsewhere, `--steam-root <path>` for
a non-default Steam install location.

Carry that JSON report back to the primary dev machine (copy the file, paste its contents,
whatever's convenient) — it's enough to pick candidate models and seed a `games.json` entry plus
a new `<game>-manifest.json` (see "Adding a new game" below) without the primary machine ever
needing that game installed. This tool is deliberately just the discovery step — it doesn't
write `games.json` or a manifest for you, since picking *which* models are worth converting is a
judgment call, not something to automate.

Windows-only, same as the rest of this pipeline (`vpkeditcli.exe` requires Windows).

## Adding a new game

This section is written to be followed cold — by a human or an LLM — on a fresh machine, without
re-deriving anything from scratch.

### 1. Find the VPK file

Source 1 games ship their models/materials inside one or more `.vpk` archives in the game's
install folder. **The filename is not the same across games** — this is the #1 thing that trips
people up. Known examples:

| Game | VPK path (relative to Steam library) |
|------|---------------------------------------|
| Portal 2 | `steamapps/common/Portal 2/portal2/pak01_dir.vpk` |
| Team Fortress 2 | `steamapps/common/Team Fortress 2/tf/tf2_misc_dir.vpk` |

If adding a game not listed above: open the game's install folder and look for `*_dir.vpk`
files (there may be several — sound, misc, textures, etc., split apart). Pick the one that
actually contains `models/` and `materials/` paths. You can check any candidate directly:

```bash
python -c "
import sys; sys.path.insert(0, 'desktop/source-extract/scripts')
from vpk import vpk_file_tree, parse_vpk_tree
paths = parse_vpk_tree(vpk_file_tree('C:/path/to/candidate_dir.vpk'))
print(sum(1 for p in paths if p.startswith('models/')), 'model files')
"
```

A VPK with 0 model files is the wrong one — keep looking at the other `*_dir.vpk` files in that
folder.

### 2. Register the game in `games.json`

Add an entry keyed by a short game id (e.g. `tf2`) with candidate absolute paths per platform —
list every Steam library location you might plausibly have (C:, D:, SteamLibrary folders, etc.),
since `get_vpk_path()` just walks the list and returns the first one that exists on disk:

```json
"tf2": {
  "name": "Team Fortress 2",
  "vpk_windows": [
    "C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf/tf2_misc_dir.vpk",
    "D:/SteamLibrary/steamapps/common/Team Fortress 2/tf/tf2_misc_dir.vpk"
  ],
  "vpk_linux": ["~/.steam/steam/steamapps/common/Team Fortress 2/tf/tf2_misc_dir.vpk"],
  "vpk_macos": ["~/Library/Application Support/Steam/steamapps/common/Team Fortress 2/tf/tf2_misc_dir.vpk"]
}
```

Verify it resolves:

```bash
bash desktop/source-extract/scripts/locate.sh tf2
```

If this prints "VPK not found," the game isn't installed at any listed path, or the path/filename
is wrong — fix before continuing.

### 3. Build the file list cache and search for models

```bash
python desktop/source-extract/scripts/vpk.py list tf2
python desktop/source-extract/scripts/vpk.py search tf2 <term> --ext .mdl
```

### 4. Find the right `materials_dirs` — don't assume, verify

**Important gotcha** (hit this exact issue with Portal 2's co-op bots): the materials folder for
a model is *not always* a simple mirror of its `models/` path. E.g. `models/player/ballbot/ballbot.mdl`'s
actual textures live in `materials/models/player/coop_bots/`, not `materials/models/player/ballbot/`
(which doesn't exist at all in that VPK). Always confirm by searching for the actual `.vmt`/`.vtf`
files rather than guessing from the model path:

```bash
python desktop/source-extract/scripts/vpk.py search tf2 <model-keyword> --ext .vtf
python desktop/source-extract/scripts/vpk.py search tf2 <model-keyword> --ext .vmt
```

Use whatever directory the results actually live in.

### 5. Create the manifest

Copy `portal2-manifest.json` as a template → `tf2-manifest.json`. Each asset needs `name`, `mdl`
(verified path), `materials_dirs` (verified per step 4), `output` (filename), `status: "pending"`.

### 6. Run it

```bash
bash desktop/source-extract/run.sh --game tf2
```

Everything downstream (`extract.sh`, `convert.sh`) already takes `--game <id>` and resolves
`games.json` / `<id>-manifest.json` automatically — no script changes needed for a new game.

## Posing a character model

Source 1 character rigs (like Portal 2's Atlas/P-Body co-op bots) load into the scene in their
raw bind pose — SourceIO doesn't import Source 1 animation data (see
[`user-prop-folder.md`](../../../docs/features/user-prop-folder.md)), so a static, hand-tuned
bone pose is the practical alternative. This is a manual, iterative, visual process — there is no
way to compute the "right" rotation values without watching the model. Two rules that came out of
getting this wrong more than once:

- **Never guess a bend axis or sign.** Different models (even ones sharing an asset base, like
  Atlas/P-Body) commonly use different local axes and bone names for equivalent joints. Confirm
  every axis empirically per model, per bone.
- **Apply deltas additively, on top of the bone's rest pose** — don't zero out the other two axes.
  Rest pose carries real geometry (stance-width angle, foot-to-ankle angle, etc.) on axes you
  aren't posing; zeroing them discards it and produces a kinked limb, since child bones (e.g. the
  knee) were relying on the parent's original orientation.

### 1. Find the bone hierarchy

```bash
python desktop/source-extract/scripts/inspect_skeleton.py desktop/source-extract/output/<model>.glb
```

Dumps the full node/bone tree, flags multiple disconnected mesh pieces, and flags orphaned nodes
that either do or don't carry real skin weight (safe to ignore only if they don't).

### 2. Pose live in the browser console

With the model already placed in the scene (load it via the normal user-prop-folder flow), use
the console helpers defined at the bottom of `client/src/scene/props/UserPropPlacer.ts`:

```js
listPropBones('atlas')                        // print every bone name for a placed model
posePropBone('atlas', 'L_knee', 0, 0, 80)      // set a bone's LOCAL rotation in degrees (x, y, z)
resetPropPose('atlas')                         // zero all bone rotations on a model — WARNING:
                                                // this also zeroes bones you aren't testing,
                                                // discarding their rest pose (e.g. ankles/feet
                                                // can visibly break). Prefer reloading the page
                                                // over resetPropPose when testing a second bone.
```

`posePropBone` sets an absolute rotation, so it's good for quickly finding which single axis
moves a bone the way you want — test one axis in isolation (`x`, then `y`, then `z`) until one of
them produces the right motion. Test parent and child bones (e.g. hip and knee) together before
finalizing values, since a per-bone-in-isolation test can look right and still combine wrong once
both are posed at once.

### 3. Bake the confirmed values into model-poses.json

Once values look right in the browser, write them into
`client/src/scene/props/model-poses.json`, keyed by the model's filename (without extension).
Each entry is additive degrees per axis (only specify the axes you're bending — omitted axes
default to 0 delta, not an absolute zero):

```json
"my_new_model": {
  "legs": [{ "bone": "L_thigh", "z": -55 }],
  "arms": [{ "bone": "elbow_L", "z": 25 }]
}
```

No build step — `UserPropPlacer.ts` imports this file directly.

## Output / extracted directories

`desktop/source-extract/extracted/`, `desktop/source-extract/output/`, and `desktop/source-extract/logs/` are gitignored — large and machine-local. The manifest and scripts are committed; binary assets and logs are not.
