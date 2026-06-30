# desktop/

Offline asset-conversion pipeline: Source 1 game files → glTF/GLB → loaded in the browser store.

```
desktop/
├── scripts/
│   ├── convert_mdl.py  # Blender headless script: .mdl → .glb via SourceIO
│   └── run_convert.sh  # Docker wrapper for convert_mdl.py
├── tools/
│   └── vpkedit/        # VPK extraction (see README inside; binaries not committed)
├── extracted/          # Intermediary VPK extracts — gitignored, safe to delete
└── output/             # Converted .glb files — gitignored (game assets, personal mode only)
```

## Quick start

**Step 1 — Extract from VPK** (Windows host, requires vpkeditcli.exe in tools/vpkedit/):

```bat
vpkeditcli --extract "models/props/metal_box.mdl" -o desktop/extracted/models/props/metal_box.mdl <pak01_dir.vpk>
vpkeditcli --extract "models/props/metal_box.vvd" -o desktop/extracted/models/props/metal_box.vvd <pak01_dir.vpk>
vpkeditcli --extract "models/props/metal_box.vtx" -o desktop/extracted/models/props/metal_box.vtx <pak01_dir.vpk>
vpkeditcli --extract "models/props/metal_box.dx90.vtx" -o desktop/extracted/models/props/metal_box.dx90.vtx <pak01_dir.vpk>
vpkeditcli --extract "models/props/metal_box.phy" -o desktop/extracted/models/props/metal_box.phy <pak01_dir.vpk>
vpkeditcli --extract "materials/models/props/" desktop/extracted/ <pak01_dir.vpk>
```

**Step 2 — Convert to GLB** (requires Docker):

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm blender blender --background --python /app/desktop/scripts/convert_mdl.py
```

Output lands in `desktop/output/<name>.glb`. Copy to `client/public/test-props/` to serve in the browser.

## Blender addon (SourceIO — committed as zip)

SourceIO (MIT) is committed at `blender/addons/SourceIO.zip` (~7.8 MB). `convert_mdl.py`
extracts it automatically on first run — no manual step needed. The extracted
`blender/addons/SourceIO/` directory is gitignored.

To update SourceIO: replace `blender/addons/SourceIO.zip` with the new release zip from
https://github.com/REDxEYE/SourceIO/releases, delete the extracted directory so Docker
re-extracts on next run, then commit the new zip.

## Future / desktop app

The current flow is a manual offline pipeline. When the desktop app exists, it should:
- Watch a user-selected game folder for installed games
- Auto-detect Source 1 games via `libraryfolders.vdf` / `appmanifest_*.acf`
- Run this pipeline automatically and emit a signal per completed model
- See `docs/features/desktop-app.md` and `docs/features/user-prop-folder.md`

<!-- TODO: Act 3 cleanup — delete desktop/extracted/ once pipeline is stable and documented -->
