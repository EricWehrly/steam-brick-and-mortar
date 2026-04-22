# Multi-Group Placement Plan

*Created: 2026-04-21*
*Target branch: `openclaw/feat-multi-group-placement` (off `feat-section-per-layout-v2` or its merge)*

---

## What this changes

Currently a game appears in **exactly one section** at placement time — whichever section the sorter assigned it to first. The intent is for a game to appear **in every section it belongs to**, with each appearance being an independent GPU instance.

Example: a game tagged both Action and Indie should appear on Action shelves AND on Indie shelves.

---

## Where the work lives

### `GameBoxSpawner`

The rendezvous pattern currently uses:
```
placementIntents: Map<appid, PlacementIntent>   // one intent per game
prefetchResults:  Map<appid, PrefetchResult>     // set once after prewarm
```

`tryPlace(appid)` consumes the intent on first use (`placementIntents.delete(appid)`), so subsequent intents for the same appid never fire.

**Required change:** support multiple intents per appid:
```
placementIntents: Map<appid, PlacementIntent[]>  // list, one entry per section appearance
```

`tryPlace(appid)` must iterate all pending intents for that appid and fire `renderer.placeGame` for each one. Each intent should be consumed independently (remove from list when placed, remove key when list is empty).

The prefetch result is still per-appid (one prewarm, one texture) — only intents are multiplied.

### `GpuGameBoxRenderer` / `clearPlacements()`

`clearPlacements()` resets instance positions on re-sort. This continues to be correct — clearing all GPU instances and rebuilding from fresh intents is the right approach. The key insight: **one prewarm, N instances**.

The renderer already supports N instances per game conceptually (the artwork atlas is indexed by game name, not by instance slot). `placeGame` just needs to be called N times with different positions.

### `placeSections` in `GameBoxSpawner`

Currently iterates sections and builds one intent per appid from the game queue. When a game appears in multiple sections, it would be added to the intent list multiple times (once per section). No special deduplication needed — we WANT duplicates.

One thing to guard: if the same game appears in section A and section B, both sections need shelf space budgeted for it. The shelf budget calculation in `ShelfLayoutCoordinator` is already section-aware (`games.length / 18` per section), so if section A has 50 games and section B has 30, those are independent shelf allocations even if some games overlap.

---

## `Section` type consideration

Currently `Section.games` contains the full sorted game list for that section. Games may appear in multiple sections without any deduplication. This is already correct for grouping by genre — a game with two genres appears in two sections.

No type changes needed.

---

## What to test

1. **Unit**: `GameBoxSpawner` — verify that a game with two placement intents fires `renderer.placeGame` twice, at the two different positions.
2. **Integration**: load a genre-grouped library, confirm a game that belongs to two genres appears in both section shelf areas.
3. **Re-sort regression**: verify that after a re-sort, all placements are cleared and rebuilt correctly (no double-placement from stale intent list).

---

## Branch strategy

Do this on a **new branch** off `feat-section-per-layout-v2` (or off `main` after merge) rather than on the current branch. Reasons:
- Current branch is focused on geometry/event correctness; this changes placement semantics
- The regression surface is different — placement logic is easier to test and bisect in isolation
- Current branch has sorting UX issues that will be addressed separately; mixing them makes it hard to attribute failures

---

## Out of scope for this plan

- Navigation gaps between shelf rows (separate layout-spacing concern)
- Per-section sort override (stretch, after this)
- "Inside-surface only" stocking for spokes (should be solved by existing `SpokeStockStrategy`, verify first)
