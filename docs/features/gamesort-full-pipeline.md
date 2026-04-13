# Feature: GameSort Full Pipeline

**Act**: 2
**Status**: Not Started
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

- "Sort by" in-scene affordance and sort mode switch UI is a related intake item from Apr 6-7 session dossier.
- Multi-instance genre sections (same game appearing in multiple thematic views) is out of scope here — that's Act 4.
- Coordinate with `SignageRenderer` singleton/static-method evaluation (also in the dossier).
