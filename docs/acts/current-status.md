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

## Unsorted Ideas (inbox — move to Encore or feature docs when ready)

- Rotate shelves alternatingly (15° toe-out, 30° opening) to make navigation easier — probably already partly done
- Smoke / atmosphere particles in the store
- Movie-theater lit walkways; Tron-like lights along shelf edges
- Pixellate-at-distance obscuring shader
- User-defined CSS driving scene colors
- Museum mode: curate and share a collection via URL code
