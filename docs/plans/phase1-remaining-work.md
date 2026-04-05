# Phase 1 Remaining Work — "Here to the End"

**Created**: 2026-04-05  
**Purpose**: Honest working list of what stands between now and "ready for me" (Phase 1 complete). Intended to be shorter and more focused than the full `phase1-ready-for-me.md`. Reconcile with that doc after Phase 1 wraps.

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
- 🔄 Room resizes dynamically to fit game library — implemented, not visually confirmed at scale
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

### 2. Level layout — shelf/room spatial design (6.1 + 6.2.1) 🔴 IMMEDIATE
*The store needs to feel like a store, not a corridor of floating shelves.*

- [ ] Confirm alternating shelf rotation (15° offset) is implemented or implement it
- [ ] Verify shelf spacing makes it navigable (can walk between them)
- [ ] Room size scales reasonably for typical library (100–800 games)
- [ ] Entrance/spawn position feels correct

**Acceptance**: Standing at spawn, the scene reads as a store.

### 3. MDF veneer shelf visual pass (6.1.1) 🟡 NEXT
- [ ] Shelves display MDF veneer material (implemented — confirm visually)
- [ ] Brand accent color (blue) on vertical supports
- [ ] Shelf interior surfaces glossy white

### 4. Wall/ceiling texture polish (Phase 2 capstone, but pull forward if easy)
- [ ] Wall planks read as planks at VR scale — may just need repeat/scale tuning
- [ ] Ceiling popcorn visible at natural overhead view angle

### 5. Game search / omnibar (6.6 UI, post-normalization)
*After UI normalization is in place.*
- [ ] Omnibar-like search in place of Steam profile UI once library is loaded
- [ ] Spotlight highlighting of search results

### 6. UI normalization (6.6) 🟡 PARALLEL WORK
*See `docs/plans/ui-normalization-plan.md`. Sub-agent eligible.*
- [ ] Design token spec
- [ ] Shared component set (Button, Checkbox, Panel, TabBar)
- [ ] Migrate existing panels

### 7. Cache previewer fix (6.6.3)
- [ ] Cache preview in Debug tab is broken — diagnose and fix

### 8. GPU memory in Debug tab (6.6.3)
- [ ] `GpuMemoryEstimator` output visible in UI, not just console

---

## Layout vocabulary note (2026-04-05)

"Layout" means two different things — we need to keep them separate:

- **Game-on-shelf layout**: How many games per shelf surface, spacing, front/back, which game goes where. Current work.
- **Shelf-in-room layout**: How shelves are arranged in 3D space (rows, spokes, circles, etc.). Milestone 6.7 in the roadmap.
- **Room layout**: Room shape, dimensions, number of rooms. Phase 2 (multiple rooms is a Phase 2 item after "ready for friends").
- **Room styles**: Different visual/structural themes for the room itself (not just textures — geometry and layout). Phase 2, after "ready for friends".

---

## What "Phase 1 done" looks like

1. Walk into the store from spawn
2. Shelves are laid out navigably, roughly store-shaped
3. Games from Steam library are on the shelves with artwork
4. Can search for a game and it spotlights
5. Pause menu works (settings, graphics options, cache management)
6. No obvious visual bugs that would embarrass you showing it

That's it. Not perfect — just demo-ready for yourself.

---

## Parking lot (not Phase 1)

- Multiple rooms
- Categorization-based shelving (6.5)
- Layout selector (6.7)
- Theme system (6.8)
- Network rate limiting hardening (Phase 2 feature 5.4)
- Keyboard navigation
- VR controller input
