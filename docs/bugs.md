# Bug Tracker

Active bugs and issues that need investigation or fixing.

## High Priority

### Unnamed meshes inflating draw calls — PropRenderer atmospheric props
**Status**: 🔴 Open  
**Reported**: 2026-04-14  
**Description**: `window.sceneManager.drawCallReport()` shows many entries of `{ name: "(unnamed)", type: "Mesh", visible: true, triangles: 2, material: "MeshStandardMaterial" }`. These are individual non-instanced meshes produced by `PropRenderer.ts` for atmospheric store props (wire rack wires/posts, floor mat lines, category divider posts, floor marker lines, entrance mat center/left/right lines). The parent groups are named but the child meshes are not, making them hard to identify or audit.  
**Impact**: Each unnamed mesh is a separate draw call. With 12+ ceiling fixtures replaced by `InstancedMesh` but wire racks and floor props still individual meshes, these are a significant portion of the draw call budget. They also make `drawCallReport()` output unreadable.  
**Fix**: Two parts:  
1. Add `.name` to every `Mesh` created in `PropRenderer.ts` (e.g. `wire-rack-post`, `wire-rack-horizontal`, `floor-mat-center-line`, etc.) — cheap, no behavior change.  
2. Evaluate whether the wire rack and floor props should be instanced or batched given how many of them there are.  
**Files**: `client/src/scene/PropRenderer.ts`

---

### Draw call regression — signs inflating DC count
**Status**: 🟡 Partially resolved  
**Reported**: 2026-04-14  
**Description**: Draw calls were ~17 at initial instancing implementation. Jumped to 50–70 because each shelf had 2 individual canvas signs attached (end-cap labels), and sign rendering was 1 draw call per sign instance.  
**Resolution so far**: Per-shelf end-cap signs disabled in `SceneSignManager` (TD: `shelf-end-cap-signs`). DC returned toward baseline.  
**Remaining**: Sign draw calls should be revisited once layout work matures — the path to 1 DC per sign type is instanced/atlased text rendering. Tracked in `docs/tech-debt.md` under `shelf-end-cap-signs`.  
**Also needed**: Automated test asserting `renderer.info.render.calls <= 25` in idle state (no detail panel open). See `docs/agent-context/performance-metrics.md`.

---

### Frame-time spike after opening/closing game detail panel (persistent, not one-shot)
**Status**: 🔴 Open
**Reported**: 2026-04-14
**Description**: After clicking a game box to open the detail panel (and even after closing it), the perf widget shows sustained frame-time increases - sometimes 70-80ms. `RenderLoopDiagnostics` does not catch this because it measures within render-loop callbacks only.
**Suspected cause**: The detail panel eagerly fetches `library_600x900.jpg` (large portrait JPEG) via an `<img>` tag. JPEG decode on the main thread can take 40-80ms and fires as a browser long-task in the frames following the fetch - including after the panel is closed if the image response arrives late. The `NS_BINDING_ABORTED` for this URL is visible in the console logs, suggesting the panel closes before decode completes, then decode fires in a subsequent frame.
**Mitigation applied**: `loading="lazy"` added to both `<img>` tags in `detail-panel.html`. This hints to the browser not to decode until visible, but doesn't fully prevent background decode.
**To confirm**: With `?diagnostics=1` and the `PerformanceObserver` long-task wiring now in place, open the detail panel and watch for `⚠️ Long task between frames` warnings. The attribution and timing will confirm or rule out image decode.
**Proper fix**: Don't put the library portrait in the panel at all (it's not in the local artwork cache and requires a CORS-blocked external fetch), or move artwork loading to a separate deferred step that doesn't block the main thread.

---

## Low Priority

### Unexpected cache clearing
**Status**: 🔴 Open
**Reported**: 2026-01-16
**Description**: Something seems to be clearing the Steam cache unexpectedly. Not sure what's triggering it yet.
**Steps to Reproduce**: Unknown - happens intermittently
**Impact**: User must reload profiles more often than expected
**Next Steps**:
- Add logging to cache clear operations
- Monitor localStorage operations
- Check for unintended clear() calls
- **Note**: A deliberate caching strategy review is planned before Act 3 / public release. This bug and the broader cache reliability picture should be evaluated together at that point, ideally with instrumentation and real usage data beyond the dev server.

---

## Template for New Bugs

```markdown
### [Bug Title]
**Status**: 🔴 Open / 🟡 In Progress / 🟢 Fixed
**Reported**: YYYY-MM-DD
**Description**: What's wrong?
**Steps to Reproduce**:
1. Step one
2. Step two
3. Observe issue

**Expected**: What should happen
**Actual**: What actually happens
**Impact**: How bad is this?
**Next Steps**: What needs to happen to fix it
```

---

## Resolved Bugs

### Local-scan write silently wipes artwork on every relaunch, not just first launch
**Status**: 🟢 Fixed 2026-07-15 — `writeLocalAppMetadata()` preserved a hardcoded placeholder over real artwork on every load; fixed by reading existing entries first, then closed structurally by `AppDetailsCache.mergeMany()`'s per-field merge. See `client/src/steam/LocalSteamDataWriter.ts`.

### Uncached profile first load creates "cursed room"
**Status**: 🟢 Fixed ~2026-04 — event timing and first-load state management corrected during batch/event pipeline refactoring (exact commit not tracked).

### Desktop startup double-render stripping local-scan artwork on relaunch
**Status**: 🟢 Fixed 2026-07-22 — background "Fork A" re-fetch removed entirely; `SteamIntegration.handleGameStart()` is now a single-source startup waterfall. See `docs/tech-debt.md#id-lod-tier-reset-race-condition`.
