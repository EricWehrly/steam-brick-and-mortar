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
**Status**: 🟢 Fixed
**Reported**: 2026-07-14
**Description**: Desktop local-scan startup was "okay" on first launch but rendered mostly bare
shelves on a second launch (596/1539 placed, only 84 with real artwork, 943 with neither artwork
nor a label - label capacity is a fixed 512-slot cap, so anything beyond that renders as nothing).
**Root cause**: `LocalSteamDataWriter.buildAppDetailsEntry()` always wrote a hardcoded
`NO_LOCAL_ARTWORK` artwork field (local scan structurally cannot discover a real CDN artwork
hash), and `writeLocalAppMetadata()` ran this write unconditionally on every local-scan load via
`AppDetailsCache.setMany()`, which is a full replace, not a merge. `BakedCacheLoader.seedIfNeeded()`
(seeds the cache from a release-baked bundle with real artwork) is fire-and-forget and races
`LocalSteamDataWriter`'s own write on the very first launch - if the seed happens to win that
race, the first launch looks fine. `seedIfNeeded()` skips entirely once IndexedDB has any entries
at all (`stats.count > 0`), which is true starting on the *second* launch - so from then on, only
`writeLocalAppMetadata()`'s unconditional overwrite touches those appids, deterministically
stomping any previously-good artwork (seeded or network-fetched) back to `NO_LOCAL_ARTWORK` on
every subsequent load. Since the appid is then no longer "missing" from the cache, it's also never
eligible for `LocalSteamLibraryLoader`'s network gap-fill again - a permanent regression per
appid, not a transient one.
**Fix**: `writeLocalAppMetadata()` now reads existing cache entries for the candidate appids
first and passes each one's existing `artwork` through to `buildAppDetailsEntry()`, which prefers
it over `NO_LOCAL_ARTWORK`. Local-scan-authoritative fields (tags, genres, categories,
developers, publishers, user_collections) still refresh normally on every load - only the
artwork field, which local-scan can never legitimately improve, is preserved.
**Tests**: `client/test/unit/steam/LocalSteamDataWriter.test.ts` - existing-artwork preservation
in `buildAppDetailsEntry`, and an end-to-end `writeLocalAppMetadata()` test seeding a real cache
entry then proving a repeat write doesn't wipe it.
**Files**: `client/src/steam/LocalSteamDataWriter.ts`, `client/src/steam/cache/BakedCacheLoader.ts`
(race partner, not modified), `client/src/steam/LocalSteamLibraryLoader.ts` (why a stomped entry
never recovers)

**Follow-up (same day)**: the fix above only helps if the seed has *already landed* by the time
local-scan reads-then-writes - it was still a race, just now non-destructive if the write went
first. A retest with a real library still showed the same symptom (1178 CORS-blocked artwork
fetches, ~785 label-capacity failures across 48k log lines). Traced further: `SteamApiClient`
(and its fire-and-forget baked-cache seed) is constructed synchronously during app bootstrap,
well before `GameEventTypes.Start` - but local-scan's write is *also* gated on
`GameEventTypes.Start`, and the seed's own work (fetch + decompress + parse + potentially
thousands of IndexedDB writes) has no guarantee of finishing before local-scan's own Rust-side
reads do. Fixed by adding `SteamApiClient.waitForAppDetailsCacheSeed()` and awaiting it inside
`writeLocalAppMetadata()` right before the cache read/write step (not the whole function - the
local Rust reads proceed without waiting, only the AppDetailsCache touch is gated). This makes
the ordering deterministic instead of lucky, so the artwork-preservation fix above now reliably
sees the seed's real data instead of racing it. Also settles why this was desktop-only: web never
calls `LocalSteamDataWriter` at all (`isTauri()` no-ops it), so web has no code path that ever
overwrites `AppDetailsCache.artwork` with a placeholder in the first place - it was never a
web-vs-desktop CORS difference, just a write path that only exists on desktop.
**Tests**: new `LocalSteamDataWriter.test.ts` case proving the write doesn't settle until the
seed-ready promise resolves.
**Files**: `client/src/steam/SteamApiClient.ts` (new `waitForAppDetailsCacheSeed()`),
`client/src/steam/LocalSteamDataWriter.ts`
**Superseded 2026-07-15**: `waitForAppDetailsCacheSeed()` and the readiness-event plumbing it
required are gone - replaced by `AppDetailsCache.mergeMany()`, which merges per-field instead of
overwriting, so neither writer needs to wait on the other at all. The race this follow-up made
merely-safe is now structurally impossible rather than ordered-around. See the load-ordering
plan's 2026-07-15 addendum.
**Still open**: the CORS-blocked CDN fetch itself (`cors-blocked-local-scan-artwork`) is a
separate, structural problem - the browser can't reliably `fetch()` Steam's CDN cross-origin
regardless of whether the URL is guessed or real. Neither fix above touches that; it needs Round 3
(Tauri Rust HTTP client) or an accepted-placeholder interim fix. See
`docs/plans/desktop-offline-first-plan.md`.
**Not yet done**: manual verification against a real relaunch on the actual desktop app.

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
