# Plan: Re-sort Game Placement via GpuGameBoxRenderer → ShelfLayoutCoordinator

**Status**: Planned  
**Branch**: TBD (new branch from `openclaw/feat-layout-enhancements` after current PR merges)  
**Related**: `docs/plans/texture-placement-split-plan.md`, `docs/tech-debt.md` → Act 2-linked sorting/layout debt context

---

## Problem

Changing sort mode moves signs (✅) but leaves game boxes and shelves exactly where they were placed during initial load. `GamesSort` is emitted but nothing downstream re-places game instances or re-lays out shelves.

Root cause: texture loading and instance placement are the same operation in `GpuGameBoxRenderer`. `GameBoxSpawner` calls `createGameBox()` once per game during initial load; there is no mechanism to reposition boxes without destroying and re-creating GPU resources.

---

## Goal

After a `GamesSort` event, game boxes appear on their shelves in the new sorted order — without re-fetching artwork or destroying the instanced mesh atlas.

---

## Approach

Split `GpuGameBoxRenderer` into two phases:

1. **Load phase** (happens once per game, by `appid`): fetch artwork, reserve an atlas slot, upload texture. Result cached by `appid`.
2. **Place phase** (happens on every `GamesSort`): assign each game's cached slot to a world position from the current shelf layout.

This matches the architecture described in `docs/plans/texture-placement-split-plan.md`.

---

## Step-by-Step

### 1. `GpuGameBoxRenderer` — expose `placeInstance(appid, worldPosition, rotationY)`

Currently `createGameBox()` (or `createGameBoxAuto()`) does both: allocates an atlas slot, loads artwork, and sets the instance transform. Split this:

```ts
// Existing (internal): allocate slot + load artwork for a game
public async prewarmGame(game: SteamGameData): Promise<void>

// New: assign a world position to an already-loaded game
public placeInstance(appid: number, worldPosition: THREE.Vector3, rotationY: number): void

// New: clear all instance positions (reset between re-sorts)
public clearPlacements(): void
```

`prewarmGame()` is idempotent — calling it again for a game already loaded is a no-op. `placeInstance()` sets the instance matrix without touching the texture atlas. `clearPlacements()` zeroes all instance transforms (hides them) without releasing atlas slots.

**File**: `client/src/scene/game-box/GpuGameBoxRenderer.ts`

---

### 2. `GameBoxSpawner` — separate prewarm from placement

`GameBoxSpawner` currently handles `BatchReadyForPlacement` and `ShelfReady` together, placing games as shelves arrive. Split the handler:

- On `BatchReadyForPlacement`: call `prewarmGame()` for each game. Don't place yet.
- On `GamesSort`: call `clearPlacements()`, then iterate `sortedGames` in order, assigning each game to a world position derived from shelf layout.

The shelf positions needed for placement must be available by the time `GamesSort` fires. `ShelfLayoutCoordinator` already stores these (it emits `ShelfReady` with position per shelf). `GameBoxSpawner` should cache shelf positions from `ShelfReady` events — same pattern `ShelfSectionPlanner` now uses for signs.

**File**: `client/src/scene/spawning/GameBoxSpawner.ts`

---

### 3. `ShelfLayoutCoordinator` — expose shelf position list for re-layout

`ShelfLayoutCoordinator` currently emits `ShelfReady` per shelf and discards positions. It needs to either:

- (a) Keep a `shelfPositions: Map<number, {position, rotationY}>` and expose it for `GameBoxSpawner` to query, or
- (b) Re-emit `ShelfLayoutDetermined` on `GamesSort` with an updated position list if game count changes

For the first iteration, (a) is simpler: `GameBoxSpawner` accumulates positions from `ShelfReady` (already doing this for `pendingGames`), then uses them on `GamesSort`. No changes to `ShelfLayoutCoordinator` needed initially.

**File**: `client/src/scene/shelves/ShelfLayoutCoordinator.ts` — likely read-only for phase 1

---

### 4. `GpuStorePropsRenderer` / `SceneCoordinator` — ensure `GameSorter` runs after prewarm

`AllBatchesComplete` currently triggers `GameSorter.sortByRecentlyPlayed()` immediately. That's fine — at that point all games have been prewarmed (prewarm is fast; it's async artwork loading, not blocking). The `GamesSort` event fires after, driving placement.

For re-sorts triggered by the UI (`SortRequested` event → `GameSorter`), the same path applies: `GamesSort` emits, `GameBoxSpawner` handles it.

**No change needed here for phase 1.** Document the ordering assumption.

---

### 5. `ShelfSectionPlanner` — no changes needed

Signs are already driven by `GamesSort` + cached `shelfPositions`. This refactor doesn't affect sign placement.

---

## Event Flow (after refactor)

```
Initial load:
  BatchReadyForPlacement → GameBoxSpawner.prewarmGame() × N
  ShelfReady             → GameBoxSpawner caches {batchIndex → position}
  AllBatchesComplete     → GameSorter.sortByRecentlyPlayed()
  GamesSort              → GameBoxSpawner.clearPlacements()
                         → GameBoxSpawner.placeInstance() × N (sorted order)
                         → ShelfSectionPlanner (signs, unchanged)

Re-sort:
  SortRequested (UI)     → GameSorter.sortByXxx()
  GamesSort              → GameBoxSpawner.clearPlacements()
                         → GameBoxSpawner.placeInstance() × N (new sorted order)
                         → ShelfSectionPlanner (signs cleared + re-placed)
```

---

## Files Affected

| File | Change |
|------|--------|
| `client/src/scene/game-box/GpuGameBoxRenderer.ts` | Add `prewarmGame()`, `placeInstance()`, `clearPlacements()` |
| `client/src/scene/spawning/GameBoxSpawner.ts` | Split `BatchReadyForPlacement` (prewarm) from `GamesSort` (place); cache shelf positions from `ShelfReady` |
| `client/src/scene/shelves/ShelfLayoutCoordinator.ts` | Likely no changes for phase 1 |
| `client/src/scene/GpuStorePropsRenderer.ts` | Verify ordering assumptions; add comment |

---

## Out of Scope (this plan)

- Variable shelf count on re-sort (if game count changes across sort modes, shelf layout may need to re-run — deferred)
- Shelf layout re-run on re-sort (shelves always placed from initial `AllBatchesComplete` game count — sort changes order, not count)
- LOD/artwork quality changes across re-sort (textures are cached by `appid`, LOD distances unchanged)
