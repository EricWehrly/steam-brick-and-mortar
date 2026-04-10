# WORK: GameSorter -> GamesSort Event -> Sign/Shelf Commissioning

**Branch:** `openclaw/feat-event-driven-sort` (from `origin/openclaw/6.2.x`)  
**Status:** Design draft — ready for review before implementation

---

## Problem Statement

Right now, the flow from "games arrive" to "signs appear" is procedural and scattered:

1. `GpuStorePropsRenderer.handleAllBatchesComplete()` calls `SceneSignManager.placeTimeBucketSigns(...)` directly, passing raw position/rotation arrays, all games, and the ceiling sign position.
2. `placeTimeBucketSigns` performs sort, bucket assignment, and sign placement internally in `SceneSignManager`.
3. Shelf commissioning (which shelf gets which games) is baked into `handleShelfSpaceRequested` / `createShelfForBatchIndex` — tightly coupled to batch indices.

This means: **sign logic is driven by the renderer**, shelves are assigned games by batch order, and there's no central event that says "here is the sorted, bucketed game list."

---

## Intended Architecture

```
SteamGameData arrives
        │
        ▼
  [GameSorter]
  sorts + buckets all games
  emits  GameEventTypes.GamesSort
        │
        ▼
 [ShelfCommissioner]
 assigns sorted games -> shelves
 emits per-shelf readiness (StorePropsEventTypes.ShelfReady)
        │
        ▼
 [SceneSignManager]
 listens for ShelfReady (+ GamesSort context)
 places signs when shelf transform is authoritative
```

Decision: `SceneSignManager` should be downstream of a shelf-owned readiness event (`ShelfReady`) rather than reading positional snapshots from DataManager.

**Key principle:** `GpuStorePropsRenderer` stops caring about sort order, signs, and shelf drawing. Shelf rendering ownership moves to a dedicated `ShelfRenderer` class. `GpuStorePropsRenderer` becomes orchestration/event glue only.

---

## New Event: `GameEventTypes.GamesSort`

```ts
export interface GamesSortEvent extends BaseInteractionEvent {
    /** All games, sorted in display order (recently-played first, then by genre/playtime). */
    sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    /** Bucket assignments: maps each game's appid to its bucket label. */
    buckets: ReadonlyMap<number | string, string>
    /** Whether recency data is present (gates recently-played signage). */
    hasRecentlyPlayedData: boolean
}

// Add to GameEventTypes const:
GamesSort: 'game:games-sort'
```

---

## New Class: `GameSorter`

```ts
// src/scene/categorization/GameSorter.ts

// Responsibilities:
// - Listens for AllBatchesComplete
// - Reads all games from DataManager
// - Sorts by recently-played first, then genre/playtime
// - Computes bucket assignments (RecentlyPlayedBucket per game)
// - Emits GamesSort event
// - Does nothing else
```

Fires once per game-load session, after `AllBatchesComplete`.

---

## Changes to `SceneSignManager`

- **Remove** `placeTimeBucketSigns(shelfPositions, shelfRotationsY, games, ceilingPos)` (it takes raw game + position arrays, which is the smell).
- **Add** `onGamesSort(event: GamesSortEvent)` — registered as an event handler in constructor.
  - Places time-bucket signs using `event.buckets`
  - Places `RecentlyPlayedCeilingSign` if `event.hasRecentlyPlayedData`
- `SceneSignManager` joins semantic data from `GamesSort` with physical authority from `ShelfReady`.

### Shelf position source decision

Use **Option C**:
- `SceneSignManager` subscribes to `StorePropsEventTypes.ShelfReady`
- Shelf producer includes canonical transform payload
- Sign placement happens only after readiness for each shelf

Why:
- avoids stale positional snapshots in DataManager
- keeps ownership with shelf lifecycle
- robust against ordering/timing changes

---

## New Class: `ShelfRenderer`

```ts
// src/scene/shelves/ShelfRenderer.ts

// Responsibilities:
// - Own shelf mesh/instancing creation + updates
// - Handle shelf draw/update events from renderer pipeline
// - Emit ShelfReady with authoritative transform payload once shelf is finalized
// - Expose minimal API to orchestration layer (create/update/dispose)
```

This explicitly takes shelf drawing responsibility out of `GpuStorePropsRenderer`.

---

## Changes to `GpuStorePropsRenderer`

Remove from `handleAllBatchesComplete`:

```ts
// REMOVE:
const games = DataManager.getInstance().get<SteamGameData[]>('steam.games') ?? []
const hasRecentlyPlayedData = games.some(g => (g.rtime_last_played ?? 0) > 0)
if (hasRecentlyPlayedData) {
    this.recentlyPlayedSign.place()
    SceneSignManager.instance.placeTimeBucketSigns(...)
}
```

Also remove `this.recentlyPlayedSign` ownership (move to `SceneSignManager` or a sign coordinator).

After this, `handleAllBatchesComplete` should only finalize loading + emit/schedule lifecycle events.

Also remove shelf drawing responsibilities from this class; forward shelf draw/update work to `ShelfRenderer`.

---

## ShelfCommissioner (future / not this PR)

The deeper coupling — games assigned to shelves by batch index — is a separate concern. Full fix is a `ShelfCommissioner` that listens to `GamesSort` and assigns games to shelf slots in sorted order.

**Out of scope for this PR**. Keep as follow-on.

---

## Affected Files

| File | Change |
|------|--------|
| `src/types/InteractionEvents.ts` | Add `GamesSortEvent`, `GamesSort` event type |
| `src/scene/categorization/GameSorter.ts` | **New file** |
| `src/scene/SceneSignManager.ts` | Remove `placeTimeBucketSigns`; add `onGamesSort` + `onShelfReady` handlers |
| `src/scene/shelves/ShelfRenderer.ts` | **New file**; owns shelf drawing + ShelfReady emission |
| `src/scene/GpuStorePropsRenderer.ts` | Remove sign calls and shelf drawing ownership; orchestration only |
| `src/scene/props/PropsEvents.ts` | Add `ShelfReady` event type + payload contract |
| `src/scene/RecentlyPlayedCeilingSign.ts` | Ownership move to `SceneSignManager` (minor) |

---

## Tests

- Unit: `GameSorter` emits `GamesSort` with correct sorted order and buckets
- Unit: `SceneSignManager.onGamesSort` places correct bucket signs
- Unit: `SceneSignManager` skips recently-played signs when `hasRecentlyPlayedData = false`
- Unit: `ShelfRenderer` emits `ShelfReady` with minimal transform payload
- Integration: `GpuStorePropsRenderer.handleAllBatchesComplete` no longer calls `placeTimeBucketSigns`
- Integration: `GpuStorePropsRenderer` delegates shelf drawing to `ShelfRenderer`
- Existing `SceneSignManager` mount/math tests remain green

---

## Decisions (resolved in workspace review)

1. **GameSorter naming:** Keep `GameSorter` for now. If bucketing grows beyond this scope, split later.
2. **RecentlyPlayedCeilingSign ownership:** Move to `SceneSignManager` now.
3. **`ShelfReady` payload shape:** Keep minimal payload (`shelfId`, `position`, `rotationY`).
4. **Timing/join:** `ShelfReady` flow should start only after `GamesSort` completes (no independent race/join layer for this phase).
5. **Shelf drawing ownership:** Introduce `ShelfRenderer` to take shelf rendering work out of `GpuStorePropsRenderer`.

---

## What This Is NOT

- Not changing shelf assignment logic yet (batch-order coupling remains)
- Not changing arc layout math
- Not introducing test infra changes

---

## Implementation Status (2026-04-10)

**Branch status: merge-ready.**

### Implemented in this branch

- `GameSorter` emits `GameEventTypes.GamesSort` after `AllBatchesComplete`.
- `SceneSignManager` reacts to `GamesSort` + shelf events (incremental placement, no bulk post-pass).
- `ShelfLayoutCoordinator` now owns arc layout math and shelf bounds emission (`ShelfLayoutDetermined`).
- **Progressive shelf spawn restored:** layout is computed on first `BatchReadyForPlacement` (using `totalBatches`), then each arriving batch index triggers its corresponding `ShelfReady` emission.
- `InstancedShelfRenderer` now self-subscribes to `ShelfReady` and writes shelf instances directly.
- `GpuStorePropsRenderer` no longer owns shelf placement math; it listens for `ShelfReady` and emits `ShelfCreated` for downstream consumers.
- `ShelfRenderer` wrapper removed (deleted) to avoid redundant ownership layers.
- `GameBoxSpawner` stays decoupled and batch-index driven (`BatchReadyForPlacement` store, `ShelfCreated` consume).
- Event seams remain clean (`EnvironmentEvents.ts` + `EventTypeMap.ts`).

### Current event model

- **Layout/physical path:** `BatchReadyForPlacement` (first batch) → `ShelfLayoutCoordinator` computes layout + emits `ShelfLayoutDetermined`; each subsequent batch triggers `ShelfReady` for that shelf id.
- **Shelf render path:** `ShelfReady` → `InstancedShelfRenderer` (GPU instance write).
- **Placement/sign path:** `ShelfReady` → `GpuStorePropsRenderer` emits `ShelfCreated` → `GameBoxSpawner` places boxes + `SceneSignManager` places signs.
- **Sorting/semantic path:** `AllBatchesComplete` → `GameSorter` emits `GamesSort` (labels/sign semantics and future reorder source).

### Planned next branch

1. **Explicit `LayoutChanged` event** (separate from initial `ShelfLayoutDetermined`) for runtime relayout and future layout modes.
2. **Post-sort box reorder pass**: apply `GamesSort` ordering to already-instantiated shelves (reflow/reassign shelf slots).
3. **Shelf reuse/update policy** for layout changes (idempotent shelfId updates, optional animation).
4. **Sign math extraction** from `SceneSignManager` into focused helpers (bucket transition + anchor generation).
5. **Optional UX polish**: animated shelf relayout and game-box reorder transitions.

### Multi-sign-type notes

Neon tube signs (`feat-neon-sign-v2` branch) can integrate when ready:
- Add `'neon-tube'` to `SignKind` union
- `SignRecord.mesh` is `THREE.Object3D`-compatible; no structural changes needed
- Add `setNeonSign()` for neon-specific config (glow, text)
- `clearByKind('neon-tube')` handles cleanup
