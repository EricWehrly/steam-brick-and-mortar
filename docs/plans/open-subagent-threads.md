# Open Subagent Threads

Tracks ongoing and queued work being done in persistent subagent sessions.
Update when threads start, finish, or are blocked.

---

## Active Threads

*(none currently running)*

---

## Queued / Ready to Start

### Thread: UI Normalization (6.6)
**Status**: Greenlit — start when ready  
**Model**: gemini-3-flash (mechanical, bounded work)  
**Mode**: session subagent  
**Work**: Design token spec + shared component inventory + migration pass on existing panels  
**Ref**: `docs/plans/ui-normalization-plan.md`  
**Depends on**: Nothing blocking — can start now  
**Notes**: UI normalization must complete before we build new UI pieces (omnibar, category labels, etc.)

---

### Thread: Steam Categorization — Shelf Assignment
**Status**: Ready to start (data already exists!)  
**Model**: gemini-3-flash  
**Mode**: session subagent  
**Work**: `SteamGameData` already has `genres` and `categories` via `SteamGameMetadata` (fetched + cached). The missing piece is using that data to assign games to category-labeled shelf groups.  
**Ref**: `docs/steam-categorization-research.md`, `client/src/steam/types/SteamMetadata.ts`, `client/src/scene/StoreLayoutConfig.ts`  
**Depends on**: Nothing — data is in-hand  

**Concrete work items**:
1. Write a `CategoryAssigner` (or similar) that takes `SteamGameData[]` and returns games grouped by primary genre
2. Define a `ShelfGroup` type: `{ category: string; label: string; games: SteamGameData[] }`
3. Wire `GpuStorePropsRenderer` to receive shelf groups instead of a flat game list
   - `BatchCoordinator` currently batches flat list → need group-aware batching or pre-group before batching
4. Update `StoreLayoutConfig.STEAM_STORE_SECTIONS` to match real Steam genre ids (currently hardcoded strings)
5. Fallback: games with no genre → "Other" group

**Key files**:
- `client/src/steam/types/SteamMetadata.ts` — `SteamCategory`, `SteamGenre` types (already defined)
- `client/src/scene/game-box/types/GameData.ts` — `SteamGameData` (already has `genres`, `categories`)
- `client/src/scene/StoreLayoutConfig.ts` — `STEAM_STORE_SECTIONS` (dead code currently — wire it up)
- `client/src/scene/GpuStorePropsRenderer.ts` — where shelf placement happens (needs group awareness)
- `client/src/scene/spawning/GameBoxSpawner.ts` — game→shelf assignment

**Prep Notes (main session)**:
- Confirm what % of a typical library actually has genres populated (may need a dev-mode log)
- Decide: group by `genres[0].description` (primary genre) or something smarter?

---

## Completed Threads

*(none yet)*

---

## Abandoned / Deferred

*(none yet)*
