# Feature: Layout Variations

**Act**: 2 (Best Effort)
**Status**: In Progress (arc layout complete; `ShelfFace`/`StockSurface`/`IStockStrategy` abstraction landed in PR #81; dynamic switching and grouping not yet implemented)
**Priority**: Medium

## Goal

Support multiple shelf layout shapes with dynamic switching at runtime - so the store can be rearranged without a reload, and different organizational styles can be explored or offered as a user preference.

## Context

The concentric-arc layout was built during Act 1 as the primary spatial arrangement. It works well, but it's currently the only option and it's baked in. The vision is a layout system where shapes are first-class, switchable, and composable - the same way sort modes are first-class and switchable.

"Layout" here means the macro-level arrangement of shelves in the store, not the placement of individual game boxes on a shelf (that's the sort/placement pipeline).

## Layout Shapes (planned)

- **Arc / concentric rings** — current implementation; shelves arranged in arcs radiating from the player
- **Square rows** — traditional grid rows; simpler, more “video store” feeling; the pre-arc default
- **Alternating toe-out aisles** — neighboring shelf groups rotate outward (e.g., ~15° toe-out with wider aisle openings) to improve readability and navigation
- **Spoke** — see below
- **Other simple shapes** — chevron, etc.; TBD based on what feels good

## Grouping

> **Encore / stretch goal** - try if layout switching lands cleanly and time allows; not a blocker.

Layouts should support a "group size" concept: a shape (arc, square, etc.) applies to a group of N shelves, then repeats or transitions. For example: arcs of 4 shelves, spaced to form natural browsing aisles. This enables richer spatial organization without requiring a fully custom algorithm per layout.

## Dynamic Switching

Changing layout mode should reposition shelves live - similar to how sort mode change (will eventually) reposition game boxes. This implies:
- Layout mode is a runtime state, not a build-time decision
- Shelves can be repositioned without a full scene teardown/respawn
- Transition behavior TBD (instant snap vs. animate)

## Acceptance Criteria

- Arc layout continues working as-is
- Square row layout implemented and switchable at runtime
- Layout mode is selectable (UI affordance TBD - could be part of the sort/layout panel)
- Grouping parameter (shelves per group) is configurable
- Layout change repositions shelves without full scene reload

## Stories / Tasks

- Extract arc layout algorithm into a named, swappable `ILayoutStrategy` (or equivalent)
- Implement square row layout as a second strategy
- Wire layout mode into the sort/layout panel (next to sort mode selector)
- Implement dynamic shelf repositioning on layout change
- Define and implement grouping parameter

## Spoke Layout

A dedicated spoke-based variant where each Section gets its own aisle radiating outward from a central hub area.

**Spatial structure:**
- Two parallel shelf rows form each spoke, flanking a walking aisle
- Games are painted down the spoke from the hub outward, shelves spaced for comfortable walking distance
- Only the **inside (Near) surfaces** of each row are stocked — the Near face of the left row and the Near face of the right row both face the aisle. The `ShelfFace.Near/Far` + `StockSurface` concepts make this natural: the spoke simply orders Near surfaces of both rows interleaved per position along the spoke (see `SpokeStockStrategy` below)
- A central open area is left at the hub — good for a rug, ambient lighting accent, or another detail point

**Mirror-walk ordering (stretch, default-on):**
Games ascend in sort order along the right side of the spoke, and descend along the left — so a player walking down and back sees a continuous sequence rather than retracing it. This is a config option on the spoke layout, enabled by default.

**`SpokeStockStrategy`:**
A third `IStockStrategy` implementation alongside `ArcStockStrategy` and `RowStockStrategy`. Near-only per unit — the Far face of each spoke shelf faces away from the aisle and is unused. Cross-row interleaving (left pos 0, right pos 0, left pos 1, …) is a layout-level concern driven by the order in which `ShelfLayoutCoordinator` emits `ShelfReady` events, not by the strategy itself.

## Stock Strategy Abstraction

Landed in PR #81 (`openclaw/feat-stock-strategy`). `IStockStrategy` in `StockStrategy.ts` defines the interface; current implementations:

- `ArcStockStrategy` — Near-first across all shelves in the arc, then Far (overflow). The default arc behavior, now explicit.
- `RowStockStrategy` — Near-only. The back of a row-layout shelf faces away from the aisle; Far surfaces go unused.
- `SpokeStockStrategy` — *(planned)* Interleaves Near surfaces of two flanking rows per aisle position. See Spoke Layout above.

## Notes / Open Questions

- Dynamic switching requires shelves to be repositionable - check whether current `ShelfRenderer`/`InstancedShelfRenderer` supports in-place position updates or needs rebuild
- The spoke/aisle arrangement (4-6 day estimate) from the Encore list is a natural candidate for pull-forward once two shapes are working
- Layout grouping is related to `ShelfSectionPlanner` - section boundaries may need to be aware of group limits
