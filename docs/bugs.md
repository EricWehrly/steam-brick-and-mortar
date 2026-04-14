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
**Status**: 🔴 Open
**Reported**: 2026-04-14
**Description**: Draw calls were ~17 at initial instancing implementation. Now 50-70 in normal use and the count persists elevated after opening the game detail panel. Visible in the perf widget (top-right "DC" counter).
**Suspected cause**: `.detail-content` has `overflow-y: auto` inside a `position: fixed` panel, which creates a new compositor layer. Firefox composites this layer every frame alongside Three.js's render, inflating the reported draw call count for the duration the panel is open - or permanently if something in the layout isn't being cleaned up on close. CSS note in `binder.css`: `/* TODO: Convert binder to a proper modal (backdrop, focus trap, body scroll-lock) */`
**Also needed**: Automated test asserting `renderer.info.render.calls <= 25` in idle state (no detail panel open). This is the DC regression gate — without it, any future change that inflates draw calls is invisible until noticed manually. The test should run in the Playwright scene-health collector (one load, grab DC count after `AllBatchesComplete`). See `docs/agent-context/performance-metrics.md`.
**Steps to Reproduce**: Open `?diagnostics=1`, note DC in perf widget, click any game box, observe DC jump, close panel, observe whether DC returns to baseline.
**Impact**: Elevated GPU submission cost every frame; masks future regressions.

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

### Uncached profile first load creates "cursed room"
**Status**: 🟢 Fixed
**Reported**: 2026-01-16
**Resolved**: ~2026-04 (exact commit not tracked - confirmed resolved during Act 1 work)
**Description**: When loading an uncached profile for the first time, the room appeared but games didn't load correctly. A refresh fixed it.
**Resolution**: Event timing and first-load state management corrected during batch/event pipeline refactoring.

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

*(Move fixed bugs here with resolution date and fix description)*
