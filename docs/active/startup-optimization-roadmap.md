# Startup Optimization Roadmap

## Executive Summary

Based on analysis of startup logs and code review, the application takes **~10-16 seconds** to reach a usable state when loading 798 games from cache. This is unacceptable given the hardware capabilities available.

**Target**: Sub-3-second startup to first game boxes visible with cached data.

**Philosophy**: Focus on the **critical path to games loading**. Non-essential operations (emoji atlas, stickers, atmospheric effects) should be deferred until after games are visible.

---

## Critical Path Analysis

### What MUST happen before games appear?

```
Page Load
    ↓
EventManager + Handlers register (~500ms)
    ↓
SceneManager + Camera/Renderer (~100ms)
    ↓
RoomManager creates room structure (~1.5s) ← 🔴 SLOW
    ↓
GpuStorePropsRenderer constructor
    ├── GpuGameBoxRenderer (fast)
    ├── InstancedShelfRenderer.initialize() (~3s) ← 🔴 SLOW (fire-and-forget)
    └── setupEventListeners
    ↓
StorePropsEventTypes.SetupCompleted emitted
    ↓
SceneReady event emitted
    ↓
GameStart event emitted  
    ↓
tryAutoLoadCachedUser()
    ↓
SteamIntegration.loadGamesFromCache()
    ├── IndexedDB read (~400ms)
    ├── Network fetch for uncached (~5s) ← 🔴 BLOCKING
    └── Emit batch events
    ↓
GpuStorePropsRenderer.handleGamesBatch()
    ↓
Games visible! 🎮
```

### Key Blockers Identified

| Blocker | Time | Notes |
|---------|------|-------|
| RoomManager wall creation | ~1.5s | Synchronous, blocking |
| InstancedShelfRenderer.initialize() | ~3s | Fire-and-forget but must complete before shelves can render |
| Network fetch for uncached games | ~5s | Blocks ALL games until complete |

### What's NOT on the critical path (can be deferred)

- Emoji atlas creation (stickers) - flavor, not essential
- Enhanced lighting upgrade - basic lighting is sufficient initially
- Shadow refresh - can happen after games visible
- Signage rendering - decoration
- SharedMaterialManager - already fast (0ms)

---

## Optimization Opportunities (Priority Order)

### 🔴 P0: Non-Blocking Network Fetch (saves ~5 seconds)

**Status**: ✅ IMPLEMENTED (Dec 2025)

**Current**: `loadGamesProgressively()` awaits network fetch for uncached games before returning ANY games
**Problem**: Even with 97% cache hit rate (778/798), we wait 5 seconds for 20 games

**Fix**: Emit cached games immediately, fetch uncached in background
- If >50% cached → return cached immediately, fetch rest in background
- Supplemental batches arrive later as "bonus" games

**Implementation**:
- Added `onBatchReady` callback to `loadGamesProgressively()`
- Cached games emitted in Phase 1, uncached fetched in Phase 2
- Yielding between batch emissions (`await new Promise(r => setTimeout(r, 0))`)
- SteamIntegration uses callback pattern instead of post-processing batches

### 🔴 P1: InstancedShelfRenderer.initialize() Optimization (saves ~3 seconds)

**Current**: Creates shelf geometry templates taking ~3 seconds
**Analysis Needed**: Why does creating 4 simple BoxGeometries take 3 seconds?

**Options**:
a) **Profile first** - What's actually slow? Geometry creation? Material setup? GPU upload?
b) **Geometry caching** - Serialize BufferGeometry to IndexedDB, skip recreation
c) **Simpler initial geometry** - Use basic boxes first, upgrade to detailed later
d) **Web Worker** - Generate geometry off main thread (hides latency)

**Quick win**: Can we delay this init until AFTER games load? Shelves just need to be ready when batches arrive.

### 🔴 P2: Room Wall Creation (saves ~1.5 seconds)

**Status**: ✅ ALREADY EVENT-DRIVEN (Dec 2025)

**Analysis**: Room creation is already event-driven and non-blocking:
- Creates initial room with default dimensions immediately
- Listens for `RoomEventTypes.Resize` and `SteamEventTypes.DataLoaded`
- Dynamically resizes when shelf layout is determined
- Reuses existing walls/floor/ceiling when possible

**What's left to profile**: Why does initial room creation still take ~1.5s?
- Profile individual wall/floor/ceiling creation times
- Check if SharedMaterialManager calls are slow
- Consider deferring walls entirely (floor only initially)

### 🟡 P3: Parallel Initialization

**Status**: ✅ MOSTLY DONE (Dec 2025)

**Analysis**: Most parallelization already in place:
- IndexedDB connections fire-and-forget (AppDetailsCache, ImageManager call `init().catch()`)
- RoomManager creates initial room independently of shelf renderer
- Lighting upgrade is deferred via `EnhancedLightingSystem.upgrade()`
- Non-essential systems run in background via `initializeNonEssentialSystemsAsync()`

**Remaining candidate**: Profile to see if more can be parallelized

### 🟢 P4: Deferred Non-Essential Operations

Move these AFTER games are visible:
- Emoji atlas creation (currently at T+24s anyway, but may block something)
- Enhanced lighting upgrade (basic lighting sufficient)
- Sticker initialization
- Shadow refresh

---

## Implementation Roadmap

### Phase 1: Unblock Network Fetch (1-2 days)
**Status**: ✅ COMPLETE

**Goal**: Cached games visible in <3s even if uncached fetch is slow

1. ✅ Modify `loadGamesProgressively()`:
   - Partition games into cached vs uncached
   - Emit cached batches immediately
   - Return from function (don't await uncached)
   - Fetch uncached in background, emit supplemental batches

2. ✅ Fix race conditions:
   - Add yielding between batch emissions
   - Don't re-initialize renderers on first batch
   - Track "initial" vs "supplemental" batch phases

### Phase 2: Profile & Fix Shelf Init (2-3 days)
**Status**: 🔄 PROFILING ADDED (Dec 2025)

**Goal**: Understand and reduce the 3s shelf initialization

1. ✅ Add detailed timing to `InstancedShelfRenderer.initialize()`:
   - Time each step: geometry creation, material setup, GPU upload
   - Identify the actual bottleneck
   - **Next step**: Run application and examine console output to identify bottleneck

2. Implement fix based on findings:
   - If geometry: Cache serialized geometry in IndexedDB
   - If material: Reuse SharedMaterialManager materials
   - If GPU: Consider deferred upload or WebGL warm-up

### Phase 3: Room Geometry Optimization (1-2 days)
**Status**: ✅ ALREADY OPTIMIZED (Dec 2025)

**Analysis**: Room creation is already event-driven and non-blocking.
Room creates immediately with default dimensions, then resizes when games load.

**Remaining work**: 
- Profile why initial creation still takes ~1.5s
- Consider creating floor only initially, adding walls after render loop starts

### Phase 4: Parallelization (1-2 days)
**Status**: ✅ MOSTLY COMPLETE (Dec 2025)

**Analysis**: Most parallelization already implemented:
- IndexedDB connections are fire-and-forget
- Non-essential systems load asynchronously
- Lighting upgrade is deferred

**Remaining**: Profile to find additional opportunities

---

## Success Metrics

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Time to First Frame | ~3.5s | <1s | See something rendered |
| Time to Games Visible | ~8-13s | <3s | Cached games only |
| Time to Full Load | ~13-16s | <5s | Including uncached fetch |

---

## Investigation Notes

### Why does InstancedShelfRenderer.initialize() take 3 seconds?

Looking at the code, it does:
1. `createGeometryTemplates()` - Creates 4 BoxGeometries
2. `createInstancedMeshes()` - Creates 4 InstancedMesh objects  
3. GPU upload happens on first render

**Hypothesis**: The delay might not be in the code itself but in:
- Main thread being blocked by something else
- Fire-and-forget means it runs when JS is idle
- Could be waiting on SharedMaterialManager

**Action**: Add timestamps inside `initialize()` to pinpoint delay.

### Network Fetch Race Condition Details

The attempted optimization failed because:
1. Batches emitted in tight synchronous loop
2. `initializeForProgressiveLoading()` disposes/recreates gameBoxRenderer on first batch
3. Subsequent batches arrive before re-initialization completes
4. Stale references cause errors

**Fix**: Yield between batches OR don't re-init on first batch

---

## Related Documents
- `docs/active/startup-event-tracking.md` - Tracking implementation
- `docs/active/tech-debt.md` - Related technical debt items
