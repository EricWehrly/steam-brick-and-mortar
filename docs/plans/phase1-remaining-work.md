# Phase 1 Remaining Work — "Here to the End"

**Created**: 2026-04-05  
**Purpose**: Honest working list of what stands between now and "ready for me" (Phase 1 complete). Intended to be shorter and more focused than the full `phase1-ready-for-me.md`. Reconcile with that doc after Phase 1 wraps.

---

## The Two Phase 1 Pillars

Phase 1 is done when these two things work:

1. **Shelf layout** — shelves are arranged in the room intentionally and navigably (not randomly). Dynamically sized to library. Configurable enough to be a real store layout, not a proof-of-concept corridor.
2. **Categories** — shelves are grouped and labeled by Steam category. Requires pulling category data from Steam first.

Everything else listed below either unblocks these, improves quality while they're built, or is bonus if cycles allow.

Sorting/filtering is explicitly "right at the edge of Phase 1" — defer to early Phase 2 if needed, and plan it during Phase 2 prep rather than blocking Phase 1 on it.

---

## Where we actually are

**Completed solid:**
- ✅ Instanced shelf rendering (GPU, LOD textures, stickers)
- ✅ Steam API integration + progressive loading + caching
- ✅ Pause menu system (5 panels)
- ✅ Event-driven architecture (batch/placement flow)
- ✅ MDF veneer shelf materials + brand accent colors
- ✅ Procedural textures: wood, carpet, ceiling (off-thread workers — carpet pending)
- ✅ GameSpotlight debug utility
- ✅ StartupProgressUI + 5-phase startup tracking
- ✅ FrameBudgetScheduler (stagger/cooldown now correct)
- ✅ Shader prewarm (MeshPrewarmer)

**Plumbed but unverified / needs QA:**
- 🔄 Games appearing on shelves — event chain exists, visual confirmation pending (6.2.2.1 audit in progress)
- 🔄 Room resizes dynamically to fit game library — implemented, not visually confirmed at scale; retest when alternate layouts and room differentiation land
- 🔄 Shelf capacity calculation — `GameLayoutConstants` hardcoded values may need tuning
- 🔄 GameStart event → model generation — task 6.0.1.2 (models deferred until GameStart) may already be done

---

## Remaining work (ordered)

### 1. Verify & fix game spawning on shelves (6.2.2.1) 🔴 IMMEDIATE
*Can't show anyone until games visually sit on shelves correctly.*

- [ ] Confirm full event chain fires end-to-end: batch → shelf → games placed
- [ ] Games appear at correct positions relative to shelf geometry
- [ ] No obvious overlaps or clipping through shelf boards
- [ ] At least 18 games/shelf (3 per surface × 6 surfaces) renders correctly

**Acceptance**: Walk through the store, games visible on shelves, artwork loading on them.

### 2. Shelf-in-room layout (6.1 + 6.2.1) 🔴 PILLAR 1
*The store needs to feel like a store.*

- [ ] Shelves are arranged in an intentional layout (rows, navigable aisles)
- [ ] Confirm or implement alternating shelf rotation (15° offset)
- [ ] Room size scales reasonably for typical library (100–800 games)
- [ ] Layout is configurable (row count / spacing) even if we ship with one preset
- [ ] Entrance/spawn position feels correct

**Acceptance**: Standing at spawn, the scene reads as a store.

### 3. Steam categorization data (6.5 prerequisite) 🔴 PILLAR 2 PREREQUISITE
*Before we can shelve by category, we need to know what categories we have.*

- [ ] Research / confirm which Steam API endpoints give us usable category data
  - See `docs/steam-categorization-research.md` for prior findings
- [ ] Pull and cache categories alongside game library data
- [ ] Data shape defined so shelf-layout code can consume it

### 4. Category-based shelf grouping (6.5) 🔴 PILLAR 2
*Groups of shelves correspond to Steam categories, with visible labels.*

- [ ] Category data drives shelf assignment (which games → which shelves)
- [ ] Shelf group labels visible in scene (signage or floating text)
- [ ] Graceful fallback for uncategorized games

**Acceptance**: Walking the store, distinct sections are labeled by category.

### 5. UI normalization (6.6) 🟡 PARALLEL / GREENLIT
*Sub-agent eligible. Start now — unblocks all future UI work.*
- [ ] Design token spec (colors, spacing, typography)
- [ ] Shared component set (Button, Checkbox, Panel, TabBar)
- [ ] Migrate existing panels to shared components

### 6. Cache previewer fix (6.6.3)
- [ ] Cache preview in Debug tab is broken — diagnose and fix

### 7. GPU memory in Debug tab (6.6.3)
- [ ] `GpuMemoryEstimator` output visible in UI, not just console

---

## Parallel threads we can run now

| Thread | Work | Notes |
|---|---|---|
| Main | 6.2.2.1 game spawning QA + shelf layout (Pillars 1+2) | Needs visual QA |
| Subagent A | UI normalization (6.6) — token spec + component migration | Greenlit |
| Subagent B | Steam categorization research + data pull | Can start independently |

Max 3 concurrent threads against one provider. These are the three.

---

## Layout vocabulary note (2026-04-05)

"Layout" means different things — keep them separate:

- **Game-on-shelf layout**: Spacing, density, front/back placement per shelf board. Current work.
- **Shelf-in-room layout**: How shelves are arranged in 3D space (rows, aisles). Phase 1 Pillar 1.
- **Room layout**: Room shape, dimensions, multiple rooms. Phase 2.
- **Room styles**: Different visual/structural themes. Phase 2.

---

## What "Phase 1 done" looks like

1. Walk into the store from spawn
2. Shelves are laid out navigably in a real store layout
3. Shelves are grouped and labeled by Steam category
4. Games from Steam library are on the shelves with artwork
5. Pause menu works (settings, graphics options, cache management)
6. No obvious visual bugs that would embarrass you showing it to yourself

That's it. Omnibar/search is nice-to-have if binder already mostly covers it — don't block Phase 1 on it.

---

## Parking lot (not Phase 1)

- Sorting & filtering (defer to early Phase 2 / Phase 2 prep)
- Omnibar/search (nice-to-have, binder may cover it already)
- Multiple rooms
- Layout selector / multiple layout types (6.7)
- Theme system (6.8)
- Network rate limiting hardening (Phase 2 feature 5.4)
- Keyboard navigation
- VR controller input
