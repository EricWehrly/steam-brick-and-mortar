# WORK.md

## Task
High-value LOD stack simplifications (1-5):
1. Split tier config from runtime texture sources
2. Make lazy/eager HIGH path explicit via type-level mode
3. Extract HIGH slot/LRU allocation policy
4. Centralize LOD debug toggles
5. Prune interface surface and redundant docs/comments

## Branch
openclaw/runtime-fixes

## Approach
- Introduce canonical tier spec types and conversion helper.
- Introduce discriminated union for renderer texture sources.
- Extract pure `HighSlotAllocator` from `HighTextureCache`.
- Add centralized `LodDebugSettings` module.
- Trim non-value-add JSDoc while preserving ownership/invariants.
- Update tests/mocks for new interfaces.

## Files (planned)
- client/src/scene/game-box/instancing/ILodArtworkRenderer.ts
- client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts
- client/src/scene/game-box/instancing/LodGameArtworkRenderer.ts
- client/src/scene/game-box/instancing/LodTextureArrayManager.ts
- client/src/scene/game-box/instancing/HighTextureCache.ts
- client/src/scene/game-box/instancing/ManagedTextureArray.ts
- client/src/scene/game-box/instancing/LodDebugSettings.ts (new)
- client/src/scene/game-box/instancing/LodTypes.ts (new)
- client/src/scene/game-box/instancing/HighSlotAllocator.ts (new)
- related tests/mocks

## Open questions
- Keep legacy `LodConfig` name for compatibility or fully rename callers now?
- Keep low-risk optional fallback for `textureArrayHigh` uniform in lazy mode?
