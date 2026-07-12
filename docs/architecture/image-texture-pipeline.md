# Image/Texture Pipeline - Complete Data Flow Documentation

**Rewritten 2026-07-11.** The previous version of this doc (ImageManager + TextureWorker as two parallel
paths, `LodArtworkRenderer` as the top-level class) was stale — that architecture was replaced by the one
described below, discovered during an audit for
[Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) (now archived —
all 4 phases done). `ImageManager.ts` no longer exists in the codebase.

## Overview

The Steam Brick and Mortar project has a multi-layer caching and texture management system that moves
game artwork from Steam's CDN to GPU texture arrays. This document traces the complete data flow from
source to render.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              IMAGE/TEXTURE PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│   [Steam CDN URLs]  ────►  [GameArtworkProvider]  ────►  [PixelDataCache]  ────►  [GPU]  │
│                             (cache-first fetch,           (IndexedDB,          Texture   │
│                              Web Worker decode)             resolution-        Arrays    │
│                                                               qualified keys)             │
│                                                                                       │
│   One path, shared by MID and HIGH tiers alike:                                     │
│   GameArtworkProvider.fetchPixels() → PixelDataCache.get() hit, or                  │
│                                        TextureWorker fetch+decode → PixelDataCache.put() │
│                                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

There is no longer a separate blob-cache path. Both LOD tiers (MID and HIGH) go through the same
cache-first `fetchPixels()` call, keyed by resolution — see §3.2.

---

## 1. Image Source: Steam CDN URLs

### Where URLs Come From

**Primary Source: AWS Lambda `/batch-appdetails` endpoint**
```typescript
// BatchAppDetailsClient.ts fetches from Lambda
// Lambda returns artwork URLs from Steam Store API:
artwork: {
    header: string | null;      // https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg
    capsule: string | null;     // capsule_image from Store API
    capsule_v5: string | null;  // capsule_imagev5 from Store API
    background: string | null;  // background from Store API
    background_raw: string | null;
}
```

**Steam CDN URL Patterns** (`CDN_PATTERNS` in `GameArtworkProvider.ts`):

| Image Type | URL Pattern | Dimensions | Use Case |
|------------|-------------|------------|----------|
| Library (Portrait) | `cdn.akamai.steamstatic.com/steam/apps/{appid}/library_600x900.jpg` | Path says 600×900, CDN actually serves 300×450 for most titles | Both MID and HIGH LOD (downscaled/native respectively) |
| Header | `shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg` | 460×215 | Fallback |
| Capsule | `cdn.akamai.steamstatic.com/steam/apps/{appid}/capsule_616x353.jpg` | 616×353 | Fallback |

`LodArtworkOrchestrator` normalizes HIGH to a 300×450 effective ceiling (`STEAM_EFFECTIVE_MAX_WIDTH/HEIGHT`)
regardless of configured ratio, since upscaling past the CDN's real resolution just wastes VRAM — see the
"Steam library image CDN reality check" comment block in `LodArtworkOrchestrator.ts`.

### URL Construction Logic

`GameArtworkProvider.buildUrlStrategy(appId, format, artworkHints)` builds an ordered candidate list per
format (library / header / capsule), preferring metadata-supplied hints (from the Lambda) over constructed
CDN URLs, then falling back to a previously-successful URL for that appId/format if one was recorded this
session. Format-specific ordering lives in `STRATEGY_BY_FORMAT`.

---

## 2. Fetch Trigger: What Starts the Download?

### Trigger Chain (two-phase load/place split)

Artwork loading and shelf placement are decoupled — artwork can be prefetched as soon as batch data
arrives, before the shelf position for that game is known:

```
User enters Steam profile
    └──► SteamIntegration.loadCachedGames() / batch arrival
        └──► LodArtworkOrchestrator.prefetchArtwork(appid, artworkHints, gameName)
            │    - Allocates a texture slot
            │    - GameArtworkProvider.getArtwork(...) → GameArtworkRequest
            │    - fetchAndCachePixels() → artwork.getPixelsAtSize(midWidth, midHeight)
            │    - Idempotent per gameName; safe to call again (no-op if already loaded)
            ▼
        (once shelf position is known)
        └──► LodArtworkOrchestrator.placeInstance(appid, gameName, position, rotation)
                 - Looks up the already-prefetched texture slot
                 - LodGameArtworkRenderer.addInstance(...) creates the GPU instance
```

`setArtworkInstanceFromUrl()` remains as a combined fetch+place entry point (implements
`IGameArtworkPipeline` for `LodDistanceManager`) for callers that don't need the two-phase split.

**Key Decision Point:** `GameArtworkRequest.getPixelsAtSize()` (per-request handle returned by
`GameArtworkProvider.getArtwork()`) is the shared fetch trigger for both phases and both LOD tiers — see
§5.

---

## 3. Caches

### 3.1 `SteamTexturePixels` Database - Pixel Cache

**Owner:** `PixelDataCache` (singleton, Web Worker-based)

**Purpose:** Cache decoded RGBA pixel data for **both** MID and HIGH LOD textures — one unified cache,
resolution-qualified.

**Schema:**
```typescript
// Key: `${url}@${width}x${height}` — e.g. "https://.../library_600x900.jpg@150x225"
// Value:
{
    pixelData: Uint8ClampedArray;  // Raw RGBA pixel data
    width: number;
    height: number;
}
```

Because the key includes resolution, MID (150×225-ish) and HIGH (up to 300×450) entries for the same
artwork URL coexist without collision, and changing a LOD ratio setting simply produces a new key —
stale-size entries go unused rather than needing explicit invalidation.

**Operations run in a Web Worker** (`pixel-cache.worker.ts`): all IndexedDB reads/writes, zero main
thread blocking, ArrayBuffer transfer for zero-copy.

### 3.2 `steam-app-details-cache` Database - Metadata Cache

**Owner:** `AppDetailsCache`

**Purpose:** Cache Steam Store API metadata (categories, genres, artwork URL hints)

**Schema:**
```typescript
interface CachedAppDetails {
    appid: number;
    data: AppDetailsData;  // Full metadata including artwork URL hints
    cached_at: number;
}
```

Seeded from the baked release cache on first run — see [Release Pipeline](../plans/release-pipeline-plan.md).

---

## 4. GPU Texture Arrays

### 4.1 Two-Tier LOD System

**Owner:** `LodTextureArrayManager` (array creation/population) + `LodGameArtworkRenderer` (GPU instancing)

| LOD Level | Resolution | Slots | Purpose |
|-----------|------------|-------|---------|
| **HIGH** | up to 300×450 (config-driven via `LodHighReductionRatio`, `LodMaxHighSlots` settings) | Configurable (default 64, LRU) | Close-up detail (portrait format) |
| **MID** | Config-driven via `LodMedReductionRatio` | `maxTextures` (default 512) | Distance viewing, always loaded |

VRAM totals are logged at startup by `LodArtworkOrchestrator.logConfig()` rather than fixed — they scale
with the configured ratios and slot counts.

### 4.2 Texture Array Structure

```typescript
// THREE.DataArrayTexture - 2D array texture (WebGL2)
// Each "layer" is one game's texture
const textureArrayMid = new THREE.DataArrayTexture(data, midWidth, midHeight, maxTextures)
const textureArrayHigh = new THREE.DataArrayTexture(data, highWidth, highHeight, totalHighSlots)
```

**Why DataArrayTexture?**
- Single draw call for all game boxes (GPU instancing)
- Per-instance `textureIndex` attribute selects layer
- Per-instance `lodLevel` attribute selects HIGH vs MID array

### 4.3 HIGH Texture Lazy Loading

**Problem:** Loading every HIGH texture upfront would use far more VRAM than needed for boxes not
currently in view.

**Solution:** `HighTextureCache` - LRU cache with a configurable slot count (`LodMaxHighSlots`),
state machine per game (`HighTextureState`: `LOADED` / `CACHING` / `LOADING` / etc.):

```typescript
// Flow:
// 1. Game prefetched → MID texture loaded immediately (always)
// 2. Player approaches → LOD manager calls requestHighTexture(gameIndex)
// 3. HighTextureCache checks PixelDataCache (fast hit) or fetches (slow miss)
//    - fetches go through the same GameArtworkProvider.fetchPixels() as MID
// 4. On load complete → assigns slot, notifies LodGameArtworkRenderer via callback
// 5. LodGameArtworkRenderer updates highTextureSlot attribute
// 6. Cache full → evict LRU, reassign slot
```

---

## 5. Complete Data Flow: CDN → GPU

Both LOD tiers share one fetch path (`GameArtworkProvider.fetchPixels()`); they differ only in *when*
they're triggered and at what target resolution.

### Shared fetch path

```
1. [GameArtworkRequest.getPixelsAtSize(width, height)]
       │  Called by LodArtworkOrchestrator (MID, always) or HighTextureCache (HIGH, on approach)
       ▼
2. [GameArtworkProvider.fetchPixels(url, width, height, cacheKey)]
       │  sizedCacheUrl = `${url}@${width}x${height}`
       ▼
3. [PixelDataCache.get(sizedCacheUrl)]
       │
       ├──► HIT: return cached Uint8ClampedArray immediately (resized if dimensions differ)
       │
       └──► MISS:
              │
              ▼
        [TextureWorker.fetchAndProcessWithOptions(url, width, height)]
              │  Runs in Web Worker
              │  fetch(url) → Blob → createImageBitmap(blob)
              │  offscreenCanvas.drawImage() → scaled to target size
              │  getImageData() → Uint8ClampedArray (RGBA)
              ▼
        [PixelDataCache.put(sizedCacheUrl, pixels, width, height)] — always stores, single fetch
```

### Path A: MID Texture (prefetch, immediate)

```
1. [LodArtworkOrchestrator.prefetchArtwork] Batch data arrives for a game
       │  Allocates textureIndex from LodTextureArrayManager
       ▼
2. [GameArtworkProvider.getArtwork(...)] Returns a GameArtworkRequest handle
       ▼
3. [fetchAndCachePixels] → artwork.getPixelsAtSize(midWidth, midHeight)
       │  (shared fetch path above)
       ▼
4. [LodTextureArrayManager.setSlotPixels(MID, textureIndex, pixels, w, h)]
       ▼
5. [LodArtworkOrchestrator.updateGPU] → textureManager.flushToGpu() / renderer.flushToGpu()
       ▼
6. [Shader] texture(textureArrayMid, vec3(uv, float(textureIndex)))
```

### Path B: HIGH Texture (lazy load with pixel cache)

```
1. [LOD Manager] Player approaches game box → requestHighTexture(gameIndex)
       ▼
2. [HighTextureCache.requestHighTexture]
       │  state === LOADED → return slot (HIT)
       │  else → triggerLoad(entry)
       ▼
3. [HighTextureCache.loadHighTexture] → GameArtworkProvider.fetchPixels(url, highW, highH, ...)
       │  (shared fetch path above — PixelDataCache checked first, same as MID)
       ▼
4. [On cache hit or background fetch complete]
       │  Schedule doTextureCompletion() via FrameBudgetScheduler (avoids frame spikes)
       ▼
5. [doTextureCompletion] → highArrayData.set(imageData, offset); dirtySlots.add(slot)
       ▼
6. [HighTextureCache.flushToGpu] → dataArrayTexture.addLayerUpdate(slot) per dirty slot
       │  Partial upload: only changed slots, not the full array
       ▼
7. [LodGameArtworkRenderer.onHighSlotChange] → highTextureSlots[instanceIndex] = slot
       ▼
8. [After GPU flush] Promote instance's lodLevel attribute to HIGH
       ▼
9. [Shader] texture(textureArrayHigh, vec3(uv, float(highTextureSlot)))
```

---

## 6. Cache Level Summary

| Cache | Location | Format | TTL | Purpose |
|-------|----------|--------|-----|---------|
| **AppDetailsCache** | IndexedDB `steam-app-details-cache` | JSON | Never (schema-versioned) | Metadata + artwork URL hints |
| **PixelDataCache** | IndexedDB `SteamTexturePixels` | RGBA pixels, resolution-qualified key | Never (key includes size) | Both MID and HIGH decoded pixels |
| **TextureArrayMid** | GPU VRAM | RGBA | Session | MID LOD rendering, always loaded |
| **TextureArrayHigh** | GPU VRAM | RGBA | Session | HIGH LOD rendering (LRU, lazy) |

---

## 7. In-Memory Caches

### GameArtworkProvider In-Memory State

```typescript
// appId+format → failure/success outcome (session only)
private readonly failureCache: Map<string, RuntimeArtworkCacheEntry>
private readonly successCache: Map<string, RuntimeArtworkCacheEntry>
```

Permanent failure reasons (`NO_ARTWORK`, `CORS`, `DECODE`, `404`) are tracked so dead artwork isn't
retried every load — see `isPermanentFailure()`.

### LodArtworkOrchestrator In-Memory State

```typescript
private gameNameToTextureIndex: Map<string, number>
private instanceMetadata: Map<number, InstanceMetadata>
private prefetchedHighArtworkUrl: Map<string, string>
```

### HighTextureCache In-Memory State

```typescript
private games: Map<number, GameEntry>       // gameIndex → { state, highSlot, ... }
private slotToGame: number[]                // slot → gameIndex (-1 if free)
private loadingPromises: Map<number, Promise<boolean>>
private stats: { evictions, cacheHits, cacheMisses, pixelCacheHits, pixelCacheMisses }
```

---

## 8. LOD System Interaction

### LOD Levels and Texture Selection

```glsl
// Shader fragment (instanced-artwork-lod.frag)
uniform sampler2DArray textureArrayHigh;
uniform sampler2DArray textureArrayMid;

in float vTextureIndex;
in float vLodLevel;
in float vHighTextureSlot;

void main() {
    vec4 color;
    if (vLodLevel < 0.5) {  // HIGH
        color = texture(textureArrayHigh, vec3(vUv, vHighTextureSlot));
    } else {  // MID
        color = texture(textureArrayMid, vec3(vUv, vTextureIndex));
    }
    gl_FragColor = color;
}
```

### LOD Promotion Flow

1. **Request HIGH:** `LodArtworkOrchestrator.setInstanceLod(instanceIndex, LOD_LEVEL.HIGH)`
2. **Check ready:** `highTextureCache.requestHighTexture(textureIndex)` returns slot or triggers load
3. **Not ready:** Stay at MID; load proceeds in background
4. **Load complete:** `onHighSlotChange` callback queues for promotion
5. **After GPU flush:** Promote LOD attribute to HIGH
6. **Shader samples:** Uses `textureArrayHigh[highTextureSlot]` instead of `textureArrayMid[textureIndex]`

The three settings controlling HIGH slot count and both tiers' ratios (`lodMaxHighSlotsControl`,
`lodHighRatioControl`, `lodMedRatioControl` in `GraphicsSettingsPanel.ts`) are enabled and functional —
see [Texture Cache Refactor Plan](../archive/texture-cache-refactor-plan-COMPLETED.md) (archived, complete).

---

## 9. Performance Optimizations

### Web Worker Offloading
- **TextureWorker:** fetch + decode + resize runs off main thread
- **PixelDataCache Worker:** all IndexedDB operations off main thread

### Frame Budget Scheduling
- `FrameBudgetScheduler` defers texture copies when frame budget exceeded
- Prevents multiple worker responses from overwhelming a single frame

### Partial GPU Upload
- `DataArrayTexture.addLayerUpdate(slot)` marks specific layers dirty
- Uploads only changed slots instead of the full array

### Pixel Cache Strategy
- Store decoded RGBA to skip decode on cache hit
- Larger than JPEG but eliminates decode latency, and is shared by both LOD tiers

### Throttled Concurrent Loading
- `maxConcurrentLoads` (HighTextureCache config) prevents network/decode saturation
- Load queue processes sequentially

---

## 10. Files Reference

| Component | File |
|-----------|------|
| Artwork provider (cache-first fetch, URL strategy) | `src/scene/game-box/instancing/GameArtworkProvider.ts` |
| Per-game artwork request handle | `src/scene/game-box/instancing/GameArtworkRequest.ts` |
| Pixel data cache | `src/scene/game-box/instancing/PixelDataCache.ts` |
| Pixel cache worker | `src/scene/game-box/instancing/pixel-cache.worker.ts` |
| App details cache | `src/steam/cache/AppDetailsCache.ts` |
| LOD orchestrator (top-level, prefetch/place split) | `src/scene/game-box/instancing/LodArtworkOrchestrator.ts` |
| LOD texture array manager | `src/scene/game-box/instancing/LodTextureArrayManager.ts` |
| LOD GPU renderer | `src/scene/game-box/instancing/LodGameArtworkRenderer.ts` |
| HIGH texture LRU cache | `src/scene/game-box/instancing/HighTextureCache.ts` |
| Texture processing worker | `src/scene/game-box/instancing/texture-processing.worker.ts` |
| Texture worker manager | `src/scene/game-box/instancing/TextureWorker.ts` |
| Pixel resize helper | `src/scene/game-box/instancing/ArtworkPixelUtils.ts` |
| Game box renderer | `src/scene/game-box/GpuGameBoxRenderer.ts` |
| Batch app details client | `src/steam/batch/BatchAppDetailsClient.ts` |

---
*— A1*
