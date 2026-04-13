# Feature: Layout Variations

**Act**: 2 (Best Effort)
**Status**: In Progress (arc layout complete; dynamic switching and grouping not yet implemented)
**Priority**: Medium

## Goal

Support multiple shelf layout shapes with dynamic switching at runtime — so the store can be rearranged without a reload, and different organizational styles can be explored or offered as a user preference.

## Context

The concentric-arc layout was built during Act 1 as the primary spatial arrangement. It works well, but it's currently the only option and it's baked in. The vision is a layout system where shapes are first-class, switchable, and composable — the same way sort modes are first-class and switchable.

"Layout" here means the macro-level arrangement of shelves in the store, not the placement of individual game boxes on a shelf (that's the sort/placement pipeline).

## Layout Shapes (planned)

- **Arc / concentric rings** — current implementation; shelves arranged in arcs radiating from the player
- **Square rows** — traditional grid rows; simpler, more "video store" feeling; the pre-arc default
- **Other simple shapes** — spokes, chevron, etc.; TBD based on what feels good

## Grouping

Layouts should support a "group size" concept: a shape (arc, square, etc.) applies to a group of N shelves, then repeats or transitions. For example: arcs of 4 shelves, spaced to form natural browsing aisles. This enables richer spatial organization without requiring a fully custom algorithm per layout.

## Dynamic Switching

Changing layout mode should reposition shelves live — similar to how sort mode change (will eventually) reposition game boxes. This implies:
- Layout mode is a runtime state, not a build-time decision
- Shelves can be repositioned without a full scene teardown/respawn
- Transition behavior TBD (instant snap vs. animate)

## Acceptance Criteria

- Arc layout continues working as-is
- Square row layout implemented and switchable at runtime
- Layout mode is selectable (UI affordance TBD — could be part of the sort/layout panel)
- Grouping parameter (shelves per group) is configurable
- Layout change repositions shelves without full scene reload

## Stories / Tasks

- Extract arc layout algorithm into a named, swappable `ILayoutStrategy` (or equivalent)
- Implement square row layout as a second strategy
- Wire layout mode into the sort/layout panel (next to sort mode selector)
- Implement dynamic shelf repositioning on layout change
- Define and implement grouping parameter

## Notes / Open Questions

- Dynamic switching requires shelves to be repositionable — check whether current `ShelfRenderer`/`InstancedShelfRenderer` supports in-place position updates or needs rebuild
- The spoke/aisle arrangement (4–6 day estimate) from the Encore list is a natural candidate for pull-forward once two shapes are working
- Layout grouping is related to `ShelfSectionPlanner` — section boundaries may need to be aware of group limits
