# WORK.md

## Task
Restore progressive shelf spawning while keeping event-driven layout/sort separation.

## Branch
`openclaw/feat-event-driven-sort`

## Approach
- Move shelf layout trigger to first `BatchReadyForPlacement` using `totalBatches`.
- Emit per-shelf readiness as each batch arrives (progressive visuals).
- Keep sorting downstream on `AllBatchesComplete` via `GamesSort`.
- Remove redundant `ShelfRenderer` wrapper; make `InstancedShelfRenderer` self-subscribed to `ShelfReady`.

## Files touched
- [x] `src/scene/shelves/ShelfLayoutCoordinator.ts`
- [x] `src/scene/instancing/InstancedShelfRenderer.ts`
- [x] `src/scene/GpuStorePropsRenderer.ts`
- [x] `src/scene/SceneCoordinator.ts`
- [x] `src/types/InteractionEvents.ts`
- [x] `src/scene/shelves/ShelfRenderer.ts` (deleted)
- [x] `test/unit/scene/shelves/ShelfRenderer.test.ts` (deleted)
- [x] `../docs/plans/gamesort-event-driven-plan.md`

## Open questions
- Confirm naming preference for `ShelfLayoutDetermined` vs `LayoutChanged` in next branch.
- Decide whether to emit explicit relayout deltas vs full snapshot for runtime layout switching.
