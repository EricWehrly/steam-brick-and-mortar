# Feature: Neon Sign Stroke-Skeleton Rendering

**Act**: 3
**Status**: Not Started
**Priority**: Medium

## Goal

Replace outline-contour neon tube geometry with medial-axis stroke geometry so neon signs look like real neon tube lighting (solid strokes, no seam artifacts).

## Context

The current `NeonTubeSignRenderer` traces glyph *outline contours* as tube loops, producing a "macaroni" look — disjoint segments, visible seams, hollow outlines. The infrastructure (worker, renderer, sign manager integration) is complete and tested. Only the geometry extraction needs to be replaced. Full plan: [`docs/plans/neon-stroke-skeleton-plan.md`](../plans/neon-stroke-skeleton-plan.md).

## Acceptance Criteria

- One continuous tube per letter stroke, following the medial axis
- No seam artifacts, no hollow outlines
- No new runtime dependencies
- Existing worker tests still pass
- Neon entrance sign and "Steam Library" block sign both visible at store entrance
- Font asset licensing documented in `THIRD_PARTY_LICENSES.md` and credits UI

## Stories / Tasks

- **10.1.1.1** Rasterize glyph outlines to binary pixel grid in worker (scanline fill, no new deps)
- **10.1.1.2** Apply Zhang-Suen thinning to produce 1-pixel skeleton
- **10.1.1.3** Trace skeleton pixels into ordered polylines, splitting at branch points
- **10.1.1.4** Smooth + resample; hand off to existing `CatmullRomCurve3` + `TubeGeometry` path
- **10.1.1.5** Prototype Hershey fonts as lower-effort alternative; compare visual quality
- **10.1.2.1** Un-comment `syncNeonEntranceSign` spawn in `SceneSignManager`
- **10.1.2.2** Resolve font asset licensing; un-comment `syncSteamLibraryBlockSign`
- **10.1.2.3** Add helvetiker copyright to credits UI (MgOpen license — permissive but not MIT)

## Notes / Open Questions

- Hershey fonts may be the right call if medial axis tracing is overkill for the letter set in use. Prototype both before committing.
- See full technical analysis in `docs/plans/neon-stroke-skeleton-plan.md`.
