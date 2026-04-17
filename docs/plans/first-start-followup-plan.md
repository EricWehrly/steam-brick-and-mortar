# Plan: First-Start Follow-Up — Game Rendering Pipeline Fixes

**Status**: Planned (Intermission)  
**Priority**: P1–P4 as listed  
**Context**: Issues surfaced during first-start work (PR #69). Anonymous → logged-in user transition now works, but the rendering pipeline has four issues that need resolution before the store looks correct at scale.

---

## Issue 1: Double-Allocation — Label Boxes Created Alongside Artwork (P1)

### Problem
When a game box is spawned, `GpuGameBoxRenderer.createGameBoxFromUrl()` immediately fires an async artwork fetch. If the fetch fails (CORS, timeout, 404), a label fallback is created. But `createGameBoxAuto()` also creates a label *eagerly* when `EnableLabels` is true — resulting in both a label instance AND an artwork instance being allocated for the same game.

Even in the success case, `createGameBoxFromUrl()` allocates an atlas slot, then artwork loads asynchronously. If artwork eventually succeeds, the label is never cleaned up. At 835 games, this means 835 label texture slots allocated (~54MB) plus 835 artwork atlas slots.

### Fix
**Don't materialize game boxes until artwork is resolved.** The game should not appear in the scene at all until its texture is ready. This is the "artwork-first" rendering model:

1. Remove the eager label path from `createGameBoxAuto()` — labels are not part of the desired look
2. In `createGameBoxFromUrl()`, only create the instance *after* the artwork promise resolves successfully
3. Games with failed artwork simply don't appear (or appear in a later "unresolved" pass if we want)
4. `InstancedLabelRenderer` becomes unused for game boxes (still available for shelf signs, debug, etc.)

### Files
- `client/src/scene/game-box/GpuGameBoxRenderer.ts` — remove eager label creation, defer instance creation to artwork success
- `client/src/core/AppSettings.ts` — `EnableLabels` setting may become irrelevant for game boxes

### Size: Small (1–2 files, behavioral change)

---

## Issue 2: Games Load All-at-Once Instead of Progressively (P2)

### Problem
After the network batches complete (~25s for 835 games), all game data is emitted to the rendering pipeline in rapid succession. The `BatchCoordinator` processes 47 batches back-to-back in ~2.5s, creating all shelves and spawning all game boxes simultaneously. This causes:

- A single large frame hitch when everything materializes
- No visual feedback during the 25s network fetch
- 835 concurrent artwork fetch promises firing at once

### Fix
**Emit rendering batches as network batches complete, not after all network batches finish.**

Currently `SteamApiClient.loadGamesProgressively()` fetches all network batches, collects results, then emits `GamesBatchReady` events in a burst at the end. Instead:

1. After each network batch completes (100 games), emit a `GamesBatchReady` immediately with those games
2. `BatchCoordinator` processes each batch as it arrives — shelves appear progressively
3. `AllBatchesComplete` fires after the last network batch, triggering the final sort

This requires changes to the batch emission pipeline in `SteamApiClient`, not the rendering side.

### Files
- `client/src/steam/SteamApiClient.ts` — emit `GamesBatchReady` per network batch instead of buffering
- `client/src/steam/batch/BatchAppDetailsClient.ts` — may need callback hooks for per-batch emission

### Size: Medium (pipeline restructure, but rendering side is already batch-ready)

---

## Issue 3: No Successful Re-Sort on User Change (P3)

### Problem
When a user logs in (replacing the anonymous store), `GamesSort` fires with the new sort order, but game boxes stay in their original positions. The existing `resort-game-placement-plan.md` and `texture-placement-split-plan.md` document this thoroughly.

Root cause: texture loading and instance placement are coupled in `GpuGameBoxRenderer`. `createGameBox()` allocates an atlas slot AND sets the world position in one operation. There is no `placeInstance()` to reposition an already-loaded game.

### Fix
As documented in `docs/plans/resort-game-placement-plan.md`:

1. Split `GpuGameBoxRenderer` into **load phase** (texture fetch, atlas slot) and **place phase** (world position assignment)
2. `GameBoxSpawner` handles `BatchReadyForPlacement` for prewarming only; `GamesSort` drives placement
3. `clearPlacements()` + `placeInstance()` API on `GpuGameBoxRenderer`
4. Re-sort becomes: zero all instance transforms → iterate sorted games → assign new positions from cached shelf layout

This is a major refactor touching the core rendering pipeline. Separate branch recommended.

### Files
- `client/src/scene/game-box/GpuGameBoxRenderer.ts` — add `prewarmGame()`, `placeInstance()`, `clearPlacements()`
- `client/src/scene/spawning/GameBoxSpawner.ts` — split batch handling from placement
- `client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts` — split `setArtworkInstanceFromUrl` into prefetch + place
- `client/src/scene/shelves/ShelfLayoutCoordinator.ts` — expose shelf positions for re-layout queries

### Size: Large (new branch, multiple files, core pipeline change)
### Existing Docs: `docs/plans/resort-game-placement-plan.md`, `docs/plans/texture-placement-split-plan.md`

---

## Issue 4: Label Slot Exhaustion (P4)

### Problem
`InstancedLabelRenderer` is allocated with a fixed slot count derived from `totalBatches × gamesPerBatch`. When artwork fails for many games (CORS failures on localhost), label fallbacks exhaust the pool:

```
📦 [LabelTextureArrayManager] ⚠️ ALLOCATED 54MB (est.): texture array 128×128×861
No label slots remaining (40)
```

Two separate allocations happen: an initial 861-slot array for the main renderer, then a 40-slot array for a secondary instance. The secondary one fills instantly.

### Fix
If Issue 1 is resolved first (artwork-first, no eager labels), this issue largely goes away — labels won't be created for game boxes at all. The label renderer would only serve shelf signs and debug overlays, which need far fewer slots.

If labels are still needed as fallback:
1. Size the label pool based on the number of games that *actually lack artwork*, not the total game count
2. Or use a dynamic/growable label texture array (resize when near capacity)

### Files
- `client/src/scene/game-box/instancing/InstancedLabelRenderer.ts` — pool sizing logic
- `client/src/scene/game-box/instancing/LabelTextureArrayManager.ts` — growable array or demand-based allocation

### Size: Small if Issue 1 is fixed first (becomes a non-issue). Medium standalone.

---

## Ordering Recommendation

| # | Issue | Depends On | Branch |
|---|-------|-----------|--------|
| 1 | Double-allocation (artwork-first) | — | Intermission (inline or small branch) |
| 2 | Progressive batch loading | — | Intermission (small branch) |
| 4 | Label slot exhaustion | Resolved by #1 | Intermission (inline) |
| 3 | Re-sort on user change | #1 (load/place split) | Own branch (major) |

Issues 1 and 2 are independent and can be parallelized. Issue 4 is effectively resolved by Issue 1. Issue 3 is the big one and builds on the load/place split that Issue 1 begins.
