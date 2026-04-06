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

### Thread: Steam Categorization — CategoryAssigner
**Status**: Ready to start (data already exists!)  
**Model**: gemini-3-flash  
**Mode**: one-shot subagent, single file scope  
**Ref**: `docs/plans/feature-priority-spec.md`, `client/src/steam/types/SteamMetadata.ts`

**What exists already:**
- `SteamGameData.genres[]` — type `SteamGenre[]` (`id: string, description: string`)
- `SteamGameData.categories[]` — type `SteamCategory[]` (`id: number, description: string`)
- `STEAM_STORE_SECTIONS` in `StoreLayoutConfig.ts` — dead code placeholder section names

**Subagent task A — CategoryAssigner (one file):**
Create `client/src/scene/categorization/CategoryAssigner.ts`:
- Input: `SteamGameData[]`
- Output: `ShelfGroup[]` where `ShelfGroup = { genre: string; label: string; games: SteamGameData[] }`
- Group by `genres[0].description` (primary genre)
- Games with no genre go into an `"Other"` group
- Sort groups: largest first, `"Other"` always last
- Write unit tests alongside

**Subagent task B — FeaturePriorityConfig (one file):**
Create `client/src/ui/FeaturePriorityConfig.ts`:
- `HIDDEN_PRIORITY = 9999` constant
- Default priority table as a `Map<number, number>` (categoryId → priority)
- Helper: `sortAndFilterCategories(categories: SteamCategory[]): SteamCategory[]`
  - Filters out `priority >= HIDDEN_PRIORITY`
  - Sorts remaining by priority ascending
- Write unit tests

**These are independent — either can run first.**

### Thread: Popcorn Ceiling Texture Improvement
**Status**: Queued — start when visual design cycles open  
**Model preference (design pass)**: gemini-pro → opus → sonnet  
**Constraint**: output = implementation-ready plan for cheap model execution, minimal iteration  
**Goal**: Improve popcorn ceiling procedural texture to read convincingly in-scene at VR scale.
- Leads naturally into a "stucco wall" variant using similar noise pattern
- Wall shelves may replace the need for stucco walls (parking stucco for now)
- Focus on ceiling first

**Deliverable**: `docs/plans/popcorn-ceiling-plan.md` — specific shader/canvas algorithm changes a gemini-flash subagent can implement without design ambiguity

---

### Thread: getInstance Singleton Refactor
**Status**: Queued — defer until fresh branch  
**Work**: Apply `#current` getter singleton pattern to other classes (post-MeshPrewarmer prototype).  
**Notes**: DataManager changes are significant — do those on a fresh branch when ready. Other singletons can be lighter touches.

---

### Thread: Visual Materials Planning (design-only)
**Status**: Queued (when cycles open)  
**Goal**: Produce implementation-ready plans (not code) for:
- popcorn ceiling texture
- wood paneling texture

**Model preference order (design pass only)**:
1. gemini-pro
2. opus
3. sonnet

**Constraint**: output should be simple-model implementation plans to minimize iterative turns.

---
