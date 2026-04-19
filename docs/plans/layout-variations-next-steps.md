# Layout Variations — Branch Planning

*Created: 2026-04-19 — end of `openclaw/feat-stock-strategy` session*

---

## Current state

- `IStockStrategy` (Arc/Row/Spoke) wired end-to-end ✅
- `ShelfLayoutCoordinator` dispatches Arc, Row, or Spoke geometry ✅
- Layout dropdown live in UI (Arc / Row / Spoke) ✅
- Layout switch tears down and rebuilds subsystems cleanly ✅
- Row layout confirmed working ✅
- Spoke layout geometry is correct but needs UX polish (see below)

---

## This branch — merge candidates

Things small enough to land before PR closes:

- **Spoke rotation cosmetic fix** — 4 spokes at cardinal angles look unrotated because
  the perpendicular facing vectors hit exactly 0° and 90°. Fix: nudge `firstSpokeAngleOffset`
  by ~22.5° (`-PI/2 + PI/8`) to break the symmetry. One-liner in `SpokeLayoutUtils.ts`.

- **Section-count → shelf-count link (stub)** — currently `totalBatches` from `BatchReadyForPlacement`
  drives shelf count. For section-per-spoke this needs to be: N sections → N × shelvesPerSpoke shelves.
  A stub that reads section count from the last `SectionsReady` event (or a pre-signal) would
  unblock the next phase without requiring full re-architecture.

---

## Next branch — section-per-layout + architecture cleanup

The core feature: each named Section gets its own spatial territory in the layout.
In parallel, we should land the registry/lifecycle cleanup that removes obvious coordinator complexity.

### What this requires

0. **Layout registry + definition interface (architectural intent)**
   `LayoutMode` should remain the discriminant key, but behavior should live behind a single
   `ILayoutDefinition` interface implemented by each layout module.

   Proposed shape:
   ```typescript
   export interface ILayoutDefinition {
       readonly mode: LayoutMode
       createStockStrategy(): IStockStrategy
       computeShelves(totalShelves: number): ShelfInfo[]
   }
   ```

   Then a barrel registry owns the mapping:
   ```typescript
   export const LayoutRegistry: Record<LayoutMode, ILayoutDefinition>
   ```

   This collapses multiple maps (`layoutComputers`, strategy registry) into one source of truth.

1. **Layout knows section count before shelves emit**
   Currently `ShelfLayoutCoordinator` sizes itself from `totalBatches` (which equals shelf count,
   which equals game count / games-per-shelf). For section-aware layouts, it needs to know
   section count *first*, then derive shelf count per section.

   Options:
   - `SectionsReady` fires before `BatchReadyForPlacement` (requires pipeline reorder — risky)
   - A `SectionsPlanned` pre-signal carries section names + estimated game counts before batches emit
   - `ShelfLayoutCoordinator` waits for both signals and resolves lazily (rendezvous)

   Recommended: **`SectionsPlanned` pre-signal** — `GameSorter` emits it synchronously with
   section metadata before the first batch. `ShelfLayoutCoordinator` stores it and uses it on
   first `BatchReadyForPlacement`. Zero pipeline reorder needed.

2. **Shelf assignment is per-section, not global**
   Currently shelves are numbered 0–47 globally. With sections, shelf 0 belongs to section A,
   shelf 6 belongs to section B, etc. `ShelfLayoutCoordinator` needs to emit `ShelfReady` with
   a `sectionIndex` field so `GameBoxSpawner` knows which shelf pool to pull from per section.

3. **`GameBoxSpawner` iterates sections → shelves (not shelves → games)**
   The placement loop currently iterates shelf positions and fills from a game queue. It needs
   to flip: for each section, pick its assigned shelf slots, fill games. This is already partially
   structured — `SectionsReady` feeds `handleSectionsReady` which iterates sections. The shelf
   assignment is the missing piece.

4. **Signage derives from section names**
   `ShelfSectionPlanner` becomes trivial or dead. Each spoke/row group has a section name; signs
   go at the aisle entrance. No bucket-key heuristics needed.

5. **Disable layout/sort controls while rebuild pipeline is active**
   Prevent re-entrant UI requests during teardown/rebuild (`LayoutRequested`, `SortRequested`).
   Re-enable once setup + first shelf/game placement readiness signal arrives.
   This should reduce user-visible race conditions and avoid redundant reload churn.

### Coordinator lifecycle model (architectural intent)

For simplicity and obviousness, split by ownership type:

- **Resettable singleton coordinators** (event wiring + plain data only)
  - `ShelfLayoutCoordinator`
  - `BatchCoordinator`
  - `GameBoxSpawner` (if kept data-only)
  These should expose `reset()` and keep stable object identity.

- **Disposable render/resource owners** (GPU assets, textures, meshes)
  - `InstancedShelfRenderer`
  - `GpuGameBoxRenderer`
  These should keep `dispose()` and be reconstructed when needed.

This removes most nullable lifecycle plumbing in `StorePropsCoordinator` and reduces event-handler leak risk.

### Spoke-specific: aisle entrance sign placement
   Each spoke's hub-proximal shelf is the sign anchor point. Section name → sign label.
   This is the same pattern as arc time-bucket signs but with cleaner data.

---

## Deferred — beyond next branch

### Multi-section game placement (non-exclusive matching)

Games appear in multiple sections if they match multiple group criteria. Architecturally:
- `GameSorter` produces `Section[]` where a game can appear in > 1 section
- `GameBoxSpawner` prefetches once (atlas slot shared), places N times (N GPU instances)
- Instance count policy needed: max 2–3 appearances per game, LOD-driven

**Why deferred:** Requires atlas slot tracking to be decoupled from instance count.
Currently `placeInstance` assumes 1 atlas slot per game. Multi-placement is additive instances,
not additive atlas slots. The refactor is bounded but non-trivial.

### Row layout sections

Row is simpler than spoke for sections: each section gets a contiguous band of rows.
Visual separator between sections = a gap row or a sign overhead.
Can follow the same `SectionsPlanned` pattern.

### Mirror-walk ordering in Spoke

Right side of aisle ascending, left side descending, so walking down and back is continuous.
This is a sort-order transform applied when building Section game lists for a spoke layout.
Config option on `SpokeLayoutConfig.mirrorWalkOrder` (default true).
Deferred because it requires Section-aware placement to be working first.

### Dynamic layout switching without reload

Currently switching layout tears down and rebuilds. Smooth repositioning (animate or instant-snap)
requires `InstancedShelfRenderer` to support in-place position updates — it already has the
idempotent `setInstance` path. The missing piece is emitting new `ShelfReady` positions for
existing shelf IDs and having the renderer update rather than re-allocate.

### Layout grouping parameter

Layouts support a "group size" N: the shape (arc, row, etc.) repeats every N shelves, with
visual breaks between groups. Enables natural aisle structure without per-section layout variants.
See `layout-variations.md` "Grouping" section.

---

## Architecture notes

**`SectionsPlanned` signal shape (proposed):**
```typescript
export interface SectionsPlannedEvent extends BaseInteractionEvent {
    sections: ReadonlyArray<{ name: string; estimatedGameCount: number }>
    sortMode: GameSortMode
}
```
Emitted by `GameSorter` synchronously before the first `GamesBatchReady`. No awaiting needed.

**ShelfReady with section context (proposed addition):**
```typescript
export interface ShelfReadyEvent extends BaseInteractionEvent {
    batchIndex: number
    position: THREE.Vector3
    rotationY: number
    sectionIndex: number  // NEW — which section owns this shelf
}
```
`ShelfLayoutCoordinator` computes section → shelf mapping from `SectionsPlanned` data,
annotates each `ShelfReady` with `sectionIndex`.

**`GameBoxSpawner` placement loop target state:**
```
for each section in sections:
    shelves = shelfPositions filtered by sectionIndex
    for each shelf in shelves:
        fill from section.games
```
Current loop is close — the section iteration is already there.
The shelf filter by section is the new piece.
