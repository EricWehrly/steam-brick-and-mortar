# GpuStorePropsRenderer Event Untangling Plan

**Status**: In Progress (Phase 3f single-path active, focused unit coverage passing)  
**Created**: 2026-01-18  
**Updated**: 2026-03-20  
**Goal**: Remove GpuStorePropsRenderer as middleman, let components communicate directly via events

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Extract GameBoxSpawner | ✅ COMPLETE | GameBoxSpawner extracted, event listeners registered |
| Phase 2: Self-Registering BatchCoordinator | ✅ COMPLETE | Self-registers for GamesBatchReady |
| Phase 3: Event-Driven Flow | 🔄 IN PROGRESS | Single-path events active; completion now emitted by BatchCoordinator |
| Phase 4: Remove Middleman | ⬜ NOT STARTED | Waiting for Phase 3 validation |

### ✅ Blocker Resolved: `waitForShelfRendererReady` Now Event-Driven

**Original Issue**: Polling loop blocked initialization for 4-5 seconds

**Resolution** (completed 2026-01-23):
- ✅ Added `RendererReady` event type to `StorePropsEventTypes`
- ✅ `InstancedShelfRenderer.initialize()` now emits `RendererReady` after completion
- ✅ `GpuStorePropsRenderer` listens for event instead of polling
- ✅ Fast path: immediate return if already ready
- ✅ Slow path: queue callback to resolve when event fires
- ✅ All 644 unit tests pass

**Performance Impact**: Eliminates 50ms polling intervals and 10-second timeout blocker

**Code Changes**:
- `InteractionEvents.ts`: Added `RendererReady` event and `RendererReadyEvent` interface
- `InstancedShelfRenderer.ts`: Emits event after successful initialization
- `GpuStorePropsRenderer.ts`: Event-driven initialization with queue for pending requests

---

## Prerequisite: Document Class Roles ✅ COMPLETE

Class responsibilities have been documented. Key findings:

- **No ShelfLayoutManager exists** - shelf creation logic is embedded in GpuStorePropsRenderer
- **SharedPropsUtils are pure static utilities** - no behavioral changes needed
- **InstancedShelfRenderer needs RendererReady event** - currently polled via `isReady()`
- **StoreLayout is for procedural/legacy path only** - GPU-instanced path bypasses it

### Files Documented

| File | Status | Role Summary |
|------|--------|--------------|
| `GpuStorePropsRenderer.ts` | ✅ Documented | High-level coordinator, owns layout, delegates rendering |
| `BatchCoordinator.ts` | ✅ Documented | Queue management, emits BatchReadyForPlacement |
| `GameBoxSpawner.ts` | ✅ Documented | Places games on shelves via renderer |
| `InstancedShelfRenderer.ts` | ✅ Documented | GPU-instanced shelf rendering (NEEDS RendererReady event) |
| `ShelfLayoutManager.ts` | ❌ Does not exist | Could extract shelf creation from GpuStorePropsRenderer |
| `StoreLayout.ts` | ✅ Documented | Procedural/Legacy path, NOT used by GPU-instanced |
| `SharedPropsUtils.ts` | ✅ Reviewed | Pure re-exports, actual utils are static functions |
| `GpuGameBoxRenderer.ts` | ✅ Documented | GPU-instanced game box rendering with LOD |

### Template for Role Documentation

```typescript
/**
 * [CLASS NAME]
 * 
 * ROLE: [One sentence description of primary responsibility]
 * 
 * OWNS:
 * - [Thing it creates and manages]
 * - [State it tracks]
 * 
 * RECEIVES (Events/Inputs):
 * - [Event] → [What it does in response]
 * 
 * EMITS (Events/Outputs):
 * - [Event] → [When/why emitted]
 * 
 * DELEGATES TO:
 * - [Other class] for [what]
 * 
 * DOES NOT:
 * - [Anti-pattern to avoid]
 */
```

---

## Current Problems

### 1. GpuStorePropsRenderer is a God Object Middleman

**Current flow:**
```
SteamEventTypes.GamesBatchReady
    ↓
GpuStorePropsRenderer.handleGamesBatch()      ← Middleman listening
    ↓
BatchCoordinator.enqueueBatch()
    ↓
BatchCoordinator calls back processOneBatch()  ← Middleman processing
    ↓
GpuStorePropsRenderer.processOneBatch()
    ↓ calls ShelfLayoutManager.createShelfForBatch()
    ↓ queries getShelfPosition() back
    ↓ spawns games itself
    ↓ checks isComplete
    ↓ emits AllBatchesComplete
```

**Problems:**
- GpuStorePropsRenderer touches EVERYTHING
- Changes to batch flow require editing this class
- Changes to shelf creation require editing this class
- Changes to game spawning require editing this class
- Can't test components in isolation
- Debugging requires tracing through 5 method calls

### 2. Half-Extracted Components Still Coupled

**ShelfLayoutManager:**
- ✅ Creates shelf instances
- ❌ GpuStorePropsRenderer still calls it, queries it, then spawns games itself
- Should: Emit `ShelfCreated` event with position, let others react

**BatchCoordinator:**
- ✅ Manages queue and serialization
- ❌ Callbacks route through GpuStorePropsRenderer
- Should: Emit events directly, self-register for batch events

### 3. Inverted Design Philosophy

**Current (Supply-Driven):**
> "I have a batch of games → Create a shelf → Put games on shelf"

**Desired (Demand-Driven):**
> "Games need a place to live → Create shelf to accommodate → Place games"

This is subtle but important - the shelf creation should be triggered BY the need to place games, not as a separate sequential step.

## Target Architecture

### Clean Event Flow

```
SteamEventTypes.GamesBatchReady
    ↓
BatchCoordinator (self-registered listener)
    ↓ processes queue
    ↓ emits BatchReadyForPlacement { games, batchIndex, totalBatches }
    ↓
GameBoxSpawner (listens for BatchReadyForPlacement)
    ↓ "I need to place N games"
    ↓ emits ShelfSpaceRequested { gamesCount, batchIndex }
    ↓
ShelfLayoutManager (listens for ShelfSpaceRequested)
    ↓ "I'll create a shelf for those games"
    ↓ creates shelf instance
    ↓ emits ShelfCreated { position, batchIndex, bounds }
    ↓
GameBoxSpawner (listens for ShelfCreated)
    ↓ places games on that shelf
    ↓ emits GamesPlaced { count, batchIndex }
    ↓
BatchCoordinator (listens for GamesPlaced or tracks internally)
    ↓ when all batches placed
    ↓ emits AllBatchesComplete { shelfBounds, shelfLayout }
```

**Key improvements:**
- No middleman - components talk directly via events
- Demand-driven - shelves created because games need space
- Testable - can test each component in isolation
- Observable - can track complete flow via event log
- Extensible - add new listeners without touching existing code

### Component Responsibilities (After)

**GpuStorePropsRenderer** - High-level coordinator (Target: ~150 LOC)
- Create and wire up components
- Public API for setupProps/clearProps/dispose
- NO business logic, NO event listening (except setup/teardown)

**BatchCoordinator** - Batch queue management (~150 LOC existing)
- Self-registers for `GamesBatchReady` events
- Manages queue and serialization
- Emits `BatchReadyForPlacement` for each batch
- Emits `AllBatchesComplete` when done
- Tracks metrics

**ShelfLayoutManager** - Shelf positioning and creation (~280 LOC existing)
- Listens for `ShelfSpaceRequested`
- Calculates positions
- Creates shelf instances via InstancedShelfRenderer
- Emits `ShelfCreated` events
- Tracks bounds and layout
- Responds to queries (getBounds, getLayout, etc.)

**GameBoxSpawner** - Game placement logic (NEW, ~100 LOC)
- Listens for `BatchReadyForPlacement`
- Requests shelf space
- Listens for `ShelfCreated`
- Places games on shelves via GpuGameBoxRenderer
- Emits `GamesPlaced`

## Implementation Plan

### Phase 1: Extract GameBoxSpawner (BIG WIN, LOW RISK)

**Why first:** Removes game spawning logic from GpuStorePropsRenderer without touching event flow yet.

**Create `GameBoxSpawner.ts`:**
```typescript
export class GameBoxSpawner {
    constructor(
        private gameBoxRenderer: GpuGameBoxRenderer
    ) {}
    
    spawnGamesOnShelf(
        shelfPosition: THREE.Vector3,
        games: SteamGameData[]
    ): void {
        // Move spawnInstancedGamesOnShelf logic here
        // Move createInstancedGameBoxes logic here
        // Move createSingleInstancedGameBox logic here
    }
}
```

**Update GpuStorePropsRenderer:**
- Create GameBoxSpawner in constructor
- Replace `spawnInstancedGamesOnShelf()` with `gameBoxSpawner.spawnGamesOnShelf()`
- Delete 3 private methods (~60 LOC removed)

**Tests:**
- Create GameBoxSpawner.test.ts
- Test game positioning logic in isolation

**Commit:** `refactor: extract GameBoxSpawner from GpuStorePropsRenderer`

---

### Phase 2: Make BatchCoordinator Self-Registering (MEDIUM WIN, MEDIUM RISK)

**Why second:** Removes event listening from GpuStorePropsRenderer, but keeps callback pattern temporarily.

**Update `BatchCoordinator.ts`:**
```typescript
export class BatchCoordinator<T extends { batchIndex: number; totalBatches: number }> {
    constructor(
        private processor: (batch: T) => Promise<void>,
        private eventManager: EventManager = EventManager.getInstance()
    ) {
        // Self-register for batch events
        this.eventManager.registerEventHandler(
            SteamEventTypes.GamesBatchReady,
            this.handleBatchEvent.bind(this)
        )
    }
    
    private handleBatchEvent(event: CustomEvent<T>): void {
        this.enqueueBatch(event.detail)
    }
}
```

**Update GpuStorePropsRenderer:**
- Remove `setupEventListeners()` method
- Remove `handleGamesBatch()` method
- BatchCoordinator now self-registers
- Still calls back to `processOneBatch` (not changing that yet)

**Tests:**
- Update BatchCoordinator tests to verify self-registration
- Verify GpuStorePropsRenderer still works

**Commit:** `refactor: make BatchCoordinator self-registering for batch events`

---

### Phase 3: Event-Driven Shelf Creation (BIG WIN, HIGHER RISK)

⚠️ **This is where we change the flow significantly - save for after phases 1 & 2 are validated**

**New Event Types (in InteractionEvents.ts):**
```typescript
export const StorePropsEventTypes = {
    // ... existing ...
    ShelfSpaceRequested: 'store-props:shelf-space-requested',
    ShelfCreated: 'store-props:shelf-created',
    GamesPlaced: 'store-props:games-placed',
    BatchReadyForPlacement: 'store-props:batch-ready-placement'
} as const

export interface ShelfSpaceRequestedEvent {
    gamesCount: number
    batchIndex: number
}

export interface ShelfCreatedEvent {
    position: THREE.Vector3
    batchIndex: number
    bounds: ShelfBounds
}

export interface GamesPlacedEvent {
    gamesCount: number
    batchIndex: number
}

export interface BatchReadyForPlacementEvent {
    games: SteamGameData[]
    batchIndex: number
    totalBatches: number
}
```

**Update ShelfLayoutManager:**
- Add event listener for `ShelfSpaceRequested`
- Change `createShelfForBatch()` to emit `ShelfCreated` event after creation
- Make it reactive instead of called

**Update GameBoxSpawner:**
- Add event listener for `BatchReadyForPlacement`
- Emit `ShelfSpaceRequested` when games arrive
- Add event listener for `ShelfCreated`
- Spawn games when shelf arrives
- Emit `GamesPlaced` when done

**Update BatchCoordinator:**
- Emit `BatchReadyForPlacement` instead of calling processor callback
- Listen for `GamesPlaced` to track completion
- Emit `AllBatchesComplete` when all done

**Update GpuStorePropsRenderer:**
- Simplify `processOneBatch` to just data transformation
- Or remove it entirely if no longer needed
- Remove all the coordination logic

**Tests:**
- Integration test for complete flow
- Verify events fire in correct order
- Verify all games get placed

**Commit:** `refactor: event-driven shelf creation and game placement`

---

### Phase 4: Remove GpuStorePropsRenderer as Processor (CLEANUP)

After Phase 3, `processOneBatch` is probably just data transformation. Move it or delete it.

**Update GpuStorePropsRenderer:**
- Remove `processOneBatch` if no longer needed
- Remove `games` tracking if no longer needed
- Remove `progressiveLoadingCompleted` if no longer needed
- Keep only: construction, dispose, public API

**Target LOC:** ~150 (down from 447)

**Commit:** `refactor: simplify GpuStorePropsRenderer to coordinator role`

---

## Open Questions / Future Work

### Q1: Who owns game collection for finalization?

**Current:** GpuStorePropsRenderer tracks `this.games` for the final log message.

**Options:**
- A) Keep in GpuStorePropsRenderer (simplest)
- B) Move to BatchCoordinator (makes sense there)
- C) Event payload includes game count, no tracking needed

**Recommendation:** Option C - `AllBatchesComplete` event can include total game count.

Choice: C seems best. Regardless, games should be accessible from cache, which should be accessible as a singleton.

### Q2: Who emits `AllBatchesComplete`?

**Current:** GpuStorePropsRenderer checks `isComplete` and emits.

**After Phase 3:**
- BatchCoordinator knows when all batches processed
- GameBoxSpawner knows when all games placed
- ShelfLayoutManager knows bounds and layout

**Options:**
- A) BatchCoordinator emits (but doesn't know bounds/layout)
- B) GameBoxSpawner emits (but doesn't know bounds/layout)
- C) ShelfLayoutManager emits when `GamesPlaced` count matches expected

bounds and layout don't need to be tied to "all batches are complete" as a signal, but calls that need those will need to resolve to get them, perhaps by querying an appropriate party.

**Recommendation:** Option C - ShelfLayoutManager listens for `GamesPlaced`, when cumulative count matches expected games, it emits `AllBatchesComplete` with bounds/layout.

### Q3: How to handle initialization?

**Current:** First batch triggers `initializeForProgressiveLoading(totalBatches)`.

**After Phase 3:**
- BatchCoordinator knows when first batch arrives
- ShelfLayoutManager needs total count for preallocate
- GpuGameBoxRenderer needs game count estimate

**Options:**
- A) BatchCoordinator emits `FirstBatchReceived` event with total count
- B) Keep `isFirstBatchProcessing()` callback pattern temporarily
- C) Each component listens for first batch and initializes itself

**Recommendation:** Option A - clean event-driven initialization.

GPU game box renderer and friends should get the total # of games once the steam profile is loaded. Which should be an event that fires regardless of whether we're loading from cache
And the firing of that event should signal the start of what those other classes are concerned with.
And "steam profile loaded" should signal to others anything they need to know about games/user/etc. unless that gets overloaded and we need to pick it apart later.

### Q4: Demand-driven shelf creation - how far?

The "games need a place" philosophy is elegant but might be overengineering for v1.

**Current approach:** Pre-allocate all shelf positions upfront, then create shelves as batches arrive.

**Pure demand-driven:** Don't pre-allocate. Create shelves on-demand as games arrive. Handle partial batches, variable shelf sizes, etc.

**Recommendation:** Keep pre-allocation for now (it works well). Pure demand-driven is a future optimization when we have dynamic shelf sizing, different shelf types, etc.

### Q5: What if shelf creation fails?

**Current:** Logs error, returns early from `createShelfForBatch`.

**After Phase 3:** Who handles the failure?
- ShelfLayoutManager logs error, doesn't emit `ShelfCreated`
- GameBoxSpawner times out waiting? Skips those games?
- BatchCoordinator never completes?

**Recommendation:** Emit `ShelfCreationFailed` event. GameBoxSpawner can retry or skip. BatchCoordinator can still complete with partial success. **Defer to future work.**

Individual shelves should be able to fail without impacting other shelves or dependent processes. The failure should show up as an error log.

---

## Success Criteria

### After Phase 1: ✅ COMPLETE
- [x] GameBoxSpawner created (~192 LOC)
- [x] GpuStorePropsRenderer reduced by ~60 LOC
- [x] Game spawning logic isolated and testable

### After Phase 2: ✅ COMPLETE
- [x] BatchCoordinator self-registers for events
- [x] GpuStorePropsRenderer no longer listens for `GamesBatchReady`
- [x] Event flow cleaner

### After Phase 3: 🔄 IN PROGRESS
- [x] ShelfSpaceRequested event implemented
- [x] ShelfCreated event implemented  
- [x] GamesPlaced event implemented
- [x] Dual-path transition validated (events alongside callbacks)
- [x] Remove callback path (old method calls)
- [x] Remove `waitForShelfRendererReady` polling loop
- [x] InstancedShelfRenderer emits RendererReady event
- [ ] Integration test validates complete flow (currently skipped due memory-leak track item)
- [x] Focused unit suites passing (BatchCoordinator, GameBoxSpawner, RendererReady tests)

### After Phase 4:
- [ ] GpuStorePropsRenderer ~150 LOC (currently ~540 LOC)
- [ ] Clear separation of concerns
- [ ] Each component testable in isolation
- [ ] No regressions

---

## Risk Mitigation

**Phase 1 (Low Risk):**
- Pure extraction, no behavior change
- Easy to test
- Easy to revert

**Phase 2 (Medium Risk):**
- Changes event registration but not flow
- Test that callbacks still work
- Validate no event listener leaks

**Phase 3 (High Risk):**
- Changes flow significantly
- Create integration test FIRST
- Run live test after each small change
- Consider feature flag if worried

**Phase 4 (Low Risk):**
- Just cleanup after Phase 3 works
- Mostly deleting dead code

---

## Next Steps

1. **Review this plan** - does target architecture make sense?
2. **Start Phase 1** - extract GameBoxSpawner (safe, high value)
3. **Validate Phase 1** - run tests, live test, commit
4. **Start Phase 2** - self-registering BatchCoordinator
5. **Validate Phase 2** - run tests, live test, commit
6. **Pause before Phase 3** - ensure Phases 1-2 are solid
7. **Plan Phase 3 details** - work through open questions
8. **Implement Phase 3 incrementally** - one event at a time

---

**Timeline Estimate:**
- Phase 1: 2-3 hours
- Phase 2: 1-2 hours
- Phase 3: 4-6 hours (including testing/debugging)
- Phase 4: 1 hour

**Total: 1-2 days of focused work**

**Priority:** HIGH - This untangling is critical for maintainability and enables future features like dynamic shelf sizing, different shelf types, game filtering/sorting, etc.
