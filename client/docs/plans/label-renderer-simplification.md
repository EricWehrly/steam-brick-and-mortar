# Label Renderer Simplification

_Written 2026-04-17. Branch context: `openclaw/first-run-transition`._

---

## 1. Current Implementation

`InstancedLabelRenderer` renders game-title text boxes as a `THREE.InstancedMesh` backed by a `THREE.DataArrayTexture`. Each slice of the texture array is a canvas-rendered label for one game. It is owned by `GpuGameBoxRenderer`, constructed alongside the LOD artwork renderer, and added to the scene via `GpuGameBoxRenderer.addToScene()`.

**Label creation path (in `GpuGameBoxRenderer`):**

```
createGameBoxFromUrl()
  → lodArtworkRenderer.setArtworkInstanceFromUrl() [async, worker]
  → .then(result)
      if result.permanent && EnableLabels:
          createLabelGameBox()
              → instancedLabelRenderer.addLabelInstance()

createGameBoxAuto()  [synchronous path]
  → if no artwork URL:
      createLabelGameBox()
          → instancedLabelRenderer.addLabelInstance()
```

**`addLabelInstance()`** has two branches:

1. **Deferred path** (`deferLabels === true`): pushes into `pendingLabels[]` — a buffer of `{gameName, appid, position, side, rotation}`. Returns immediately, nothing touches GPU.
2. **Immediate/lazy path** (`deferLabels === false`): lazy-initializes the renderer on first call (allocates `InstancedMesh` + `DataArrayTexture` sized to `maxInstances`), then writes the label directly and calls `updateGPU()`.

**`materializeLabels()` (private):** The deferred path's flush. Right-sizes the texture array to `pendingLabels.length + DEFERRED_OVERFLOW`, allocates everything, replays all pending labels. Guards: bails if `isInitialized` or `pendingLabels.length === 0`.

**`LabelTextureArrayManager`** manages the `DataArrayTexture`: a flat `Uint8Array` of `width × height × maxDepth × 4` bytes. No resize/compact — fixed at construction time.

---

## 2. Why It Was Complex

The deferred path was designed to avoid pre-allocating a large texture array before knowing how many labels would actually be needed. For an 835-game library with 100 CORS failures, a naively pre-allocated array sized to `maxGames` wastes ~55 MB unnecessarily.

The mechanism depended on one assumption: **all permanent artwork failures would be known by `AllBatchesComplete`**. That held when all games loaded synchronously before batching. It broke with progressive emission: `AllBatchesComplete` fires when all games are *placed*, but CDN artwork fetches are async. CORS/404 `.then()` callbacks resolve *after* `AllBatchesComplete`. So `materializeLabels()` always ran on an empty `pendingLabels` and no-op'd.

---

## 3. Current State After Fix

`deferLabels` is initialized to `false`. Labels are added immediately via lazy-init on first call. The initial texture array is sized to `maxInstances` (currently `maxGames + 100` passed in from `GpuGameBoxRenderer`), which is over-allocated for the label case but functional.

**Dead code that remains:**
- `deferLabels: boolean` field (always false, never toggled)
- `pendingLabels: Array<...>` field (always empty)
- `static readonly DEFERRED_OVERFLOW` constant
- `materializeLabels()` method (private, subscribed to `AllBatchesComplete`, always no-ops)
- `boundMaterializeLabels` bound handler (registered and deregistered in dispose, never does anything)

`handleSomeBatchesComplete` — separate handler, still wired up; worth auditing whether it's still functional or also vestigial.

---

## 4. Proposed Simplification

Three viable paths, in order of complexity:

---

### Option A — Trim-to-actual (restore original intent, fix the timing)

Keep the deferred approach but fire it at the right time: **after all artwork fetches settle**, not at `AllBatchesComplete`.

The problem was *when* `materializeLabels()` fired, not *what* it did. If artwork fetches were awaited or counted, we'd know the true failure count and could right-size then.

**Rough approach:**
- `GpuGameBoxRenderer` tracks in-flight artwork promises (it already does this implicitly via `.then()` chains).
- When the last fetch settles (or after a short debounce post-`AllBatchesComplete`), call `instancedLabelRenderer.compact()`.
- `compact()` on `LabelTextureArrayManager`: dispose the over-allocated `DataArrayTexture`, create a new one sized to `currentCount`, re-upload. Similar to `LodTextureArrayManager.compactMidTier()` which already exists for the artwork side.

**Memory profile:** Peaks at `maxGames × 128 × 128 × 4` bytes (~55 MB for 835 games) during load, then drops to `actualLabelCount × 128 × 128 × 4` (~0.7 MB for 100 labels). Transient spike is acceptable at startup.

**Complexity:** Medium. Requires a `compact()` on `LabelTextureArrayManager` and a trigger point in `GpuGameBoxRenderer`. The debounce approach is simplest (e.g. 5s after `AllBatchesComplete`).

---

### Option B — Lambda-assisted pre-sizing (richer, future-facing)

The Lambda already fetches Steam Store metadata per game. It could additionally track which library art URLs return 200 vs error for known appids — essentially a failure cache.

If the Lambda response included an estimated or cached `knownArtworkFailureCount`, `GpuGameBoxRenderer` could size the label texture array accurately before any fetches fire, completely eliminating the over-allocation.

**This is worth doing for CDN efficiency too** — if the Lambda knows a game has no working library art, the client doesn't need to fire the CDN fetch at all. That directly addresses the staggered-loading concern.

**Complexity:** Larger scope. Lambda changes + client-side changes. Aligns well with the staggered-loading/re-sort work planned for a later branch.

---

### Option C — Size to maxGames, document it (simplest, lowest priority)

Just pre-allocate to `maxGames` and leave it. With dev cap at 20 games, that's ~1.3 MB. With the full library at 835, ~55 MB. With `DataArrayTexture` on a GPU, this is VRAM, not JS heap — Quest 2 (4 GB shared) has ~6% of its budget consumed. Acceptable but not ideal.

Remove all deferred code, keep the lazy-init path, done. One clear code path, no compact needed.

**Verdict:** Fine as a stopgap but wastes VRAM on low-end headsets. Not recommended as the final state.

---

### Recommended path

**Short term (this or next branch):** Option A — implement `LabelTextureArrayManager.compact()` and trigger it from `GpuGameBoxRenderer` after artwork settles (debounce or promise tracking). This restores the original intent with a working trigger.

**Medium term:** Option B — Lambda tracks known artwork failures. Informs client pre-sizing and eliminates unnecessary CDN fetches. Dovetails naturally into the staggered-loading and re-sort work.

---

### Dead code to remove regardless of which option is chosen

- `deferLabels` field
- `pendingLabels` field
- `DEFERRED_OVERFLOW` constant
- `materializeLabels()` method
- `boundMaterializeLabels` and its event registration/deregistration
- The `AllBatchesComplete` subscription in `InstancedLabelRenderer`

Audit `handleSomeBatchesComplete` before removing — it may still serve a purpose.

---

## 5. Re-Sort Compatibility

Re-sort will reorder game boxes by a different criterion. Labels are game boxes — placed at the position of the failed artwork slot at the time of failure.

**Current repositioning support:** None. `InstancedMesh` positions are written once via `setMatrixAt`, never updated. No API to move an existing label by appid.

**What's needed for re-sort:**
- A live `appid → instanceIndex` map (partially exists in `DataManager` via `InstancedLabelMetadata`).
- A `setLabelPosition(appid, newPosition, newRotation)` method calling `setMatrixAt` + `instanceMatrix.needsUpdate = true`.
- The LOD artwork renderer has the same requirement — address both together in the re-sort branch.

**Impact on simplification:** The compact (Option A) approach means the `InstancedMesh` is recreated after compaction. If re-sort fires after compact, repositioning works against the final correctly-sized mesh. If re-sort could fire before compact... that's a sequencing concern to design around, but compact is a one-time startup operation so in practice it won't conflict.

---

## Open Questions

- Is `handleSomeBatchesComplete` still doing anything useful in `InstancedLabelRenderer`?
- Compact trigger: debounce after `AllBatchesComplete`, or explicit promise tracking in `GpuGameBoxRenderer`?
- Should `maxLabels` be a separate config from `maxGames` for VRAM budgeting on Quest 2?
- Lambda failure cache: which branch owns this? Aligns with staggered-loading work.
