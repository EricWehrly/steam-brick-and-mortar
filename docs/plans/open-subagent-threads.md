# Open Subagent Threads

Tracks ongoing and queued work for bounded subagent tasks. When a thread completes, remove it — completed work lives in git history and roadmap docs, not here.

---

## Active Threads

*(none currently running)*

---

## Queued / Ready to Start

### Thread: UI Normalization (6.6)
**Status**: Greenlit — start when ready  
**Model**: gemini-3-flash (mechanical, bounded work)  
**Mode**: one-shot subagent, one file or small set per run  
**Work**: Design tokens now in `client/src/ui/tokens.css`. Next: Phase B base components.  
**Ref**: `docs/plans/ui-normalization-plan.md`  
**Depends on**: Nothing blocking  
**Notes**: One small change per subagent run — not "edit 20 files"

---

### Thread: Steam Categorization — Shelf Assignment
**Status**: Ready to start (data already exists!)  
**Model**: gemini-3-flash  
**Mode**: one-shot subagent  
**Work**: `SteamGameData` already has `genres` and `categories`. Missing piece: assign games to category-labeled shelf groups.  
**Ref**: `docs/steam-categorization-research.md`, `client/src/scene/StoreLayoutConfig.ts`  
**Depends on**: Nothing — data is in-hand  

**Concrete work items**:
1. Write a `CategoryAssigner` that takes `SteamGameData[]` and returns games grouped by primary genre
2. Define a `ShelfGroup` type: `{ category: string; label: string; games: SteamGameData[] }`
3. Wire `GpuStorePropsRenderer` to receive shelf groups instead of a flat game list
4. Fallback: games with no genre → "Other" group

---

### Thread: getInstance Singleton Refactor
**Status**: Queued — defer until fresh branch  
**Work**: Apply `#current` getter singleton pattern to other classes (post-MeshPrewarmer prototype).  
**Notes**: DataManager changes are significant — do those on a fresh branch when ready. Other singletons can be lighter touches.

---
