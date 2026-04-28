# Multi-Group Placement Plan

*Created: 2026-04-21*
*Target branch: `openclaw/feat-multi-group-placement` (off `feat-section-per-layout-v2` or its merge)*

## Status Update After Texture/Placement Split

This plan predates the render-intent rendezvous refactor.

The important architectural blocker is now gone:

- `RenderIntentCoordinator` already supports many placement intents per appid.
- `GameBoxSpawner` already emits one placement intent per section appearance.
- one settled artwork outcome can already fan out to many placements.
- regression coverage already exists for duplicate section appearances and multi-genre placement.

So multi-group placement is no longer blocked on the texture pipeline. The remaining work is to build on the current intent-based flow, not to revive the old `tryPlace()` / single-intent design.

---

## What this changes

Currently a game appears in **exactly one section** at placement time — whichever section the sorter assigned it to first. The intent is for a game to appear **in every section it belongs to**, with each appearance being an independent GPU instance.

Example: a game tagged both Action and Indie should appear on Action shelves AND on Indie shelves.

---

## Where the work lives

### `GameBoxSpawner`

`GameBoxSpawner` no longer owns the rendezvous map. Its current job is to emit one `PlacementIntentReady` per section appearance. That means duplicate membership is already representable without extra texture work.

The next multi-group work here is mostly validation and cleanup:

- keep emitting one placement intent per appearance
- do not dedupe repeated games across sections
- preserve section-local shelf budgeting and placement order
- avoid re-introducing placement-time artwork decisions here

### `GpuGameBoxRenderer` / `clearPlacements()`

`clearPlacements()` resets instance positions on re-sort. This continues to be correct — clearing all GPU instances and rebuilding from fresh intents is the right approach. The key insight: **one prewarm, N instances**.

The renderer already supports N instances per game conceptually (the artwork atlas is indexed by game name, not by instance slot). The current `PlacementResolved` flow already drives this.

### `RenderIntentCoordinator`

This is now the component that matters for the old "one prewarm, N placements" requirement.

Current behavior already matches the goal:

- many placement intents may be buffered for the same appid
- one `ArtworkIntentSettled` event flushes all pending placements for that appid
- a new `SectionsReady` run clears stale pending placement intents before rebuild

That means the coordinator should remain the place that owns duplicate-placement fan-out behavior.

### `placeSections` in `GameBoxSpawner`

`placeSections()` iterates sections and emits one placement intent per section appearance. No special deduplication is needed — duplicates are the feature here.

One thing to guard: if the same game appears in section A and section B, both sections need shelf space budgeted for it. The shelf budget calculation in `ShelfLayoutCoordinator` is already section-aware (`games.length / 18` per section), so if section A has 50 games and section B has 30, those are independent shelf allocations even if some games overlap.

---

## `Section` type consideration

Currently `Section.games` contains the full sorted game list for that section. Games may appear in multiple sections without any deduplication. This is already correct for grouping by genre — a game with two genres appears in two sections.

No type changes needed.

---

## What to test

1. **Unit**: keep coverage that a game with two placement intents resolves twice at two positions.
2. **Integration**: keep coverage that a multi-genre game appears in both emitted genre sections.
3. **Re-sort regression**: verify that after a re-sort, all placements are cleared and rebuilt correctly (no stale intent replay).
4. **Grouping source-of-truth**: verify that upstream grouping intentionally emits duplicate appearances for overlapping memberships.

---

## Branch strategy

Do this on a **new branch** off the merged texture/placement split work rather than the old pre-rendezvous branches. Reasons:
- the render-intent foundation is now in place
- the remaining work is mainly grouping semantics and placement validation
- keeping it isolated still makes regressions easier to attribute

---

## Out of scope for this plan

- Navigation gaps between shelf rows (separate layout-spacing concern)
- Per-section sort override (stretch, after this)
- "Inside-surface only" stocking for spokes (should be solved by existing `SpokeStockStrategy`, verify first)
