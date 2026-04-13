# Layout & Sign Responsibility Plan

**Branch:** `openclaw/feat-layout-enhancements`  
**Status:** Working document — not committed

---

## Context

Sign system fundamentals are done (merged in `openclaw/feat-neon-ui-intermission`):
- `RenderKind` dispatch replaces `SignKind` semantic tracking
- Renderer-owned defaults (`static readonly defaults`)
- Shared types in `SignTypes.ts`
- `bucketSignAnchor()` deleted — callers use shelf position directly

What remains is **responsibility migration**: pulling layout decisions out of
`SceneSignManager` and into the classes that already own the relevant data.

---

## Current ownership problems in SceneSignManager

`SceneSignManager` currently holds:

| State | Belongs to |
|---|---|
| `shelfTransforms` map | `ShelfLayoutCoordinator` already owns this |
| `sortedGames`, `buckets`, `lastPlacedBucket` | a sign coordinator or `ShelfSectionPlanner` |
| `bucketIdentifiers` set | same — caller should track own identifiers |
| `handleGamesSort()` | same |
| `replayTimeBucketSignsFromCreatedShelves()` | same |
| `syncRecentlyPlayedCeilingSign()` | a layout/room coordinator (room-driven) |
| `syncSteamLibraryBlockSign()` | same |
| `handleRoomResized()` | same |

The manager is still a join point for shelf+sort data, which is correct architecture — but
it's doing too much of the *decision* work itself rather than being a pure sign placement service.

---

## Change 1 — Move bucket sign placement to ShelfSectionPlanner

**Status:** Not started

`ShelfSectionPlanner` already:
- listens to `BatchReadyForPlacement`
- owns category sign placement
- knows game-to-shelf mapping

It should also own bucket signs. `SceneSignManager` loses:
- `handleGamesSort()` subscription
- `shelfTransforms` map
- `sortedGames`, `buckets`, `lastPlacedBucket`, `hasRecentlyPlayedData`
- `bucketIdentifiers` set
- `removeBucketSigns()`
- `replayTimeBucketSignsFromCreatedShelves()`
- `placeTimeBucketSignForShelf()`
- `handleShelfCreated()` partially (end-cap labels remain — see Change 3)

`ShelfSectionPlanner` gains:
- subscription to `GamesSort` (cache sorted games + buckets)
- subscription to `ShelfReady` (trigger bucket sign placement per shelf)
- `TimeBucketSignHelpers` usage moved here
- tracking `lastPlacedBucket` and `placedBucketIdentifiers` locally
- calls `SceneSignManager.instance.placeSign('canvas', ...)` directly

**Estimated diff:** −80 lines from SceneSignManager, +60 lines in ShelfSectionPlanner.  
**Risk:** Low. Logic is already isolated in `TimeBucketSignHelpers.ts`.

---

## Change 2 — Move ceiling + block sign placement to a layout/room coordinator

**Status:** Deferred — identified, not ready

`syncRecentlyPlayedCeilingSign()` and `syncSteamLibraryBlockSign()` are driven by
`RoomResized` and respond to room geometry. They don't belong to the sign manager;
they belong to whatever class responds to layout events.

Future home: a new `SignLayoutCoordinator` or the existing `ShelfLayoutCoordinator`
(which already handles room-aware positioning for shelves).

Blocked by: no `RoomCoordinator`/`LayoutCoordinator` to receive the delegation.  
**Leave TODOs in place for now.**

---

## Change 3 — End-cap label ownership

**Status:** Intentionally stays in SceneSignManager — revisit later

End-cap labels (FRONT/BACK shelf orientation signs) need `ShelfTopSurface` data
from `ShelfSurfaceUtils`, driven by `ShelfReady`. They sit at the geometric
intersection of shelf and sign. `SceneSignManager` is a reasonable current home.

Future: when a `ShelfPlacementCoordinator` exists (noted in gamesort plan), end-cap
logic could move there — it has both the shelf transform and surface data.

---

## Change 4 — SignMount attachment math (edge-to-surface)

**Status:** Documented in SignTypes.ts, not implemented

The `SignMount` comment in `SignTypes.ts` describes the intent:
- ceiling signs: top edge of sign to bottom of ceiling plane
- above-shelf signs: bottom edge of sign to top face of shelf bracket

Currently `yOffset` carries a hardcoded manual offset. The right fix is:

1. Add `ISignRenderer.measure(request)` → `{ width: number; height: number }` (sync estimate, no GPU).
2. `SceneSignManager.resolvePosition()` calls `measure()` and uses half-height to compute edge-to-surface offset automatically.
3. Manual `yOffset` becomes optional art-direction override on top of computed position.

This is the foundation for signs that don't need per-sign offset tuning.  
**Scope: medium. Prerequisite for automatic sign stacking/density.**

---

## Change 5 — ShelfSectionPlanner naming and scope

**Status:** Minor — low priority

`ShelfSectionPlanner` is doing two distinct things:
1. Genre section sign placement (category signs per shelf arc position)
2. Will absorb bucket sign placement (Change 1)

After Change 1 it becomes the canonical "which signs go on which shelf" coordinator.
The name is still accurate. No rename needed yet.

---

## Sequence recommendation

1. **Change 1** (bucket signs → ShelfSectionPlanner) — start here, self-contained
2. **Change 4** (SignMount measure) — once layout is cleaner, natural next step
3. **Change 2** (ceiling/block signs → layout coordinator) — needs a coordinator class first
4. **Change 3** (end-cap) — revisit when ShelfPlacementCoordinator exists

---

## What SceneSignManager looks like after Change 1

```
SceneSignManager
  - placeSign(renderKind, descriptor)          ← stays
  - removeSign(id)                             ← stays (private)
  - resolvePosition(anchor, mount)             ← stays
  - buildSignRequest(renderKind, descriptor)   ← stays
  - clearAll() / dispose()                     ← stays
  - syncRecentlyPlayedCeilingSign()            ← stays (for now, TODO(layout))
  - syncSteamLibraryBlockSign()                ← stays (for now, TODO(layout))
  - handleRoomResized()                        ← stays (for now)
  - placeShelfEndCapLabels()                   ← stays
  - placeEndCapLabel()                         ← stays
  - handleShelfCreated()                       ← end-cap only after Change 1
```

Removed from manager after Change 1:
```
  ✗ shelfTransforms
  ✗ sortedGames, buckets, lastPlacedBucket
  ✗ hasRecentlyPlayedData
  ✗ bucketIdentifiers
  ✗ handleGamesSort()
  ✗ removeBucketSigns()
  ✗ replayTimeBucketSignsFromCreatedShelves()
  ✗ placeTimeBucketSignForShelf()
  ✗ GamesSort event subscription
```

---

## Reference: existing TODOs in code

```
SceneSignManager.ts:5    TODO(signage): split bucket-transition + anchor helpers
SceneSignManager.ts:110  TODO(layout): sign positions driven by layout coordinator
SceneSignManager.ts:138  TODO(layout): replace with layout coordinator invalidation
SceneSignManager.ts:289  TODO(layout): position from layout coordinator, not hardcoded
SceneSignManager.ts:290  TODO(layout): sort-driven signs via layout events
SignTypes.ts:22          TODO(layout): attachment intent not yet implemented
```

All of these are addressed by Changes 1–4 in this plan.
