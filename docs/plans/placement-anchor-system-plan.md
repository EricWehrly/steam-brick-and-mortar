# Placement Commonality — Deferred Survey

**Status**: Deferred — not designing a shared system yet. Kept as a grounded code survey for
whenever there's real commonality to extract from, not a build plan.
**Scope decision (2026-07-23, revised)**: an earlier pass at this doc proposed building a shared
`AnchorZone`/`AnchorZoneRegistry` system now, ahead of any second real placer existing. On review,
that generalized from one real implementation (`UserPropPlacer`'s shelf-anchor logic) plus
hypothetical future consumers — not from two or more real placers compared side by side. Reversed:
build placers **per prop type**, the same way `UserPropPlacer` already does for shelf-cap props,
and revisit sharing once there's a second (and maybe third) real one to compare against.
**First concrete placer being built under this decision**:
[Wall Poster Placement Plan](wall-poster-placement-plan.md).

## Why this doc still exists

`fabricated-set-dressing.md`'s "The shared dependency: a placement system" section and a matching
stub in `scene-clutter-and-props.md` both flagged the same gap: sourcing/modeling decorative props
is the easy part, **where fixtures go** is the real unbuilt engineering. That observation is still
true, but the fix isn't a shared abstraction designed in the abstract — it's building the second
and third real placer and then looking at what they actually have in common. This doc keeps the
code survey below (still accurate, still useful grounding for that future comparison) and drops
the speculative `AnchorZone` design that used to follow it.

## Current state (confirmed by code)

- **Room geometry** (`client/src/scene/RoomManager.ts`): one generic, config-driven room shape —
  four flat `THREE.PlaneGeometry` walls + floor + ceiling, no per-variant branching (room variants
  are "Not Started" per `room-variants.md` — there's only ever one room shape today). Geometry
  becomes knowable once `RoomEventTypes.Resized` fires (`{dimensions, shelfLayout, centerOffset}`),
  computed in `computeRoomEnvelopeFromShelfBounds()` (`RoomManager.ts:41-72`) from the shelf
  layout's bounds. `StorePropsCoordinator.handleRoomResized` (`StorePropsCoordinator.ts:176-221`)
  already consumes this same event to place the entrance mat — the precedent every per-type placer
  (including the poster one) follows.
- **Shelf layout** (`client/src/scene/props/shared/ILayoutDefinition.ts` +
  `LayoutRegistry.ts:20-24`): a strategy-pattern pair per layout mode (arc/row/spoke), each
  providing a stock strategy (which surfaces fill, in what order) and shelf positions. World space
  is meters, player at origin facing -Z, Y-up (`RowLayoutUtils.ts:6-16`). Orchestrated by the
  `ShelfLayoutCoordinator` singleton, which accumulates `shelfBounds` and emits one `ShelfReadyEvent`
  per shelf plus a final `ShelfLayoutDeterminedEvent`. Known shelf footprint: `hw=1.0, hd=0.5`
  (`ShelfLayoutCoordinator.ts:114`).
- **Every prop today hardcodes its own position math, self-contained per prop type** —
  `UserPropPlacer.ts` builds a **private** `shelfAnchors` map from `ShelfReadyEvent` and a
  weighted-random `claimShelfAnchor()` (lines 335-404): front-center weight + a spread/repulsion
  weight against already-used anchors, to express an aesthetic preference (cluster toward the
  player, don't cluster onto neighboring shelves) without any shared placement infrastructure.
  This is the pattern to keep repeating per prop type, not the thing to generalize away from yet.
- **Liminal mode is designed but not built** (`liminal-mode.md`, "Not Started"). The locked design:
  quality is a row-index band (current row ±1 = full quality; everything else = "projected" —
  unlit, `castShadow=false`, `receiveShadow=false`), assigned **per row at recycle time**, not
  per-frame. Any future placer tied to a specific shelf row should expose that row index so
  liminal mode can flip its material the same pass it flips shelf/box materials, once liminal mode
  lands. Not relevant to the wall poster placer (no shelf row), but worth remembering for a future
  shelf-adjacent placer.

## Revisit trigger

Come back to "is there a shared system worth extracting" once **two or more real placers** exist
side by side — e.g. `UserPropPlacer` (shelf-cap props) plus the wall poster placer, and maybe a
third (counter fixtures, standees). At that point, compare what they actually share (wall vs. shelf
vs. floor geometry access, aesthetic-preference math, occupancy bookkeeping) instead of guessing
from one implementation and a wishlist. Until then, each new prop family gets its own
self-contained placer, following `UserPropPlacer`'s shape: subscribe to the room/shelf events it
needs, own its own occupancy, express its own aesthetic preference directly.

## Related

- [Fabricated Set Dressing](../features/fabricated-set-dressing.md) — "The shared dependency: a
  placement system" section, updated to point here
- [Scene Clutter & Props (harvested)](../features/scene-clutter-and-props.md) — the sibling doc
  with a matching stub, updated the same way
- [Wall Art & Framed Posters](../features/wall-art-framed-posters.md) — [Wall Poster Placement
  Plan](wall-poster-placement-plan.md) is this decision's first concrete placer
- [Liminal Mode](../features/liminal-mode.md) · [Room Variants](../features/room-variants.md) — not
  yet built; noted above for whenever a shelf-row-aware placer needs them
- `client/src/scene/RoomManager.ts`, `client/src/scene/shelves/ShelfLayoutCoordinator.ts`,
  `client/src/scene/props/shared/ILayoutDefinition.ts`, `client/src/scene/props/UserPropPlacer.ts`,
  `client/src/scene/props/StorePropsCoordinator.ts` — code surveyed above
