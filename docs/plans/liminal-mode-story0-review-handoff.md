# Liminal Mode Story 0 — Review Handoff

Written for a second-opinion review pass, not as a task list. Summarizes what's broken, what's fixed and verified, and what's still open after a desktop walkthrough surfaced three visual problems on top of the corridor-geometry pivot already documented in [`liminal-mode-plan.md`](liminal-mode-plan.md)'s addendum. Screenshot: `client/liminal-issues.png`.

## Reported problems (from screenshot)

1. **Misoriented shelf** — one shelf on the left renders perpendicular to its neighbors instead of parallel.
2. **Missing shelves** — only 2 of an expected 3 shelves render per side, on both left and right.
3. **Detached panels** — each shelf's AngledBoard (front/back tilt panel) reads as visually disconnected from the rest of its unit. Described as affecting literally every shelf in the image, not a subset.

## Status

| # | Cause | Status |
|---|---|---|
| 1, 2 | Timing race in `LiminalWorldWrapSpike` | **Fixed, verified** |
| 3 | Unknown | **Unresolved** — code-level causes ruled out |

## #1 / #2 — timing race (fixed)

`LiminalWorldWrapSpike.pollForSceneInsertion()` (`client/src/scene/liminal/LiminalWorldWrapSpike.ts`) fires the reparent + `repositionShelvesIntoCorridor()` sequence exactly once, gated only on the production `InstancedShelfRenderer`'s meshes existing. But shelf population happens progressively — `StorePropsCoordinator` populates shelves in batches of 18 (`BATCH_SIZE`) via `StorePropsEventTypes.BatchReadyForPlacement`, well after the renderer object itself is constructed and published through `DataManager`. The one-shot poll ran against whatever subset of shelves happened to be populated at that instant — 2 per side in the reported case — and never ran again, so later-populated shelves stayed at their pre-corridor (Row-layout) positions and orientations. That mismatch also explains #1: a shelf still at its original Row-layout transform, sitting among corridor-repositioned neighbors, reads as "perpendicular."

**Fix**: `LiminalWorldWrapSpike` now also subscribes to `AppEventTypes.StoreFullyPopulated` (emitted with an empty payload from `BatchCoordinator.ts:343` once population fully completes) and re-runs `repositionShelvesIntoCorridor()` from that handler, in addition to the original one-shot pass. No changes to the original poll or reposition logic — this is a second trigger, not a rewrite.

**Verification**: `yarn tsc --noEmit` clean. New unit test added (`LiminalWorldWrapSpike.test.ts`) simulating progressive population — starts with 2 populated indices, runs the render loop once, then grows the populated set and emits `StoreFullyPopulated`, asserting the newly-populated indices get repositioned too. Full client suite: 1087 passed, 0 failed, 9 skipped.

## #3 — detached AngledBoard panels (unresolved)

Investigated by concrete numeric geometry analysis plus a direct read of the transform-composition and GPU-flush code. Both are ruled out as causes:

- **Transform composition is correct.** In both `applyShelfUnitTemplate()` and `updateShelfUnitTransform()` (`InstancedShelfRenderer.ts:349-451`), each part's local offset is rotated by the unit's rotation before being added to world position (`part.offset.clone().applyQuaternion(unitRotation)`), and final rotation is composed as `unitRotation.clone().multiply(part.rotation)` — correct parent-then-child composition. This is the exact path the corridor reposition uses (`updateShelfUnitTransform`, since shelves already exist by the time repositioning runs).
- **GPU flush is atomic.** `InstancedShelfRenderer.flushToGPU()` calls `updateGPU()` on all 4 part-type managers (angledBoard, sideBoard, shelfBoard, interiorSurface) together — rules out a partial-flush explanation.
- **Geometry itself is flush in the un-rotated case.** Using the concrete `ShelfConfig` defaults (`width: 2.0, height: 2.0, depth: 0.34, angle: 3°`, from `SharedPropsTypes.ts`) and part geometry (`ShelfGeometryBuilder.ts`): AngledBoard is a `2.0×2.0×0.05` panel offset to `(0, 1.0, ±0.136)` and tilted ∓3° about local X; SideBoard is `0.05×2.0×0.34` offset to `(∓1.025, 1.0, 0)`. In the Row layout (no unit rotation), AngledBoard's X-extent edge lands exactly at X=1.0, matching SideBoard's inner face at 1.025−0.025=1.0 — a flush, rigid box. After a ±90° corridor yaw, local (x, z) maps to world (∓z, ±x) — a pure axis relabeling of a rigid rotation. That should not, by itself, produce visible separation, since the composition math and flush are both confirmed correct.

Since #3 affects every shelf (not selectively, the way a timing-race bug would), the #1/#2 root cause doesn't explain it either. No prior matching entry in `docs/bugs.md`, and grepping `docs/` for "AngledBoard", "disconnected", "detached", "perpendicular" turned up nothing relevant.

**Current best (unconfirmed) hypothesis**: this isn't a code bug but a geometry/design mismatch — the AngledBoard tilt-panel shape was tuned for the Row layout's aisle-facing display context, and something about applying that same geometry under a corridor yaw doesn't hold up, even though the isolated math checks out. Static analysis is exhausted here; the two ways to make further progress are (a) a visual walkthrough in the running desktop build to see the artifact directly (renders, camera angles, and lighting can surface things pure geometry math won't), or (b) a design call on whether the AngledBoard panel needs reshaping for the corridor context rather than being treated as a bug to fix in place.

## Explicitly out of scope

A separate, already-understood SSAO/N8AO post-processing focus-desync issue exists in `client/src/scene/RenderPipelineManager.ts`. It was raised only as a diagnostic hint early in this investigation, not as a task — **no changes to that file were made or are wanted here.**

## Also flagged, not yet actioned

The user suggested bumping total shelf count from 3 to 5 (per side, presumably) to make the corridor pattern easier to visually verify. Not yet clarified whether this means a dev/test game-library size change or a corridor-window sizing parameter, and not yet implemented.

## Files touched this pass

- `client/src/scene/liminal/LiminalWorldWrapSpike.ts` — added `StoreFullyPopulated` subscription + `handleStoreFullyPopulated()`.
- `client/test/unit/scene/liminal/LiminalWorldWrapSpike.test.ts` — added progressive-population regression test.

Nothing has been committed yet.

## Open questions for review

1. Is the "geometry/design mismatch" hypothesis for #3 worth pursuing, or is there a more likely code-path that hasn't been checked (e.g. something in how `updateShelfUnitTransform` is reached via `setInstance`'s idempotent-existing-unit branch, versus fresh creation via `applyShelfUnitTemplate` — both were read and look equivalent, but a second pass here could be worthwhile)?
2. Is corridor geometry (a single line of shelf units per side, yawed ±90° from Row orientation) fundamentally the wrong fit for a panel shape designed for face-on aisle browsing, independent of any bug?
3. Any reason to suspect the desktop-only visual (no VR) is misleading here — e.g. camera angle, lighting, or post-processing (separately from the excluded SSAO bug) making a technically-correct transform *look* detached?

---
*— T1*
