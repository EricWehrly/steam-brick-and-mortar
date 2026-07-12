# Texture Cache Refactor Plan

**Plan 1 of 2** in the CDN-artwork-traffic thread — see [Traffic Safety Review](traffic-safety-review.md)
("Next front: the CDN images") for why this matters now. **Plan 2** is
[F2P Artwork Bake](f2p-artwork-bake-plan.md), which depends on this one landing first: baking
pre-fetched artwork into a release only makes sense once there's one clean cache layer to seed,
not the current two-cache, double-fetch mess described below.

## Problem Statement

The current texture/image caching system has **redundant storage** and **unused code paths**:

1. **ImageManager** (`SteamGameImages` IndexedDB) caches JPEG blobs (~30-50KB each)
2. **PixelDataCache** (`SteamTexturePixels` IndexedDB) caches decoded RGBA pixels (~540KB each)
3. **The GPU texture pipeline doesn't use ImageManager at all** - TextureWorker fetches directly from CDN

### Current Data Flow (Wasteful)

```
Steam CDN
    │
    ├──► ImageManager.downloadImage() ──► SteamGameImages (blob) ──► CacheManagementPanel UI only
    │    [Fire-and-forget warming in SteamIntegration.ts:167]       [UNUSED by rendering!]
    │
    └──► TextureWorker.fetchAndProcess() ──► GPU (MID textures, not cached)
              │
              └──► PixelDataCache (HIGH textures only) ──► GPU HIGH array
```

### Impact

| User Type | Current Waste |
|-----------|---------------|
| **First-time** | Each image downloaded TWICE (ImageManager + TextureWorker) |
| **Returning** | ~40MB blob cache sitting unused; only PixelDataCache helps |

## Proposed Architecture

### Goal: Single cache for texture data, with asymmetric HIGH/MED handling

```
Steam CDN
    │
    └──► TextureWorker.fetchAndProcess()
              │
              ├──► MedPixelCache (new) ──► GPU MID array
              │    [Smaller pixels, 150×225 = 135KB each]
              │
              └──► PixelDataCache (existing) ──► GPU HIGH array
                   [300×450 = 540KB each, LRU managed]
```

### Key Design Decisions

#### 1. Remove ImageManager Blob Cache from GPU Pipeline

- **Delete**: Fire-and-forget artwork warming in `SteamIntegration.ts`
- **Keep**: ImageManager for non-GPU uses (if any remain after audit)
- **Or**: Delete ImageManager entirely if no other consumers

#### 2. Add MED Texture Caching

Currently MED textures are fetched but **not cached** to IndexedDB. This hurts returning users.

**Options:**
- **A) Unified PixelDataCache** - Store both HIGH (300×450) and MED (150×225) in same DB, different keys
- **B) Separate MedPixelCache** - Keep them isolated for easier cache management
- **C) Blob cache for MED** - Store JPEG, decode on demand (smaller storage, decode cost)

**Recommendation: Option A** - Unified cache with resolution in key:
```
Key: `${url}@${width}x${height}`
Value: { pixels: Uint8ClampedArray, width, height, version }
```

#### 3. First-Time User Experience Priority

For users with empty cache:
1. **MED textures load first** (smaller, visible immediately)
2. **HIGH textures load on-demand** when player approaches (existing behavior)
3. **Background caching** continues after initial render

No change needed here - current priority is correct.

#### 4. Returning User Experience

With proper caching:
1. **MED textures: instant** from cache
2. **HIGH textures: instant** when approaching (PixelDataCache hit)
3. **No redundant blob cache** consuming space

## Implementation Plan

### Phase 1: Stop the Waste (Safe, Non-Breaking)

1. **Remove fire-and-forget artwork warming** in `SteamIntegration.ts:167`
   - Just delete the `downloadGameArtwork()` call
   - ImageManager blob cache stops growing
   
2. **Add diagnostic logging** to confirm no other ImageManager consumers for textures

### Phase 2: Add MED Caching

1. **Extend PixelDataCache** to store MED textures
   - Add resolution to cache key
   - Update `TextureWorker` callers to cache MED results

2. **Update LodArtworkRenderer** to check cache before fetch

### Phase 3: Clean Up (After Verification)

1. **Audit ImageManager consumers**:
   - `CacheManagementPanel` - needs rework to show PixelDataCache stats
   - `SteamApiClient.downloadGameImage()` - audit if still needed
   
2. **Either**:
   - Repurpose ImageManager for non-texture uses
   - Delete ImageManager if no consumers remain

### Phase 4: Re-enable Graphics Settings

1. **Cache invalidation strategy** for when texture dimensions change
2. **Re-enable UI controls** in `graphics-settings-panel.html`

## Files Affected

| File | Change |
|------|--------|
| `SteamIntegration.ts` | Remove `downloadGameArtwork()` call |
| `PixelDataCache.ts` | Add resolution-aware keys, MED support |
| `LodArtworkRenderer.ts` | Check cache for MED before fetch |
| `TextureWorker.ts` | Return results for caching |
| `CacheManagementPanel.ts` | Show PixelDataCache stats instead of ImageManager |
| `ImageManager.ts` | Audit consumers, potentially delete |
| `graphics-settings-panel.html` | Re-enable after Phase 4 |

## Migration Path

1. **No user data migration needed** - blob cache can simply be abandoned
2. **PixelDataCache version bump** if schema changes (existing version system)
3. **Users clearing old cache** is fine - just re-downloads

## Metrics for Success

- [ ] First-time user: Each image fetched exactly once
- [ ] Returning user: Zero network requests for cached games
- [ ] IndexedDB usage: ~500MB for 800 games (pixels only) vs ~540MB (pixels + blobs)
- [ ] Memory: No change (GPU arrays unchanged)

## Related Documents

- `docs/architecture/image-texture-pipeline.md` - Current architecture (to be updated)
- `client/src/templates/pause-menu/graphics-settings-panel.html` - Settings UI (disabled controls)
- [Traffic Safety Review](traffic-safety-review.md) - why this now matters beyond internal cleanup: returning users currently re-fetch most artwork from Steam's CDN every session (MID tier isn't cross-session cached), which is wasted bandwidth on both sides
- [F2P Artwork Bake](f2p-artwork-bake-plan.md) - Plan 2, sequenced after this one

---

**Status**: 🚧 Planning  
**Priority**: High (affects first-time user experience)  
**Blocked by**: None  
**Blocks**: Re-enabling texture size settings in Graphics panel
