# Feature: GameSort Full Pipeline

**Act**: 2 (Gate 2)
**Status**: Not Started (sort pipeline and GameSorter are substantially done — see Notes; box/shelf repositioning on re-sort is the actual remaining gap)
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

## Notes / Open Questions

- **What's already done**: `GameSorter` is fully implemented and emits `GamesSortEvent` with sorted games. `ShelfSectionPlanner` listens and receives `sortedGames`. Sort policy has been moved out of `SteamApiClient`. Sort modes (genre, recently-played, playtime) exist. `LayoutSortPanel` wired to `SortRequested` → `GameSorter`. The remaining gap is specifically box/shelf repositioning — games don't move in the scene when sort mode changes.
- **Initial sort mode intent (parked, 2026-04-16)**: Initial sort should fork on login state — logged-in user gets Recently Played, anonymous/demo gets By Genre. Once SteamSpy popularity data is wired (player counts / review scores), anonymous default should switch to a popularity sort instead. Implementation was drafted but reverted because `SteamIntegration` is undergoing a major rewrite in a parallel branch; re-apply after that lands. The canonical check should be `SteamIntegration.isAnonymous()` reading `steam.userInput` from `DataManager` (absent = anonymous). // TD: steamspy-initial-sort
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
