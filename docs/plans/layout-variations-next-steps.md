# Layout Variations — Branch Planning

*Created: 2026-04-19 — end of `openclaw/feat-stock-strategy` session*  
*Updated: 2026-04-19 — after `openclaw/feat-layout-registry` commit `48f56e5`*

---

## Completed ✅

### `openclaw/feat-stock-strategy` (merged PR #81)
- `IStockStrategy` (Arc/Row/Spoke) wired end-to-end
- `ShelfLayoutCoordinator` dispatches Arc, Row, or Spoke geometry
- Layout dropdown live in UI (Arc / Row / Spoke)
- Layout switch tears down and rebuilds subsystems cleanly
- Row layout confirmed working; Spoke geometry correct with 22.5° bias fix
- Strategies co-located with their layout utils files
- `buildStockSurfaces` refactored to options object (no more `undefined` arg)
- `DataManager` inline import removed from `StorePropsCoordinator`
- ESLint rule added to warn on inline dynamic imports
- `LayoutMode`/`LayoutModes` moved to `LayoutTypes.ts`

### `openclaw/feat-layout-registry` (in progress)
- `ILayoutDefinition` interface — `createStockStrategy()` + `computeShelves()` per layout
- `LayoutRegistry` barrel — single `Record<LayoutMode, ILayoutDefinition>`, replaces both
  `StockStrategyRegistry` and `ShelfLayoutCoordinator.layoutComputers`
- Each layout utils file exports its own `ILayoutDefinition` (strategy + geometry co-located)
- `ShelfLayoutCoordinator` → resettable singleton (`getInstance` + `reset(mode)`)
- `GameBoxSpawner` → `resetWithStrategy()` added; used on layout switch
- `StorePropsCoordinator` lifecycle model implemented:
  - Pure coordinators reset on layout switch (no null/reconstruct)
  - `InstancedShelfRenderer` (GPU owner) still disposed + reconstructed
- `ShelfInfo` added to `LayoutTypes.ts` as canonical return type for `computeShelves()`
- `StockStrategyRegistry.ts` deleted (superseded by `LayoutRegistry`)

---

## Next branch — renderer lifecycle and stable capacity

The current `GpuGameBoxRenderer` construction is tied to batch count and layout switches,
which causes the renderer to be created/destroyed multiple times per session with varying
capacity ceilings. This is wrong in principle:

**The renderer should hold the full game library, always.**

Re-sort, group, and layout changes don't change the source games. The renderer should be
initialized once with `totalRenderableGames` capacity and survive layout/sort changes.
Only a genuine library reload (new user, force-refresh) should trigger dispose + recreate.

Consequences of the current approach:
- Capacity checks like `requiredCapacity > this.rendererCapacity` are suspicious by design.
  They exist because the renderer was undersized by a previous smaller-layout run.
- Every layout switch disposes the artwork atlas, losing all prefetch cache.

Correct approach:
- Initialize `GpuGameBoxRenderer` once, sized to `steam.games` length from DataManager,
  when the library first loads (`GameDataReady`).
- On `ClearRequest` (layout switch, group/sort change), call `renderer.clearPlacements()` only — do NOT dispose.
- On library reload (new user / force-refresh), dispose and recreate.
- Remove all renderer capacity checks from `GameBoxSpawner`.
- This enables the `ArtworkPrewarmer` split described in `GameBoxSpawner`'s TD comment:
  prewarm is a library-lifetime concern; placement is a layout-lifetime concern.

---

## Next branch — section-per-layout

The core feature: each named Section gets its own spatial territory in the layout.

### What this requires

0. **Disable layout/sort controls while pipeline is active**
   `LayoutSortPanel` should emit a state change or listen to pipeline events to disable
   dropdowns during teardown/rebuild. Re-enable on `StorePropsEventTypes.SetupCompleted`
   or first `GamesPlaced`. Prevents re-entrant layout requests and redundant reload churn.

1. **Layout knows section count before shelves emit**
   Currently `ShelfLayoutCoordinator` sizes itself from `totalBatches`. For section-aware
   layouts it needs section count first, then derives shelf count per section.

   Recommended: **`SectionsPlanned` pre-signal** — `GameSorter` emits it synchronously with
   section metadata before the first batch. `ShelfLayoutCoordinator` stores it and uses it on
   first `BatchReadyForPlacement`. Zero pipeline reorder needed.

   Proposed shape:
   ```typescript
   export interface SectionsPlannedEvent extends BaseInteractionEvent {
       sections: ReadonlyArray<{ name: string; estimatedGameCount: number }>
       sortMode: GameSortMode
   }
   ```

2. **Shelf assignment is per-section, not global**
   Shelves are currently numbered 0–N globally. With sections, shelf 0 belongs to section A,
   shelf 6 to section B, etc. `ShelfLayoutCoordinator` needs to annotate `ShelfReady` with
   `sectionIndex` so `GameBoxSpawner` knows which shelf pool to pull from.

   Proposed addition to `ShelfReadyEvent`:
   ```typescript
   sectionIndex: number  // which section owns this shelf
   ```

3. **`GameBoxSpawner` iterates sections → shelves (not shelves → games)**
   Current loop iterates shelf positions and fills from a game queue. Target:
   ```
   for each section in sections:
       shelves = shelfPositions filtered by sectionIndex
       for each shelf in shelves:
           fill from section.games
   ```
   The section iteration is already partially structured via `SectionsReady`.
   Shelf-by-section filtering is the missing piece.

4. **Signage derives from section names**
   Each spoke/row group has a section name; signs go at the aisle entrance.
   Hub-proximal shelf of each spoke is the sign anchor. No bucket-key heuristics needed.

5. **`ILayoutDefinition.computeShelves` signature may need section awareness**
   Currently `computeShelves(totalShelves: number)`. May need to become
   `computeShelves(sections: ReadonlyArray<SectionMeta>)` once section count drives geometry.
   Evaluate when wiring `SectionsPlanned`.

---

## Deferred — beyond next branch

### Multi-section game placement (non-exclusive matching)
Games appear in multiple sections if they match multiple group criteria.
- `GameSorter` produces `Section[]` where a game can appear in > 1 section
- `GameBoxSpawner` prefetches once (atlas slot shared), places N times (N GPU instances)
- Requires atlas slot tracking decoupled from instance count

### Row layout sections
Each section gets a contiguous band of rows. Visual separator = gap row or overhead sign.
Follows the same `SectionsPlanned` pattern as Spoke.

### Mirror-walk ordering in Spoke
Right side ascending, left descending — continuous loop. Config option on
`SpokeLayoutConfig.mirrorWalkOrder`. Requires section-aware placement first.

### Arc + genre overflow follow-up (2026-04-21)
1. **Back-row squish when grouping by genre in Arc layout**
   - Symptom: in Arc + `By Genre`, non-dominant genres can appear visually compressed in the back row.
   - Why: `computeStoreArcShelfLayout` uses fixed counts for rows 0–3, then dumps all remaining shelves into row 4 (`totalShelves - 32`).
     Row 4 intentionally relaxes `minShelfGap` enforcement (`row < cfg.rows - 1` check), so overflow can be densely packed.
   - Status: acknowledged/deferred. This is expected to disappear once section-aware shelf distribution owns per-section shelf budgets instead of global overflow.
   - Suggested interim guardrail (optional): cap row-4 density and spill into additional rows before section-aware distribution lands.

### Spoke follow-ups from live validation (2026-04-20)
1. **Inside/outside flip**
   - Current spoke stocking appears on the outer faces relative to aisle flow.
   - Expected: games should present on the inner aisle faces.

2. **Bounds authority for spoke store shape**
   - Current spoke center aligns with current entrance mat/store framing assumptions.
   - Upcoming environment variant will move the entrance mat to the middle; spoke geometry
     should define store bounds independent of current mat placement.

3. **Section signage at spoke entrance**
   - Signs should anchor at the hub-side entrance of each spoke (optionally repeated deeper in aisle).
   - Current placement limitations appear coupled to incomplete one-group-per-section behavior;
     similar symptom observed in Arc when sort mode is `by-genre`.

### Dynamic layout switching without reload
Smooth/instant-snap repositioning without full teardown. Requires `InstancedShelfRenderer`
to support in-place position updates for existing shelf IDs.

### Layout grouping parameter
Shape (arc, row, etc.) repeats every N shelves with visual breaks between groups.
Enables aisle structure without per-section layout variants.

---

## Architecture notes

**`ILayoutDefinition.computeShelves` current signature:**
```typescript
computeShelves(totalShelves: number): ShelfInfo[]
```
May evolve to accept section metadata once section-per-layout lands.

**`SectionsPlanned` signal (proposed):**
```typescript
export interface SectionsPlannedEvent extends BaseInteractionEvent {
    sections: ReadonlyArray<{ name: string; estimatedGameCount: number }>
    sortMode: GameSortMode
}
```
Emitted by `GameSorter` synchronously before the first `GamesBatchReady`.

**`ShelfReadyEvent` with section context (proposed addition):**
```typescript
sectionIndex: number  // NEW — which section owns this shelf
```
`ShelfLayoutCoordinator` computes section → shelf mapping from `SectionsPlanned` data.

**Coordinator lifecycle model (implemented):**
- Resettable singletons: `ShelfLayoutCoordinator`, `BatchCoordinator`, `GameBoxSpawner`
- Disposable GPU owners: `InstancedShelfRenderer`, `GpuGameBoxRenderer`

---

## Related

- [Liminal Mode](../features/liminal-mode.md) — endless-treadmill presentation modifier built on top of this layout system; shares the in-place-reposition prerequisite with dynamic layout switching.
