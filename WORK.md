# WORK.md

## Task
Continue GameSort/event-driven shelf pipeline on new branch and move remaining batch orchestration responsibilities from `GpuStorePropsRenderer` into `BatchCoordinator` where appropriate.

## Branch
`openclaw/feat-gamesort-continuation`

## Approach
1. Update planning docs (`gamesort-event-driven-plan.md`) to describe the continuation shape.
2. Carve remaining batch pipeline coordination from `GpuStorePropsRenderer` into `BatchCoordinator`:
   - Keep renderer focused on rendering lifecycle + bridging `ShelfReady -> ShelfCreated` only if still needed.
   - Move progress/completion orchestration and queue lifecycle to coordinator.
3. Update tests for adjusted event ownership and ordering.
4. Run focused unit/integration tests.

## Files checklist
- [x] docs/plans/gamesort-event-driven-plan.md
- [x] client/src/scene/batch/BatchCoordinator.ts
- [x] client/src/scene/GpuStorePropsRenderer.ts
- [x] docs/plans/steam-tag-research.md (subagent)
- [x] docs/plans/steam-user-categories-feasibility.md (subagent)
- [x] client/test/integration/batch-to-placement-flow.int.test.ts (validated)
- [x] client/test/unit/scene/batch/BatchCoordinator.test.ts (validated)

## Open questions
- Should `ShelfReady -> ShelfCreated` translation remain in `GpuStorePropsRenderer` or move to a dedicated placement coordinator? (still open)
- Should `StorePropsEventTypes.Progress` emissions for shelves live in `BatchCoordinator` now? (still open)
