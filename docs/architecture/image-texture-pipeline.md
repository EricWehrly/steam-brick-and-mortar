# Image/Texture Pipeline - Complete Data Flow Documentation

## Overview

The Steam Brick and Mortar project has a sophisticated multi-layer caching and texture management system that moves game artwork from Steam's CDN to GPU texture arrays. This document traces the complete data flow from source to render.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              IMAGE/TEXTURE PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   [Steam CDN URLs]  ────►  [Web Worker]  ────►  [IndexedDB Caches]  ────►  [GPU]    │
│                             (fetch +              (2 caches)              Texture    │
│                              decode)                                      Arrays     │
│                                                                                      │
│   Two parallel paths:                                                                │
│   1. ImageManager → SteamGameImages (blob) → Preview/Management UI                   │
│   2. TextureWorker → SteamTexturePixels (RGBA) → GPU Texture Arrays                  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

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

**Steam CDN URL Patterns:**
| Image Type | URL Pattern | Dimensions | Use Case |
|------------|-------------|------------|----------|
| Header | `shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg` | 460×215 | MID LOD textures |
| Library (Portrait) | `cdn.akamai.steamstatic.com/steam/apps/{appid}/library_600x900.jpg` | 600×900 (serves 300×450) | HIGH LOD textures |
| Capsule | `cdn.akamai.steamstatic.com/steam/apps/{appid}/capsule_231x231.jpg` | 231×231 | Fallback |

**Two CDN Domains:**
- `cdn.akamai.steamstatic.com` - Legacy CDN (library_600x900.jpg available)
- `shared.akamai.steamstatic.com` - New CDN (header.jpg only, no portrait alternatives)

### URL Construction Logic

```typescript
// GpuGameBoxRenderer.selectBestArtworkUrl()
// Priority: library > header > constructed fallback

// HighTextureCache.convertToPortraitUrl() converts header URLs to portrait:
// Input:  https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145350/header.jpg
// Output: https://cdn.akamai.steamstatic.com/steam/apps/1145350/library_600x900.jpg
```

---

## 2. Fetch Trigger: What Starts the Download?

### Trigger Chain

```
User enters Steam profile
    └──► SteamIntegration.loadCachedGames()
        └──► GpuStorePropsRenderer.createShelfGames()
            └──► GpuGameBoxRenderer.createGameBoxAuto(game, position)
                └──► LodArtworkRenderer.setArtworkInstanceFromUrl(url)
                    └──► TextureWorker.fetchAndProcess() ◄── ACTUAL FETCH
```

**Key Decision Point:** `GpuGameBoxRenderer.createGameBoxAuto()`
```typescript
// ~67% probability of using artwork (vs. text labels)
const shouldUseArtwork = Math.random() < ARTWORK_PROBABILITY

const artworkUrl = shouldUseArtwork ? this.selectBestArtworkUrl(game) : undefined
if (artworkUrl) {
    this.createGameBoxFromUrl(game, position, artworkUrl, side)
}
```

---

## 3. IndexedDB Caches (3 Separate Databases)

### 3.1 `SteamGameImages` Database - Blob Cache

**Owner:** `ImageManager` (singleton)

**Purpose:** UI preview, cache management panel, general image download cache

**Schema:**
```typescript
interface ImageCacheEntry {
    blob: Blob;              // Actual image data as browser Blob
    url: string;             // Cache key (full CDN URL)
    timestamp: number;       // When cached
    size: number;            // Blob size in bytes
    artworkType?: string;    // 'header', 'library', etc.
    isFallback?: boolean;    // True if loaded from fallback URL
}
```

**Storage:** ~30-50KB per image (JPEG compressed)

**TTL:** 24 hours (checked on read, expired entries deleted)

**Used By:**
- `CacheManagementPanel` - preview cached images
- `SteamUICoordinator.clearImageCache()`
- Manual artwork downloads via `SteamApiClient.downloadGameImage()`

**NOT used** by the GPU texture pipeline.

### 3.2 `SteamTexturePixels` Database - Pixel Cache

**Owner:** `PixelDataCache` (singleton, Web Worker-based)

**Purpose:** Cache decoded RGBA pixel data for HIGH LOD textures

**Schema:**
```typescript
// Key: URL string
// Value:
{
    pixels: Uint8ClampedArray;  // Raw RGBA pixel data
    width: number;              // Image width (300 for HIGH)
    height: number;             // Image height (450 for HIGH)
    version: number;            // Cache version (invalidation)
}
```

**Storage:** ~540KB per image (300×450×4 bytes uncompressed)
- For 800 games: ~432MB IndexedDB storage

**Why Store Decoded Pixels?**
- Avoids JPEG decode on cache hit
- `createImageBitmap()` + `getImageData()` is expensive
- Enables near-instant HIGH texture loading from cache

**Operations Run in Web Worker:**
- All IndexedDB reads/writes
- Zero main thread blocking
- ArrayBuffer transfer for zero-copy

### 3.3 `steam-app-details-cache` Database - Metadata Cache

**Owner:** `AppDetailsCache`

**Purpose:** Cache Steam Store API metadata (categories, genres, artwork URLs)

**Schema:**
```typescript
interface CachedAppDetails {
    appid: number;
    data: AppDetailsData;  // Full metadata including artwork URLs
    cached_at: number;
}
```

**Storage:** ~1-2KB per game (JSON)

**TTL:** No expiration (Steam metadata rarely changes)

---

## 4. GPU Texture Arrays

### 4.1 Two-Tier LOD System

**Owner:** `LodArtworkRenderer`

| LOD Level | Resolution | Slots | VRAM | Purpose |
|-----------|------------|-------|------|---------|
| **HIGH** | 300×450 | 128 | ~65.9MB | Close-up detail (portrait format) |
| **MID** | 150×225 | 910 | ~56.9MB | Distance viewing (quarter resolution) |

**Total VRAM:** ~123MB for texture arrays

### 4.2 Texture Array Structure

```typescript
// THREE.DataArrayTexture - 2D array texture (WebGL2)
// Each "layer" is one game's texture
const textureArrayMid = new THREE.DataArrayTexture(data, 150, 225, 910)
const textureArrayHigh = new THREE.DataArrayTexture(data, 300, 450, 128)
```

**Why DataArrayTexture?**
- Single draw call for all game boxes (GPU instancing)
- Per-instance `textureIndex` attribute selects layer
- Per-instance `lodLevel` attribute selects HIGH vs MID array

### 4.3 HIGH Texture Lazy Loading

**Problem:** Loading 910 HIGH textures upfront = 410MB+ VRAM

**Solution:** `HighTextureCache` - LRU cache with 128 slots

```typescript
// Flow:
// 1. Game added → MID texture loaded immediately
// 2. Player approaches → LOD manager requests HIGH
// 3. HighTextureCache checks PixelDataCache (fast hit) or fetches (slow miss)
// 4. On load complete → assigns slot 0-127, notifies LodArtworkRenderer
// 5. LodArtworkRenderer updates highTextureSlot attribute
// 6. Cache full → evict LRU, reassign slot
```

---

## 5. Complete Data Flow: CDN → GPU

### Path A: MID Texture (Immediate Load)

```
1. [createGameBoxAuto] Game box requested
       │
       ▼
2. [LodArtworkRenderer.setArtworkInstanceFromUrl] 
       │  - Allocates textureIndex (0-909)
       │  - Stores artworkUrl for lazy HIGH loading
       ▼
3. [TextureWorker.fetchAndProcessWithOptions]
       │  - Runs in Web Worker
       │  - fetch(url) → Blob
       │  - createImageBitmap(blob)
       │  - offscreenCanvas.drawImage() → scaled to 150×225
       │  - getImageData() → Uint8ClampedArray (RGBA)
       ▼
4. [LodArtworkRenderer] Copy to texture array
       │  const sliceSize = 150 * 225 * 4  // ~135KB
       │  const offset = textureIndex * sliceSize
       │  arrayData.set(result.imageData, offset)
       │  state.pendingUpdates.add(textureIndex)
       ▼
5. [LodArtworkRenderer.updateGPU] Periodic flush
       │  textureArrayMid.needsUpdate = true
       ▼
6. [Three.js Renderer] Uploads to GPU VRAM
       │
       ▼
7. [Shader] Samples texture
       texture(textureArrayMid, vec3(uv, float(textureIndex)))
```

### Path B: HIGH Texture (Lazy Load with Pixel Cache)

```
1. [LOD Manager] Player approaches game box → requestHighTexture(gameIndex)
       │
       ▼
2. [HighTextureCache.requestHighTexture]
       │  if (entry.state === LOADED) return slot  // HIT
       │  else triggerLoad(entry)                  // MISS
       ▼
3. [HighTextureCache.loadHighTexture]
       │
       ├──► [PixelDataCache.get(url)] Check pixel cache
       │         │
       │         ├──► HIT: Return cached Uint8ClampedArray instantly
       │         │
       │         └──► MISS: Start background caching
       │                   │
       │                   ▼
       │              [TextureWorker.fetchAndProcessWithOptions]
       │                   │  - useNativeSize: true (no resize)
       │                   │  - Returns 300×450 RGBA pixels
       │                   ▼
       │              [PixelDataCache.put(url, pixels)] Store for future
       │                   │
       │                   ▼
       │              Set entry.state = CACHING, return -1
       │              (next request will find cache ready)
       ▼
4. [On cache hit or background complete]
       │  Schedule doTextureCompletion() via FrameBudgetScheduler
       │  - Defers copy to avoid frame spikes
       ▼
5. [doTextureCompletion] When frame budget available
       │  const offset = slot * 300 * 450 * 4
       │  highArrayData.set(imageData, offset)
       │  dirtySlots.add(slot)
       │  isDirty = true
       ▼
6. [HighTextureCache.flushToGpu] Periodic flush
       │  for (slot of dirtySlots)
       │      dataArrayTexture.addLayerUpdate(slot)
       │  dataArrayTexture.needsUpdate = true
       │  // Partial upload: ~540KB per slot vs ~34MB for all
       ▼
7. [LodArtworkRenderer.onHighSlotChange] Callback
       │  highTextureSlots[instanceIndex] = slot
       │  pendingHighPromotion.set(textureIndex, slot)
       ▼
8. [After GPU flush] Promote to HIGH LOD
       │  lodLevelAttr.setX(instanceIndex, LOD_LEVEL.HIGH)
       ▼
9. [Shader] Samples HIGH texture
       texture(textureArrayHigh, vec3(uv, float(highTextureSlot)))
```

---

## 6. Cache Level Summary

| Cache | Location | Format | Size | TTL | Purpose |
|-------|----------|--------|------|-----|---------|
| **AppDetailsCache** | IndexedDB `steam-app-details-cache` | JSON | ~1-2KB/game | Never | Metadata + artwork URLs |
| **ImageManager** | IndexedDB `SteamGameImages` | Blob (JPEG) | ~30-50KB/image | 24h | UI preview, manual downloads |
| **PixelDataCache** | IndexedDB `SteamTexturePixels` | RGBA pixels | ~540KB/image | Never* | HIGH LOD decoded pixels |
| **TextureArrayMid** | GPU VRAM | RGBA | 56.9MB total | Session | MID LOD rendering |
| **TextureArrayHigh** | GPU VRAM | RGBA | 65.9MB total | Session | HIGH LOD rendering (LRU) |

*PixelDataCache has version-based invalidation, not TTL

---

## 7. In-Memory Caches

### LodArtworkRenderer In-Memory State

```typescript
// Game name → texture index mapping
private textureSlots: Map<string, number>

// Texture index → instance index mapping  
private textureIndexToInstance: Map<number, number>

// Failed artwork tracking (24h persistent to localStorage)
private failedArtwork: Map<string, { reason, url, timestamp }>

// Successful fallback URLs (persistent to localStorage)
private fallbackSuccesses: Map<string, { originalUrl, fallbackUrl, fallbackType }>

// Artwork URLs for lazy HIGH loading
private artworkUrls: Map<number, string>  // textureIndex → url
```

### HighTextureCache In-Memory State

```typescript
// Game entries with state and slot assignment
private games: Map<number, GameEntry>  // gameIndex → entry

// Slot allocation: which game is in which slot
private slotToGame: number[]  // slot → gameIndex (-1 if free)

// Currently loading (for throttling)
private loadingPromises: Map<number, Promise<boolean>>

// Queue for throttled loading
private loadQueue: number[]

// Stats for diagnostics
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

1. **Request HIGH:** `LodArtworkRenderer.setInstanceLod(instanceIndex, LOD_LEVEL.HIGH)`
2. **Check ready:** `highTextureCache.requestHighTexture(textureIndex)` returns slot or -1
3. **Not ready:** Stay at MID, `requestHighTexture` triggers background load
4. **Load complete:** `onHighSlotChange` callback queues for promotion
5. **After GPU flush:** Promote LOD attribute to HIGH
6. **Shader samples:** Uses `textureArrayHigh[highTextureSlot]` instead of `textureArrayMid[textureIndex]`

---

## 9. Performance Optimizations

### Web Worker Offloading
- **TextureWorker:** fetch + decode + resize runs off main thread
- **PixelDataCache Worker:** all IndexedDB operations off main thread

### Frame Budget Scheduling
- `FrameBudgetScheduler` defers texture copies when frame budget exceeded
- Prevents multiple worker responses from overwhelming single frame

### Partial GPU Upload
- `DataArrayTexture.addLayerUpdate(slot)` marks specific layers dirty
- Uploads only changed slots (~540KB) instead of full array (~34MB)

### Pixel Cache Strategy
- Store decoded RGBA to skip decode on cache hit
- 10-18x larger than JPEG but eliminates decode latency

### Throttled Concurrent Loading
- `maxConcurrentLoads: 2` prevents network/decode saturation
- Load queue processes sequentially

---

## 10. Files Reference

| Component | File |
|-----------|------|
| Image blob cache | `src/steam/images/ImageManager.ts` |
| Pixel data cache | `src/scene/game-box/instancing/PixelDataCache.ts` |
| Pixel cache worker | `src/scene/game-box/instancing/pixel-cache.worker.ts` |
| App details cache | `src/steam/cache/AppDetailsCache.ts` |
| LOD artwork renderer | `src/scene/game-box/instancing/LodArtworkRenderer.ts` |
| HIGH texture LRU cache | `src/scene/game-box/instancing/HighTextureCache.ts` |
| Texture processing worker | `src/scene/game-box/instancing/texture-processing.worker.ts` |
| Texture worker manager | `src/scene/game-box/instancing/TextureWorker.ts` |
| Game box renderer | `src/scene/game-box/GpuGameBoxRenderer.ts` |
| Batch app details client | `src/steam/batch/BatchAppDetailsClient.ts` |
