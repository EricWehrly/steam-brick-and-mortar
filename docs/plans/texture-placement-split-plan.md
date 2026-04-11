# Plan: Decouple Texture Loading from Box Placement

**Branch:** `openclaw/feat-texture-placement-split` (off `openclaw/6.2.x` after current PR merges)  
**Priority:** Medium — unlocks cleaner sort-driven rearrangement and removes the batch-ordering ceremony

---

## Problem

`GameBoxSpawner` currently handles two concerns in one synchronous flow:

1. **Placement** — computing world positions from shelf layout and game index
2. **Texture pipeline** — passing position + artwork URL together to `LodArtworkOrchestrator`

Because texture loading is triggered by position, `GpuGameBoxRenderer.createGameBoxFromUrl()` needs a final world position *before* it can start fetching artwork. This means:

- Game boxes can't be pre-allocated until shelf layout is known
- Rearranging boxes after a `GamesSort` event requires touching both the mesh instance *and* re-triggering the texture pipeline
- `GameBoxSpawner`'s pending-games map and `queueMicrotask` ordering trick exist only to hold games until position is available

---

## Goal

Separate the lifecycle into two independent phases:

| Phase | When | What |
|-------|------|-------|
| **Texture prefetch** | As batches arrive (no position needed) | Fetch + decode artwork by appId, hold in texture cache |
| **Instance placement** | On `GamesSort` | Assign mesh instance slots and bind cached textures to positions |

After this, `GamesSort` becomes the single moment that arranges boxes. A re-sort is a position reassignment only — textures are already loaded.

---

## Key Change: Split `setArtworkInstanceFromUrl`

Currently `LodArtworkOrchestrator` has one entry point that takes both position and URL:

```ts
setArtworkInstanceFromUrl(position, name, url, appid, rotation)
```

Split into two calls:

```ts
// Phase 1 — called on batch arrival, no position needed
prefetchArtwork(appid: number, url: string): Promise<void>

// Phase 2 — called on GamesSort, position now known
placeInstance(appid: number, position: Vector3, rotation: Quaternion): void
```

The orchestrator caches decoded textures keyed by `appid`. `placeInstance` looks up the cached texture and writes the GPU instance. If texture is still loading, it queues the placement.

---

## Downstream Simplifications

**`GameBoxSpawner`** dissolves or becomes trivial:
- No more `pendingGames` map
- No more `handleBatchReadyForPlacement`
- `queueMicrotask` in `ShelfLayoutCoordinator` can be removed

**`BatchCoordinator`** emits `AllBatchesComplete` → triggers `GamesSort` → `GamesSort` drives placement. Batch ordering is no longer a concern for the rendering layer.

**`GpuGameBoxRenderer`** subscribes to:
- `BatchReadyForPlacement` → `prefetchArtwork()` for each game in the batch
- `GamesSort` → `placeInstance()` for each game in sorted order

**`ShelfReadyEvent`** carries only layout data (position, rotationY, rowIndex) — no game data passes through it.

---

## Migration Path

1. Add `prefetchArtwork(appid, url)` to `LodArtworkOrchestrator` — loads and caches texture, no instance slot allocated yet.
2. Add `placeInstance(appid, position, rotation)` — allocates slot and binds cached texture (or queues if still loading).
3. Wire `GpuGameBoxRenderer` to call `prefetchArtwork` on `BatchReadyForPlacement`.
4. Wire `GpuGameBoxRenderer` to call `placeInstance` on `GamesSort`.
5. Remove `GameBoxSpawner.handleBatchReadyForPlacement` and `pendingGames`.
6. Remove `queueMicrotask` from `ShelfLayoutCoordinator`.
7. Delete `GameBoxSpawner` if nothing substantive remains, or keep as a thin coordinator if placement math is still useful to isolate.

---

## Risks / Open Questions

- `LodArtworkOrchestrator` currently ties instance slot allocation to texture loading — separating these requires a slot reservation mechanism (allocate slot by appId without a position, fill position later).
- Labels (`InstancedLabelRenderer`) follow the same pattern and will need the same split.
- The `GamesSort` event currently carries sorted game arrays — it would need to include position data too, or `GpuGameBoxRenderer` would need to re-derive positions from shelf layout. Prefer passing positions explicitly to keep rendering ignorant of layout math.

---

## Related

- `docs/plans/gamesort-event-driven-plan.md` — parent plan
- `docs/roadmaps/tech-debt.md` — DataManager memory tracking (related cleanup opportunity)
- Current `GameBoxSpawner` + `BatchCoordinator` will be primary deletion targets
