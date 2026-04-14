# Steam Brick and Mortar — Current Status

## Active Work

**Phase**: Act 1 → Intermission (Technical Stewardship)  
**Branch**: `openclaw/feat-neon-ui-intermission`  
**Act Doc**: [`docs/acts/act1-intermission-technical-stewardship.md`](../acts/act1-intermission-technical-stewardship.md)  
**Next Act**: [`docs/acts/act2-ready-for-friends.md`](../acts/act2-ready-for-friends.md)

---

## Recent Completions

- ✅ Full docs restructure — acts layer, feature docs, tech debt triage (this branch)
- ✅ Event-driven shelf spawning (ShelfReady → GameBoxSpawner)
- ✅ ShelfLayoutCoordinator extracted from GpuStorePropsRenderer
- ✅ GameSorter + GameSortFunctions (composable sort pipeline)
- ✅ CategoryAssigner + genre-first sort
- ✅ InstancedShelfRenderer + ShelfGeometryBuilder (GPU-instanced shelves)
- ✅ SignageRenderer + SceneSignManager (end-cap and ceiling signs)
- ✅ ProceduralTextureWorker → ManagedWorker (all workers migrated)
- ✅ LOD artwork system (LodArtworkOrchestrator, HighTextureCache, pixel-cache worker)
- ✅ Lint pass 1 + 2 (explicit-any, unused-vars, no-case-declarations)
- ✅ Stack upgrades: Three.js r183, TypeScript 6, Vite 8, Vitest 4, ESLint 10

---

## Notes

- Idea backlog has been moved to feature docs and Encore:
  - [Layout Variations](../features/layout-variations.md)
  - [Room Variants](../features/room-variants.md)
  - [Lighting and Atmosphere](../features/lighting-and-atmosphere.md)
  - [Act 4 Encore](../acts/act4-encore-someday-maybe.md)
