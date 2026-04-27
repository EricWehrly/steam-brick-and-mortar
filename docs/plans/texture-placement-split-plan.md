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

Separate the lifecycle into two independent signals and let the renderer own the final visual decision:

| Signal | Source | When | What |
|-------|--------|------|------|
| **Artwork readiness** | `ArtworkPrefetchCoordinator` | As batches arrive | Resolve a game's artwork outcome (`prefetched`, `cached`, `permanent-failure`, `error`) |
| **Placement intent** | placement-side coordinator (currently `GameBoxSpawner`) | After sections/shelf layout are known | Publish one or more world-space placement intents for a game |

The renderer should consume both streams and decide, per intent, whether to place a textured box or a label box.

After this, `GamesSort` remains the single moment that arranges boxes, but the artwork-vs-label arbitration no longer lives in `GameBoxSpawner`. A re-sort becomes a placement-intent rebuild only; artwork state is already cached and independently tracked.

---

## Key Change: Renderer-Owned Rendezvous

Currently the split is only half complete:

- `ArtworkPrefetchCoordinator` owns batch-time prefetch state
- `GameBoxSpawner` owns placement intents
- `GameBoxSpawner.tryPlace()` still decides `placeGame()` vs `placeLabelBox()`

That last decision should move downstream. The renderer layer should own the rendezvous between:

1. "A placement intent exists for appId X at position Y"
2. "Artwork for appId X settled with status Z"

`LodArtworkOrchestrator` already exposes the right rendering primitives:

```ts
prefetchArtwork(appid: number, artworkUrl: string, gameName: string): Promise<PrefetchResult>

placeInstance(appid: number, gameName: string, position: Vector3, rotation: Quaternion): number
```

What is missing is an event-driven render coordinator that listens for both readiness signals and executes one of two renderer actions:

```ts
placeInstance(appid, gameName, position, rotation)   // textured path
placeLabelBox(game, position, rotation)              // fallback path
```

---

## Proposed Responsibilities

**Placement-side coordinator**
- Keeps layout math, stock-surface math, and section-to-shelf assignment out of the renderer.
- Emits placement intents only: `game`, `appid`, `position`, `rotation`.
- Does not decide artwork vs label.

**`ArtworkPrefetchCoordinator`**
- Keeps ownership of batch-time artwork resolution and fallback-summary logging.
- Emits artwork outcomes only: `appid`, `gameName`, `result`.
- Does not know about world positions.

**Renderer-side rendezvous coordinator**
- Subscribes to artwork-outcome and placement-intent events.
- Tracks pending state keyed by `appid`.
- When both sides are ready, decides textured box vs label box.
- Supports one artwork outcome satisfying multiple placement intents.

**`GpuGameBoxRenderer`**
- Remains ignorant of shelf math and grouping.
- Exposes the two concrete render operations.
- May itself host the rendezvous state, or a small renderer-adjacent coordinator can own it and call into `GpuGameBoxRenderer`.

**`ShelfReadyEvent`** carries only layout data (position, rotationY, rowIndex) — no game data passes through it.

---

## Event Shape

Do not make the renderer re-derive placement from `SectionsReady`; that would push layout knowledge into the rendering layer. Prefer explicit readiness events.

Suggested event seams:

```ts
GameRenderEventTypes.ArtworkIntentSettled
GameRenderEventTypes.PlacementIntentReady
```

Suggested payloads:

```ts
interface ArtworkIntentSettledEvent {
	appid: number
	gameName: string
	result: 'prefetched' | 'cached' | 'permanent-failure' | 'error'
}

interface PlacementIntentReadyEvent {
	appid: number
	game: SteamGameData
	position: THREE.Vector3
	rotation: THREE.Quaternion
}
```

One settled artwork event may satisfy many placement intents; this directly supports multi-group placement.

---

## Migration Path

1. Introduce explicit render-intent event types and payloads for artwork outcomes and placement intents.
2. Make `ArtworkPrefetchCoordinator` emit `ArtworkIntentSettled` when a game's artwork result resolves.
3. Replace `GameBoxSpawner.tryPlace()` with placement-intent emission only; stop calling `placeGame()` / `placeLabelBox()` directly there.
4. Add a renderer-side rendezvous coordinator that buffers by `appid`:
   - artwork outcome: one value per appid
   - placement intents: many values per appid
5. When both sides are available, have the rendezvous coordinator call:
   - `renderer.placeInstance(...)` for `prefetched` / `cached`
   - `renderer.placeLabelBox(...)` for `permanent-failure` / `error`
6. Keep `clearPlacements()` and re-sort behavior in the placement flow; add a matching reset for renderer-side pending placement intents on section rebuild.
7. Once the event-driven rendezvous is stable, decide whether `GameBoxSpawner` should be split into a pure placement coordinator or deleted entirely.

---

## Risks / Open Questions

- The renderer should not subscribe directly to `SectionsReady` unless the event already carries final positions. Re-deriving layout inside rendering would be a regression in ownership.
- `placeInstance()` currently warns on missing prefetched texture. Once artwork outcomes become explicit, that warning path should become truly exceptional rather than part of normal fallback flow.
- Labels already live behind `GpuGameBoxRenderer.placeLabelBox()`, which is good; the main migration risk is avoiding duplicate placement when both the old `tryPlace()` path and the new render-intent path coexist.
- Reset semantics must be clear: a layout/group/sort change should clear pending placement intents and live GPU placements without discarding prefetched artwork outcomes.

---

## Recommended First Slice

Do this in the smallest bisectable step:

1. Add render-intent events.
2. Keep all existing state owners in place.
3. Change `ArtworkPrefetchCoordinator` to emit artwork-outcome events.
4. Change `GameBoxSpawner` to emit placement-intent events instead of placing directly.
5. Add a small renderer-side coordinator that listens to both and performs the existing `placeGame()` / `placeLabelBox()` calls.

That proves the architecture without simultaneously deleting `GameBoxSpawner` or moving shelf math.

---

## Related

- `docs/plans/gamesort-event-driven-plan.md` — parent plan
- `docs/tech-debt.md` — DataManager/memory tracking related cleanup opportunity
- Current `GameBoxSpawner` + `BatchCoordinator` will be primary deletion targets
