# Feature: GameSort Full Pipeline

**Act**: 2 (Gate 2)
**Status**: In Progress (group/sort pipeline works; event seam cleanup and placement regression guards are active work)
**Priority**: Medium

## Goal

Make re-sorting reorder game boxes and shelves in the 3D scene, not just the neon signs — completing the texture/placement split that's currently tech debt.

## Context

The current sort system updates signage (neon signs per genre/category) but doesn't reposition the physical game boxes and shelves to match. This means the visual layout and the sort order are decoupled — a user sorting "by genre" sees signs reorder but games stay put. The fix requires separating texture assignment from placement logic and wiring sort changes through the full scene update pipeline.

## Acceptance Criteria

- Changing sort mode (e.g. by genre, by name, by play time) reorders game boxes in the scene
- Shelves re-populate to reflect the new sort order, not just signs
- Sort policy is owned by the appropriate service (not `SteamApiClient`)
- Generic sort utility (`sortByFields`) exists and is used consistently
- Re-sort does not cause visible pop or layout thrash — transition is either instant-clear or animated
- Existing sort tests pass; new tests cover the box/shelf placement path

## Stories / Tasks

- Audit current sort ownership — move sort policy off `SteamApiClient` into appropriate coordinator/manager
- Implement `sortByFields` generic utility
- Wire sort changes through `SceneCoordinator` to trigger shelf repopulation
- Separate texture assignment from placement in `GameBoxRenderer` or equivalent
- Test: sort change → verify box positions update to match new order

## Event Contract (current)

Game sort should hang from the definitions-ready seam, not artwork completion:

1. `SteamEventTypes.LibraryManifestReady`
   - Immutable membership known (`appid[]`, total count)
   - Used for renderer sizing/progress baselines
2. `GameEventTypes.GameDataReady`
   - `steam.games` committed and definitions available
   - Canonical trigger for `GameSorter`
3. `GameEventTypes.SectionsComputed`
   - Uncapped section identity seam (`sectionId` + section identity)
4. `GameEventTypes.ArrangementAllocationPlanned`
   - Allocation decision seam keyed by `sectionId`
5. `GameEventTypes.SectionsReadyForPlacement`
   - Placement execution seam consumed by `GameBoxSpawner`
6. `GameEventTypes.SectionsReady`
   - Arrangement seam consumed by shelf layout/sign systems and UI sync
7. Artwork pipeline completion events (`BatchReadyForPlacement`, `GamesPlaced`, `AllBatchesComplete`)
   - Placement/progress only; must not gate sort/layout semantics

## Notes / Open Questions

- **What's already done**: `GameSorter` now emits separated arrangement seams (`SectionsComputed`, `ArrangementAllocationPlanned`, `SectionsReadyForPlacement`, `SectionsReady`). `ShelfSectionPlanner` listens to `SectionsReady`; `GameBoxSpawner` listens to `SectionsReadyForPlacement`. Sort policy has been moved out of `SteamApiClient`.
- "Sort by" in-scene affordance and sort mode switch UI is a related intake item from Apr 6-7 session dossier.
- Multi-instance genre sections (same game appearing in multiple thematic views) is out of scope here — that's Encore.
- Coordinate with `SignageRenderer` singleton/static-method evaluation (also in the dossier).
- Related plan (archived): `docs/archive/gamesort-event-driven-plan.md` — event-driven sort architecture; `GameSorter`, `ShelfLayoutCoordinator`, `InstancedShelfRenderer` wiring is substantially implemented.
- Related plan: `docs/plans/resort-game-placement-plan.md` — implementation plan for re-sort game box repositioning (the actual remaining gap).
- Related plan: `docs/plans/texture-placement-split-plan.md` — decouples texture prefetch from instance placement; enables clean re-sort without re-fetching artwork.
- Related plan: `docs/plans/layout-sign-responsibility-plan.md` — migrates bucket sign placement out of `SceneSignManager` into `ShelfSectionPlanner`.
- Related plan: `docs/plans/sign-system-simplification-plan.md` — reduces `SceneSignManager` to a pure sign dispatch service; drops `SignKind` semantic tracking.
- Related plan: `docs/plans/sign-placement-rules-plan.md` — pluggable rules for sign placement (row boundary, interval) with a pipeline toward designated areas and artistic layouts.
- Related plan: `docs/plans/canvas-sign-renderer-plan.md` — wraps canvas sign path in `ISignRenderer` making `SceneSignManager` renderer-agnostic.


**Related debt**: `sticker-coordinator`
