# Consolidation Proposal

**Branch context**: `openclaw/feat-codebase-cleanup`  
**Date**: 2026-04-08  
**Author**: Vex

This document captures consolidation opportunities identified during the cleanup sprint. Nothing here requires immediate action — it's a roadmap for future cleanup passes.

---

## 1. Texture Management Fragmentation

**Problem**: Game box texture concerns are split across at least three files that are all thin enough to fit in one:

| File | Lines | Responsibility |
|---|---|---|
| `GameBoxTextureManager.ts` | 265 | Texture loading, caching for game boxes |
| `GameBoxPerformanceManager.ts` | 302 | Performance budgets, LOD thresholds |
| `GameBoxLayoutUtils.ts` | 118 | Layout geometry helpers |

None of these are large. They were likely extracted from `GpuGameBoxRenderer.ts` at different times.

**Proposal**: Consolidate into `GameBoxRendererUtils.ts` (or keep as a `game-box/utils/` subfolder with a barrel). The current arrangement feels over-split for the complexity involved.

**Risk**: Low. These are mostly static utility classes with no shared state.

---

## 2. Lighting Sub-system Split

**Problem**: Lighting is spread across `lighting/` and `scene/`:

| File | Location | Responsibility |
|---|---|---|
| `LightFactory.ts` | `lighting/` | Creates Three.js lights |
| `LightRegistry.ts` | `lighting/` | Tracks active lights by name/type |
| `ManagedLights.ts` | `lighting/` | Light config types |
| `LightingRenderer.ts` | `scene/` | Orchestrates lighting lifecycle |
| `LightingEvents.ts` | `types/` | Event types |
| `LightingDebugHelper.ts` | `scene/` | Debug visualization |

`LightingRenderer.ts` is the right home for most of this. `LightFactory` and `LightRegistry` are used almost exclusively by `LightingRenderer` — they could be private collaborators rather than separate modules. The `lighting/` directory could fold into `scene/lighting/` (or even just live alongside `LightingRenderer.ts`).

**Proposal**: Move `lighting/` → `scene/lighting/`, or collapse `LightFactory` and `LightRegistry` into private classes within `LightingRenderer`. The current split adds navigation overhead for little benefit.

**Note**: The tech debt item for `GameSpotlight` lifecycle migration (moving pool/dim logic into `LightingRenderer`) is a prerequisite for this consolidation to make full sense.

**Risk**: Medium. `LightFactory` is referenced from `NeonTubeSign` (neon branch). Coordinate with neon branch merge before collapsing.

---

## 3. `InteractionEvents.ts` Disentanglement

**Problem**: Reviewed in PR #42 — `InteractionEvents.ts` conflates user input events (click, hover, game selection) with system lifecycle events (Steam loading, store props setup, room events). `LightingEvents.ts` was the first split. More splits needed.

**Proposal** (rough, in priority order):
1. `SceneEvents.ts` — StoreProps lifecycle (`SetupRequest`, `SetupCompleted`), `ShelfCreated`, `ShelfSpaceRequested`, `BatchReadyForPlacement`, `GamesPlaced`, room events
2. `SteamEvents.ts` — `AllGamesLoaded`, `BatchReady`, `AllBatchesComplete`, game detail events
3. `InputEvents.ts` — `GameSelected`, `GameHovered`, `GameClicked`, WebXR input events
4. `InteractionEvents.ts` becomes a barrel re-export or is deleted

**Risk**: High. Touching event type definitions requires updating all subscribers. Should be done as a dedicated branch with automated import refactoring (`sed`/`ts-morph`). Do not do this incrementally.

---

## 4. `utils/materials/` vs `utils/textures/` vs `utils/` Overlap

**Problem**: Procedural material and texture generation is split between:
- `utils/materials/` — `BaseMaterialGenerator`, `CarpetMaterialGenerator`, `CeilingMaterialGenerator`, `WoodMaterialGenerator`, `MaterialBase`
- `utils/textures/` — `BaseTextureGenerator`, `CarpetTextureGenerator`, `CeilingTextureGenerator`, `WoodTextureGenerator`, plus painters and patterns subdirectories
- `utils/ProceduralTextures.ts` — top-level entry point
- `utils/SharedMaterialManager.ts` — singleton that caches materials
- `utils/MaterialUtils.ts` — static helpers (112 lines)

The painters and patterns subdirectories under `textures/` are doing real work but the top-level entry point (`ProceduralTextures.ts`) is thin. The `materials/` vs `textures/` split is an implementation detail that leaks into the directory structure.

**Proposal**: Flatten into `utils/procedural/` with `materials/` and `textures/` sub-paths, or just accept the current structure and document it. This is lower priority than items 1-3.

**Risk**: Low. Mostly cosmetic restructuring.

---

## 5. Debug Class Redundancy

The following debug classes exist as decorators/extensions of their base classes. Now that `SceneManagerDebug` extends `SceneManager` properly, the pattern is consistent — but worth reviewing whether any of these are providing unique value:

| Debug Class | Base Class | Worth Keeping? |
|---|---|---|
| `SceneManagerDebug` | `SceneManager` | ✅ Yes — console API, diagnostic info |
| `ThreeWebGLRendererDebug` | (wraps `WebGLRenderer`) | ⚠️ Check callers |
| `LightingDebugHelper` | (standalone) | ⚠️ Check if superseded by `LightingRenderer` debug toggles |
| `LodDistanceManagerDebug` | `LodDistanceManager` | ✅ Used by `LodArtworkOrchestrator` |
| `InstancedArtworkDebugger` | (standalone) | 🗑️ Deleted in cleanup (was tied to deleted `InstancedArtworkRenderer`) |
| `HighTextureCacheDebug` | `HighTextureCache` | 🗑️ Deleted in cleanup |
| `LodArtworkOrchestratorDebug` | `LodArtworkOrchestrator` | 🗑️ Deleted in cleanup |

**Action**: Follow up on `ThreeWebGLRendererDebug` and `LightingDebugHelper` — check if their responsibilities have been absorbed by newer systems.

---

## 6. Cache Layer Proliferation

| Class | File | Notes |
|---|---|---|
| `CacheManager` | `steam/cache/CacheManager.ts` | Interface |
| `SimpleCacheManager` | `steam/cache/SimpleCacheManager.ts` | Basic impl |
| `AppDetailsCache` | `steam/cache/AppDetailsCache.ts` | Specialized |
| `HighTextureCache` | `scene/game-box/instancing/HighTextureCache.ts` | GPU texture cache |
| `PixelDataCache` | `scene/game-box/instancing/PixelDataCache.ts` | Pixel-level cache |

The Steam-side caches (`CacheManager`/`SimpleCacheManager`/`AppDetailsCache`) are fine — they're domain-specific. The texture caches (`HighTextureCache`, `PixelDataCache`) are also justified by their GPU concerns. No urgent consolidation needed here, but the `SimpleCacheManager` implementing `CacheManager` interface when there's only one implementation is worth noting.

---

## Priority Order

1. **Now**: `InteractionEvents.ts` split (biggest bang, tracked as TD in file header)
2. **Next**: `lighting/` → `scene/lighting/` collapse (after GameSpotlight tech debt resolved)
3. **Later**: Texture/material directory cleanup
4. **Eventually**: `GameBox*Manager` consolidation
