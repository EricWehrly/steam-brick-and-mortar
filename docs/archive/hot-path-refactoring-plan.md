# Hot Path Refactoring Plan

**Status**: In Progress - Updated 2026-01-18  
**Created**: 2026-01-05  
**Goal**: Streamline critical rendering classes to reduce coupling, eliminate cruft, and improve maintainability

## Context

Several classes in the game's rendering hot path have grown organically and accumulated technical debt:
- Direct dependencies on singletons (`DataManager`, `EventManager`)
- Mixed responsibilities (orchestration + rendering + state management)
- Duplicated logic across similar classes
- Unused or deprecated code paths
- Tight coupling between renderer classes

This refactoring targets the core rendering pipeline that processes Steam games from data → 3D scene.

---

## Current State (Updated 2026-01-18)

### Files & Line Counts
1. **`GpuStorePropsRenderer.ts`** - 729 LOC (↑17 from baseline)
   - Progressive batch loading implemented and working
   - Still has legacy fallback path (`generateShelvesAsync`) for non-batch loading
   - Singleton usage remains (DataManager, EventManager)
   
2. **`GpuGameBoxRenderer.ts`** - 474 LOC (unchanged)
   - Three rendering paths still exist (LOD/Multi/Single)
   - LOD atlas is the primary path, others marked as legacy
   - Settings flags control which path is used

### What's Working Well
- ✅ Progressive batch loading is implemented and performant
- ✅ LOD atlas system proven stable in production
- ✅ Performance monitoring integrated throughout
- ✅ Clear logging and debug capabilities

### Known Pain Points
- ❌ Legacy renderer paths still present despite LOD being proven
- ❌ `addAtmosphericProps()` is non-functional (PropRenderer not instantiated)
- ❌ Direct singleton coupling throughout both files
- ❌ Mixed responsibilities (orchestration + batch management + rendering coordination)
- ❌ Duplicate batch state management logic

---

## Target Files

### Primary Hot Path Classes (Phase 1 - Critical)
1. **`GpuStorePropsRenderer.ts`** (~729 LOC)
   - Orchestrates shelf/game generation from Steam data
   - Manages progressive batch loading with queue + processing state
   - Coordinates between InstancedShelfRenderer and GpuGameBoxRenderer

2. **`GpuGameBoxRenderer.ts`** (~474 LOC)
   - Routes game boxes to appropriate artwork renderers
   - Still maintains three rendering paths (LOD primary, Multi/Single legacy)
   - Has deprecated `createGameBox()` method for sync texture loading

3. **`LodArtworkOrchestrator.ts`** (~399 LOC)
   - Coordinates artwork loading pipeline
   - Manages texture arrays and renderer lifecycle
   - Heavy singleton usage

### Secondary Classes (Phase 2 - Supporting)
4. **`InstancedShelfRenderer.ts`**
   - GPU shelf instancing
   - Batch processing coordination

5. **`LodGameArtworkRenderer.ts`**
   - Core LOD rendering logic
   - Shader material management

6. **`LodTextureArrayManager.ts`**
   - Texture array lifecycle
   - Memory management

7. **`InstancedLabelRenderer.ts`**
   - Label fallback rendering
   - Text texture generation

### Legacy Classes (Phase 3 - Candidates for Removal)
8. **`MultiAtlasArtworkRenderer.ts`** - ⚠️ Marked for removal
   - Multi-tier atlas system (270MB VRAM)
   - Superseded by LOD atlas

9. **`InstancedArtworkRenderer.ts`** - ⚠️ Marked for removal
   - Single atlas system (1GB VRAM)
   - Superseded by LOD atlas

10. **`LodDistanceManager.ts`** - Keep
    - LOD switching logic based on camera distance

11. **`GameArtworkProvider.ts`** - Keep
    - URL strategy + fetch coordination

---

## Refactoring Approach - 4 Passes

### Pass 1: Remove Unused Functionality ✂️ - PRIORITY

**Goal**: Eliminate dead code, deprecated paths, and commented-out functionality to reduce cognitive load.

#### Target Areas - Updated Based on Current Code

**GpuStorePropsRenderer** (729 LOC → Target 400 LOC)
- [x] ~~Remove `addAtmosphericProps()`~~ → ✅ Method exists but empty with TODO - **REMOVE ENTIRELY**
- [ ] Remove `currentStoreGroup` tracking - appears unused (declared but only nulled in dispose)
- [ ] Evaluate `config.tests` and test object spawning - **Keep for now** (used in debug/test modes)
- [ ] Consider removing legacy `generateShelvesAsync()` path - only used when no batches received
  - **Decision needed**: Keep as fallback or force batch loading?
- [ ] Clean up `initializeTestObjects()` - consolidate test logic or extract

**GpuGameBoxRenderer** (474 LOC → Target 250 LOC)
- [ ] **CRITICAL: Legacy Renderer Removal** (Will save ~150 LOC)
  - Remove `InstancedArtworkRenderer` field and path (`!useLodAtlas && !useMultiAtlas`)
  - Remove `MultiAtlasArtworkRenderer` field and path (`!useLodAtlas && useMultiAtlas`)
  - Remove `createGameBoxFromUrlSingleAtlas()` method (~30 LOC)
  - Remove `createGameBoxFromUrlMultiAtlas()` method (~30 LOC)
  - Simplify constructor - remove multi-atlas and single-atlas initialization
  - Remove `setBatchIndex()` method (only used by multi-atlas)
  - Remove `useMultiAtlas` and `useLodAtlas` flags
  - **Rationale**: LOD atlas proven stable, settings flags can be removed
  
- [ ] Remove deprecated `createGameBox()` method
  - Marked `@deprecated for artwork` since line 115
  - Only used internally by `createInstancedArtworkBox()` (which is also deprecated path)
  - Should force all callers to use `createGameBoxFromUrl()` or `createGameBoxAuto()`
  
- [ ] Remove `createInstancedArtworkBox()` - used only by deprecated `createGameBox()`
  
- [ ] Review `ARTWORK_PROBABILITY` constant
  - Currently hardcoded to 1.0 (100% artwork)
  - If labels are staying, keep the constant; if removing labels, remove this too
  - **TODO comment exists**: "We need to go back and actually test our label-only"
  
- [ ] Consider if labels should be removed entirely
  - Labels are fallback for missing artwork
  - Setting `EnableLabels` controls this
  - If artwork reliability is 100%, could simplify by removing labels
  - **Recommendation**: Keep labels as safety net, but document as fallback only

**Estimated Savings After Pass 1**:
- GpuStorePropsRenderer: 729 → ~550 LOC (~180 LOC removed)
- GpuGameBoxRenderer: 474 → ~250 LOC (~224 LOC removed)
- **Total Reduction**: ~400 LOC removed from hot path

---

### Pass 2: Decouple via Events 🔌 - DEFERRED

**Status**: ⏸️ Lower priority - system already uses events extensively  
**Goal**: Replace remaining direct class-to-class calls with event-driven communication to reduce coupling.

**Current Assessment**:
- ✅ Progressive loading already uses events (`GamesBatchReady`, `AllBatchesComplete`)
- ✅ Batch coordination uses events (`InstancedBatchComplete`)
- ⚠️ Direct singleton usage remains (`DataManager.getInstance()`, `EventManager.getInstance()`)
- ⚠️ Direct renderer calls (`gameBoxRenderer.createGameBoxAuto()`)

**Decision**: Focus on Pass 1 (removal) and Pass 4 (extraction) first. Event decoupling can wait until after class sizes are reduced and responsibilities are clearer.

#### Current Coupling Points (For Future Reference)

**Direct Singleton Access** (High Priority)
```typescript
// BEFORE - direct singleton coupling
DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
EventManager.getInstance().emit(GameEventTypes.InstancedBatchComplete)

// AFTER - constructor injection with event alternative
class GpuStorePropsRenderer {
    constructor(
        private scene: THREE.Scene,
        private eventBus: EventBus  // Abstraction over EventManager
    ) {}
    
    // Emit events instead of calling methods
    this.eventBus.emit(RenderEvents.BatchReady, { games, position })
}
```

**Specific Decoupling Targets**

1. **GpuStorePropsRenderer → GpuGameBoxRenderer**
   - Current: Direct method calls `createGameBoxAuto()`
   - Proposed: Emit `GameBoxRequested` event with position/game data
   - GpuGameBoxRenderer subscribes and handles async

2. **GpuGameBoxRenderer → LodArtworkOrchestrator**
   - Current: Direct `setArtworkInstanceFromUrl()` calls
   - Proposed: Emit `ArtworkLoadRequested` event
   - Benefits: Easier to swap artwork strategies without touching game box renderer

3. **LodArtworkOrchestrator → DataManager**
   - Current: Direct singleton access for scene/metadata storage
   - Proposed: Pass scene in constructor, emit `ArtworkReady` event with metadata
   - DataManager handler can persist if needed

4. **All Classes → EventManager**
   - Current: `EventManager.getInstance()` scattered throughout
   - Proposed: Inject `IEventBus` interface in constructors
   - Enables testing, reduces global state

#### Event Redesign

**New Event Types to Introduce**
```typescript
// Game rendering lifecycle
GameBoxRequested { game, position, side }
GameBoxCreated { game, position, instanceId }
ArtworkLoadRequested { gameName, url, position }
ArtworkLoadComplete { gameName, success, instanceId }
ArtworkLoadFailed { gameName, reason }

// Batch processing
BatchProcessingStarted { batchIndex, totalBatches }
BatchProcessingComplete { batchIndex, gamesProcessed }
ShelfCreated { shelfIndex, position, bounds }

// GPU updates
GpuUpdateRequested { source }
GpuUpdateComplete { stats }
```

**Benefits**
- Loose coupling - classes don't need direct references
- Observable workflows - can track complete rendering pipeline
- Easier testing - mock event bus
- Parallel processing - multiple subscribers can react

---

### Pass 3: Extract Duplicated Code 📋 - REVIEW NEEDED

**Goal**: Identify and consolidate repeated patterns, logic, and utilities.

**Status**: Needs fresh analysis with current code - original duplication targets may have changed

#### Potential Duplication (Requires Investigation)

**1. Batch Queue Management**
- `GpuStorePropsRenderer` has complex queue + processing state
- Could extract to: `BatchQueueProcessor` utility class
```typescript
class BatchQueueProcessor {
    enqueue(batch: SteamGamesBatchEvent): void
    processNext(): Promise<void>
    isProcessing(): boolean
    getProgress(): { received: number, total: number }
}
```

**2. Timing & Performance Tracking**
- `TimingState` tracking in GpuStorePropsRenderer
- Already uses `PerformanceMonitor` - could consolidate more
- Extract to: Expand `PerformanceMonitor` or create `BatchPerformanceTracker`

**3. Shelf Position Calculation**
- `preallocateShelfPositions()` and `calculateShelfBoundsAndLayout()`
- Similar logic exists in `createInstancedShelfRow()`
- Could consolidate in: `ShelfLayoutCalculator` utility

**4. Artwork URL Selection Logic**
- `GpuGameBoxRenderer.selectBestArtworkUrl()` prioritizes artwork URLs
- `GameArtworkProvider` may have similar fallback logic
- **Action**: Check if consolidation possible (likely in `GameArtworkProvider`)

**5. Game Position Calculation**
- `GameBoxUtils.calculateGamePositions()` already handles this
- Check if any duplication exists elsewhere

**Recommendation**: Skip this pass initially and revisit after Pass 1 completion. Reducing LOC first will make duplication patterns more obvious.

---

### Pass 4: Extract Responsibilities 🏗️ - HIGH PRIORITY

**Goal**: Break large classes into focused components with single responsibilities.

**Status**: Ready to start after Pass 1 completion

#### GpuStorePropsRenderer Decomposition (729 LOC → Target 200-300 LOC)

**Current Responsibilities** (Too Many!)
1. ✅ Batch queue management (queue, sorting, serialization)
2. ✅ Progressive loading coordination (state tracking, completion detection)
3. ✅ Shelf creation orchestration (position calculation, instancing)
4. ✅ Game box creation orchestration (delegation to GpuGameBoxRenderer)
5. ✅ Bounds tracking (min/max X/Z for room sizing)
6. ✅ Layout calculation (rows, shelves per row)
7. ✅ Event emission/listening (multiple event types)
8. ⚠️ Test object spawning (debug/test mode only - minor concern)
9. ✅ Performance tracking (timing, logging)
10. ⚠️ Legacy fallback handling (`generateShelvesAsync` - consider removing)

**Proposed Breakdown**

```typescript
// 1. Core orchestrator - coordinates high-level flow (Target: 150-200 LOC)
class GpuStorePropsRenderer implements IStorePropsRenderer {
    constructor(
        scene: THREE.Scene,
        private batchCoordinator: BatchCoordinator,
        private shelfManager: ShelfLayoutManager,
        private gameBoxSpawner: GameBoxSpawner,
        private eventBus: IEventBus  // Future: inject instead of singleton
    ) {}
    
    // High-level public API only
    async setupProps(config: PropsConfig): Promise<void>
    clearProps(): void
    dispose(): void
    updatePerformanceData(camera: THREE.Camera): void
    
    // Coordinate between extracted components
    private handleGamesBatch(event: CustomEvent): void
    private finalizeLoading(): void
}

// 2. Extract: Batch queue + processing (Target: 100-150 LOC)
class BatchCoordinator {
    private queue: SteamGamesBatchEvent[] = []
    private state: BatchState
    private metrics: BatchMetrics
    
    enqueueBatch(batch: SteamGamesBatchEvent): void
    async processQueue(): Promise<void>
    getProgress(): { received: number, total: number }
    isComplete(): boolean
    reset(): void
}

// 3. Extract: Shelf layout + bounds tracking (Target: 150-200 LOC)
class ShelfLayoutManager {
    private bounds: ShelfBounds
    private positions: THREE.Vector3[]
    private instancedRenderer: InstancedShelfRenderer
    
    preallocatePositions(totalShelves: number, maxPerRow: number): void
    createShelfAt(index: number, games: SteamGameData[]): void
    getBounds(): ShelfBounds
    getLayout(): { rows: number, shelvesPerRow: number }
    clearAll(): void
}

// 4. Extract: Game box spawning (Target: 100 LOC)
class GameBoxSpawner {
    constructor(
        private gameBoxRenderer: GpuGameBoxRenderer
    ) {}
    
    spawnGamesOnShelf(shelfPosition: THREE.Vector3, games: SteamGameData[]): void
    private spawnOnSurface(shelfPos: THREE.Vector3, surface: ShelfSurface, games: SteamGameData[], side: ShelfSide): void
}

// 5. Performance tracking already exists as PerformanceMonitor - use it more
```

**Benefits of This Breakdown**:
- Each class has clear, single responsibility
- ~500 LOC reduced to ~200 LOC in orchestrator
- Easy to test each component in isolation
- Can swap implementations (e.g., different batching strategies)
- Clearer data flow and ownership

---

#### GpuGameBoxRenderer Decomposition (474 LOC → Target 150-200 LOC)

**Current Responsibilities**
1. ✅ Routing to different renderer backends (LOD/Multi/Single)
2. ✅ Artwork URL selection strategy
3. ✅ Label fallback logic
4. ⚠️ Instance index management (only for single-atlas - being removed)
5. ✅ LOD config building from settings
6. ✅ Dimensions management

**After Pass 1 (Legacy Removal), Will Simplify To**:

```typescript
// Simplified renderer - LOD only (Target: 150-200 LOC after Pass 1)
class GpuGameBoxRenderer implements IGameBoxRenderer {
    private readonly dimensions: GameBoxDimensions
    private lodRenderer: ILodArtworkRendererDebug
    private labelRenderer: InstancedLabelRenderer
    private lodDistanceManager: LodDistanceManagerDebug
    
    constructor(maxGames: number) {
        // Single renderer initialization - no branching logic
        this.lodRenderer = new LodArtworkOrchestratorDebug({ ... })
        this.labelRenderer = new InstancedLabelRenderer({ ... })
        this.lodDistanceManager = new LodDistanceManagerDebug(this.lodRenderer)
    }
    
    // Primary entry point - simplified
    createGameBoxAuto(game: SteamGameData, position: THREE.Vector3, side: ShelfSide): void {
        const url = this.selectBestArtworkUrl(game)
        if (url) {
            this.createGameBoxFromUrl(game, position, url, side)
        } else if (AppSettings.get(Setting.EnableLabels)) {
            this.createLabelGameBox(game, position, side)
        }
    }
    
    // Internal - simplified (no routing logic)
    private createGameBoxFromUrl(game, position, url, side): void {
        this.lodRenderer.setArtworkInstanceFromUrl(position, game.name, url, game.appid)
            .catch(() => { /* fallback to label */ })
    }
    
    private selectBestArtworkUrl(game: SteamGameData): string | undefined
    private createLabelGameBox(game, position, side): void
    
    // Pass-through utilities
    getDimensions(): GameBoxDimensions
    getLodRenderer(): ILodArtworkRendererDebug
    dispose(): void
}
```

**Further Extraction (Optional - After Pass 1)**:
```typescript
// Could extract URL selection to strategy if it grows
class ArtworkUrlStrategy {
    selectBestUrl(game: SteamGameData): string | undefined {
        // Priority: library > header > constructed fallback
    }
}

// Could extract fallback logic
class ArtworkFallbackHandler {
    handleArtworkFailure(game: SteamGameData, position: THREE.Vector3, side: ShelfSide): void {
        if (AppSettings.get(Setting.EnableLabels)) {
            this.labelRenderer.createLabel(game, position, side)
        }
    }
}
```

**Recommendation**: After Pass 1 removes ~220 LOC, GpuGameBoxRenderer will be ~250 LOC and much simpler. Further extraction may not be needed unless complexity increases later.

---

## Implementation Plan - REVISED

### Phase 1: Pass 1 - Remove Legacy Code (HIGH PRIORITY) - 2-3 days
**Goal**: Cut ~400 LOC from hot path, simplify architecture

**Step 1.1: GpuGameBoxRenderer Legacy Removal** (~1 day)
1. ✅ Verify LOD atlas is working in production
2. Remove multi-atlas and single-atlas fields and initialization
3. Remove `createGameBoxFromUrlMultiAtlas()` method
4. Remove `createGameBoxFromUrlSingleAtlas()` method
5. Remove `createInstancedArtworkBox()` method
6. Remove `setBatchIndex()` method
7. Remove `useMultiAtlas` and `useLodAtlas` flags - LOD is always on
8. Simplify `createGameBoxFromUrl()` to only call LOD path
9. Delete `MultiAtlasArtworkRenderer.ts` file
10. Delete `InstancedArtworkRenderer.ts` file
11. Run test suite - ensure no regressions
12. **Commit**: "refactor: remove legacy atlas renderers from GpuGameBoxRenderer"

**Step 1.2: GpuStorePropsRenderer Cleanup** (~1 day)
1. Remove `addAtmosphericProps()` method entirely (non-functional stub)
2. Remove `currentStoreGroup` field (declared but unused)
3. Evaluate `generateShelvesAsync()` - decide to keep or remove
   - If keeping: Document as fallback for non-batch scenarios
   - If removing: Force batch loading always
4. Clean up any remaining dead code
5. Run test suite
6. **Commit**: "refactor: remove dead code from GpuStorePropsRenderer"

**Step 1.3: Settings Cleanup** (~0.5 day)
1. Remove `Setting.UseMultiAtlas` (no longer needed)
2. Remove `Setting.UseLodAtlas` (always true now)
3. Update documentation for removed settings
4. **Commit**: "refactor: remove legacy atlas settings"

**Success Criteria**:
- [ ] GpuGameBoxRenderer: 474 → ~250 LOC (47% reduction)
- [ ] GpuStorePropsRenderer: 729 → ~550 LOC (25% reduction)  
- [ ] All tests pass
- [ ] No performance regression
- [ ] Code is simpler and easier to understand

---

### Phase 2: Pass 4 - Extract Responsibilities (MEDIUM PRIORITY) - 3-4 days
**Goal**: Break down remaining complexity into focused components

**Note**: Only start after Pass 1 is complete and validated

**Step 2.1: Extract BatchCoordinator from GpuStorePropsRenderer** (~1 day)
1. Create `BatchCoordinator` class with queue management
2. Move batch state and queue processing logic
3. Update GpuStorePropsRenderer to use BatchCoordinator
4. Add tests for BatchCoordinator
5. **Commit**: "refactor: extract BatchCoordinator from GpuStorePropsRenderer"

**Step 2.2: Extract ShelfLayoutManager** (~1 day)
1. Create `ShelfLayoutManager` class
2. Move shelf position calculation and bounds tracking
3. Move shelf creation logic
4. Update GpuStorePropsRenderer to delegate to manager
5. Add tests
6. **Commit**: "refactor: extract ShelfLayoutManager from GpuStorePropsRenderer"

**Step 2.3: Extract GameBoxSpawner** (~0.5 day)
1. Create `GameBoxSpawner` class
2. Move game box spawning logic
3. Update GpuStorePropsRenderer
4. Add tests
5. **Commit**: "refactor: extract GameBoxSpawner from GpuStorePropsRenderer"

**Step 2.4: Consolidate and Test** (~1 day)
1. Update GpuStorePropsRenderer to orchestrate between components
2. Run full test suite + integration tests
3. Performance benchmarking
4. Update documentation
5. **Commit**: "refactor: complete GpuStorePropsRenderer decomposition"

**Success Criteria**:
- [ ] GpuStorePropsRenderer: ~550 → ~200 LOC (64% from original)
- [ ] Each extracted class has single responsibility
- [ ] 80%+ test coverage on new classes
- [ ] No performance regression
- [ ] Clear ownership and separation of concerns

---

### Phase 3: Pass 2 - Event Decoupling (LOW PRIORITY) - DEFERRED
**Status**: ⏸️ Can wait until after Phase 1 & 2 are complete

This phase would introduce event-driven architecture to replace remaining singleton dependencies and direct method calls. However, given that:
- Progressive loading already uses events extensively
- System is working well with current architecture
- Pass 1 and Pass 4 provide more immediate value

**Recommendation**: Defer this phase indefinitely or until there's a clear need for more decoupling.

---

### Phase 4: Pass 3 - Extract Duplication (LOW PRIORITY) - OPTIONAL
**Status**: ⏸️ Review after Phase 1 & 2 completion

With fewer LOC and clearer responsibilities after Phase 1 & 2, duplication patterns will be more obvious. Revisit this phase only if significant duplication emerges.

---

## Success Criteria - UPDATED

### Quantitative Goals
- [x] GpuGameBoxRenderer: 474 → ~250 LOC (47% reduction via Pass 1)
- [ ] GpuStorePropsRenderer: 729 → ~200 LOC (72% reduction via Pass 1 + 4)
- [ ] Total hot path reduction: ~600 LOC removed
- [ ] Maintain 80%+ test coverage on refactored classes
- [ ] No performance regression (maintain <16ms frame budget)
- [ ] No memory regression (VRAM usage same or lower)

### Qualitative Goals
- [ ] Classes have single, clear responsibility (after Pass 4)
- [ ] LOD atlas is the only rendering path (after Pass 1)
- [ ] New developers can understand flow in 30 minutes
- [ ] Changes to one component don't require touching others

### Non-Goals (Explicit Out of Scope)
- ❌ Rewrite rendering algorithms (keep existing logic)
- ❌ Change external APIs (maintain backward compatibility where reasonable)
- ❌ Performance optimization beyond cleanup
- ❌ Three.js version upgrade
- ❌ Shader refactoring
- ❌ Full event-driven architecture (defer to future)
- ❌ Dependency injection framework (defer to future)

---

## Risks & Mitigation - UPDATED

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking LOD atlas in production | **CRITICAL** | Test thoroughly before removal, feature flag for rollback if needed |
| Performance regression in VR | HIGH | Continuous benchmarking, measure before/after |
| Breaking existing game spawning | MEDIUM | Comprehensive integration tests, validate game count/positions |
| Removing needed legacy fallbacks | MEDIUM | Verify multi/single atlas truly unused, keep commit separate for easy revert |
| Over-extraction creates more complexity | LOW | Only extract when clear benefit, start with Pass 1 simplification first |

---

## Open Questions - UPDATED

1. **Legacy `generateShelvesAsync()` Path**: Keep or remove?
   - **Context**: Only used when no batches received (edge case)
   - **Options**: 
     - Keep as fallback (safer, handles edge cases)
     - Remove and force batch loading (simpler, fewer code paths)
   - **Recommendation**: Keep for now, document as fallback

2. **Label Renderer**: Keep or simplify?
   - **Context**: Labels are fallback for missing artwork
   - **Status**: TODO comment says "need to test label-only"
   - **Recommendation**: Keep as safety net, artwork isn't 100% reliable yet

3. **Settings Removal**: Remove `UseLodAtlas` and `UseMultiAtlas` settings?
   - **Context**: After Pass 1, LOD is the only path
   - **Recommendation**: Remove in Pass 1, step 1.3

4. **LodArtworkOrchestrator**: Include in refactoring scope?
   - **Context**: Not in current hot path analysis
   - **Recommendation**: Out of scope for this refactor - tackle separately if needed

5. **Test Object Spawning**: Keep `initializeTestObjects()`?
   - **Context**: Used for debug/test modes
   - **Recommendation**: Keep - small code, useful for debugging

---

## Immediate Next Steps

### Ready to Start - Phase 1, Step 1.1 (GpuGameBoxRenderer Legacy Removal)

**Pre-work** (30 minutes):
1. ✅ Document current state (this file updated)
2. Create feature branch: `git checkout -b refactor/remove-legacy-atlas-renderers`
3. Run full test suite to establish baseline: `yarn test`
4. Run performance benchmark if available
5. Tag current commit: `git tag pre-refactor-legacy-removal`

**Implementation** (~1 day):
- Follow Step 1.1 checklist above
- Commit frequently with clear messages
- Test after each major change

**Validation**:
- All tests pass
- Manual VR testing - verify games load correctly
- Check console for errors
- Verify VRAM usage is same or lower

**Ready to proceed?** This is the highest-value, lowest-risk first step. Removes ~220 LOC and simplifies architecture significantly.

---

**Document Status**: ✅ Updated and Ready for Implementation  
**Last Updated**: 2026-01-18  
**Next Action**: Begin Phase 1, Step 1.1 - GpuGameBoxRenderer Legacy Removal
