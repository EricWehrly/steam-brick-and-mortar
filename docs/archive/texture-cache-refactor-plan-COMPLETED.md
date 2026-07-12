# Texture Cache Refactor Plan — COMPLETED

**Archived 2026-07-11.** Plan 1 of 2 in the CDN-artwork-traffic thread — see
[Traffic Safety Review](../plans/traffic-safety-review.md) ("Next front: the CDN images") for why this
mattered. **Plan 2**, [F2P Artwork Bake](../plans/f2p-artwork-bake-plan.md), is now the active thread.

**Status**: 🟢 **All 4 phases done.** Phases 1-3 were found already-complete via an unrelated, larger
artwork-pipeline rewrite that landed elsewhere in the codebase (this doc was stale until the audit
below caught up with it). Phase 4 (re-enable the 3 disabled LOD graphics-settings sliders) was
completed directly as a follow-up to the audit — see [`GraphicsSettingsPanel.ts:217-254`](../../client/src/ui/pause/panels/GraphicsSettingsPanel.ts)
and [`graphics-settings-panel.html`](../../client/src/templates/pause-menu/graphics-settings-panel.html).

## Original problem statement (historical — see audit below for current reality)

The texture/image caching system had **redundant storage** and **unused code paths**:

1. **ImageManager** (`SteamGameImages` IndexedDB) cached JPEG blobs (~30-50KB each)
2. **PixelDataCache** (`SteamTexturePixels` IndexedDB) cached decoded RGBA pixels (~540KB each)
3. **The GPU texture pipeline didn't use ImageManager at all** - TextureWorker fetched directly from CDN,
   so first-time users downloaded every image twice, and MID (the default, most-visible tier) was never
   cached to disk — only HIGH was.

## Audit findings (2026-07-11)

Before starting implementation, re-verified each claim against the current codebase (which had moved on
significantly via other work since this plan was written). Result: **the pipeline was already rebuilt**,
independently, into a different (and more capable) architecture than either this plan or
[`docs/architecture/image-texture-pipeline.md`](../architecture/image-texture-pipeline.md) described.
That architecture doc has been rewritten to match; see it for the current data flow.

| Phase | Plan's ask | Actual state |
|---|---|---|
| **1 — Stop the waste** | Remove `ImageManager` warming from `SteamIntegration.ts` | ✅ Done. `ImageManager.ts` doesn't exist as a file anymore — fully deleted, not just unhooked. No warming call remains. |
| **2 — Add MED caching** | Unified `PixelDataCache` keyed by `${url}@${width}x${height}` (the plan's own "Option A") | ✅ Done, exactly as recommended. [`PixelDataCache.ts`](../../client/src/scene/game-box/instancing/PixelDataCache.ts) uses that key format. [`GameArtworkProvider.fetchPixels()`](../../client/src/scene/game-box/instancing/GameArtworkProvider.ts) checks disk cache before any network fetch, and always writes back after — for MID and HIGH alike, via the same code path (`GameArtworkRequest.getPixelsAtSize()`). The original double-fetch and "MID never cached" bugs are both gone. |
| **3 — Clean up** | Rework `CacheManagementPanel` off `ImageManager`; delete or repurpose `ImageManager` | ✅ Done. `CacheManagementPanel.ts` already reads `PixelDataCache.getInstance()`. `ImageManager` is deleted outright, not repurposed. |
| **4 — Re-enable graphics settings** | Cache-invalidation strategy + re-enable the 3 disabled LOD texture-size sliders | ✅ Done. The blocking concern ("texture dimensions change requires a cache invalidation strategy... to avoid cache corruption") turned out to already be solved as a side effect of the Phase 2 key design — because cache keys are resolution-qualified, changing a LOD ratio setting just produces a new key, with old-size entries going unused rather than colliding. Re-enabling was exactly flipping `disabled: true` → `false` on the three sliders (`lodMaxHighSlotsControl` / `lodHighRatioControl` / `lodMedRatioControl`) plus their hint badges (`disabled` → `reload`, matching the existing pattern for other reload-requiring settings), and removing the stale disabled-notice paragraph and TODO comment from the template. Verified live via browser automation: all three render enabled with sane current values (128 slots, 50%, 25%). |

## Related Documents

- [Image/Texture Pipeline](../architecture/image-texture-pipeline.md) - current architecture (rewritten 2026-07-11 to match reality)
- [Traffic Safety Review](../plans/traffic-safety-review.md) - why this mattered beyond internal cleanup
- [F2P Artwork Bake](../plans/f2p-artwork-bake-plan.md) - Plan 2, now the active thread

---

**Status**: 🟢 Complete — all 4 phases done
**Blocked by**: None
**Blocks**: Nothing — this was the last blocker on re-enabling texture size settings in the Graphics panel

---
*— A1*
