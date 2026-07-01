# Feature: User Prop Folder ("Bring Your Own Models")

**Act**: 4 / best-effort late Act 2
**Status**: Research complete (see [Scene Clutter & Props](scene-clutter-and-props.md)); first attempt reverted, cross-browser approach pending
**Priority**: Low — nice-to-have personal mode

## Goal

Let the user point the app at a folder of their own glTF/GLB files and have those models
appear as set dressing in the store. No curation needed on our side — the user supplies the
models; IP is on them.

The canonical use case is placing Tier C extracted props (companion cube, headcrab, etc.) back
into the scene without committing game assets to the repo or the server.

## First attempt — reverted (Chrome-only, untested)

Commit [`5bc935e0`](#) implemented folder selection via `showDirectoryPicker()` (File System
Access API) with the `FileSystemDirectoryHandle` persisted in IndexedDB for silent
re-acquisition via `requestPermission()` on reload. This is Chromium-only — Firefox does not
implement the File System Access API at all. Reverted because we need Firefox parity; do not
resurrect this approach without re-adding cross-browser support alongside it. Reference the
commit if the Chrome-specific persistence behavior is wanted as an *enhancement layer* on top
of the base implementation below.

## How it works (target — cross-browser)

**Base tier (Chrome + Firefox + Safari):**
1. User clicks "Add models folder" — triggers a hidden `<input type="file" webkitdirectory multiple>`
2. Browser returns a `FileList` of every file in the selected folder (no persistent handle)
3. We filter to `.glb` / `.gltf`, read each as an `ArrayBuffer`, store the bytes in IndexedDB
4. Create `Blob` object URLs from the stored bytes, load via `AssetLoader`
5. On subsequent loads, restore directly from IndexedDB — no re-pick needed

**Enhancement tier (Chrome/Edge only, detected via `'showDirectoryPicker' in window`):**
- Use `showDirectoryPicker()` instead of the hidden input for a nicer native folder dialog
- Store the `FileSystemDirectoryHandle` itself rather than file contents (less storage,
  re-validated via `requestPermission()` on reload)
- Falls back to the base tier automatically when unavailable

## Constraints

- **Storage cost**: base tier stores full file bytes in IndexedDB (~hundreds of KB–few MB per
  model). Acceptable for a handful of props; revisit if the folder grows large.
- **No live folder watching**: base tier has no handle, so new files added to the folder after
  initial selection require a manual re-pick. Enhancement tier doesn't solve this either —
  full live sync needs the desktop app. See [Native Desktop App](desktop-app.md).
- **Personal mode only**: the user is responsible for what's in the folder; we never bundle or
  host the models. Document this in the UI.
- No placement intelligence yet — initial version drops models at hardcoded anchor positions;
  a real placement system is tracked under [Scene Clutter & Props](scene-clutter-and-props.md).
- **No animation for Source 1 character models**: SourceIO does not implement Source 1
  animation import (its own `wiki/MDL_IMPORT.md` states "Load animations: Unimplemented!",
  and the vendored copy's `TODO.md` still lists "Source1 animations support" unchecked as of
  the latest release, 5.5.3). This is a feature gap in that upstream dependency, not something
  we're building ourselves — models display in a static rest pose. Manual one-time posing
  (hand-setting a few key bone rotations) is a cheap alternative worth trying since we do have
  real bone hierarchies; true ragdoll physics or generic bipedal animation retargeting are not,
  since Portal 2's co-op bots (Atlas/P-Body) use custom mechanical piston-leg rigs, not a
  standard humanoid skeleton.

## Acceptance criteria

- [ ] "Add models folder" button in settings panel
- [ ] Works in both Chrome and Firefox via `<input webkitdirectory>` base tier
- [ ] File contents persisted in IndexedDB; restored without re-picking on reload
- [ ] Chrome/Edge: `showDirectoryPicker()` enhancement layered on top when available
- [ ] All `.glb`/`.gltf` files in the folder load into the scene
- [ ] Graceful skip on unreadable or unsupported files
- [ ] Clear "personal mode" label in UI
- [ ] Works end-to-end with a companion cube extracted by `desktop/convert_mdl.py`

## Related

- [Scene Clutter & Props](scene-clutter-and-props.md) — parent research; placement system
- [Native Desktop App](desktop-app.md) — Firefox parity + zero-friction Steam path discovery
- [Local File Investigation](local-file-investigation.md) — shares Program Files blocklist risk
- `desktop/convert_mdl.py` — the extraction pipeline that produces the GLBs this feature loads

---
*— A1 / O2*
