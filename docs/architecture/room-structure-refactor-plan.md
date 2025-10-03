# Room Structure Refactor Plan

## Problem Analysis

The current room/environment creation is a tangled mess with multiple classes creating duplicate structures:

1. **SceneCoordinator:86** - Creates basic environment via EnvironmentRenderer
2. **StorePropsRenderer.expandStoreEnvironment()** - Creates duplicate/resized environment  
3. **EnvironmentRenderer** - Wraps RoomStructureBuilder
4. **RoomStructureBuilder** - Actually creates walls/floor/ceiling
5. **StoreLayout** - Has some room calculation logic
6. **Multiple constants scattered across files**

This creates:
- Duplicate room structures being built
- Unclear single source of truth
- Constants spread across multiple files
- Complex dependency injection chains
- Difficult debugging and maintenance

## Solution: Single Room Manager Architecture

### Phase 1: Create Unified Room Manager

**New File: `src/scene/RoomManager.ts`**
- Single responsibility: Room structure creation and resizing
- Event-driven: Responds to room creation/resize events
- Self-contained: All room-related constants and logic in one place
- Reusable: Can create initial room OR resize existing room

### Phase 2: Event-Driven Room Lifecycle

**Events:**
- `room:create-initial` - Create basic room at app startup
- `room:resize` - Dynamically resize room for game count

**Flow:**
1. SceneCoordinator emits `room:create-initial` during basic setup
2. Later, when games load, emit `room:resize` with calculated dimensions
3. RoomManager handles both events, reusing existing walls when possible

### Phase 3: Centralize Constants and Logic

**Move to RoomManager:**
- All SHELF_SPACING_* constants
- All STORE_* constants  
- Room dimension calculations
- Game layout math (GAMES_PER_SURFACE, SURFACES_PER_SHELF)

**Access Pattern:**
```typescript
// Get game count from global app instance (temporary solution)
const gameCount = window.steamBrickAndMortarApp?.getSteamIntegration()?.getGameLibrary()?.getGameCount() || 0

// Calculate required dimensions
const dimensions = RoomManager.calculateDimensions(gameCount)

// Emit resize event
EventManager.emit('room:resize', { dimensions })
```

### Phase 4: Wall Reuse Optimization

Instead of destroying/recreating walls:
- **Reposition existing walls** to new dimensions
- **Resize floor/ceiling meshes** with new geometry
- **Only create new objects if none exist**

This saves Three.js instancing time and reduces memory churn.

## Implementation Steps

### Step 1: Create RoomManager Class ✅ COMPLETED
- [x] Create `src/scene/RoomManager.ts`
- [x] Move all room constants from StorePropsRenderer
- [x] Implement initial room creation
- [x] Implement room resizing with wall reuse
- [x] Add event listeners for room lifecycle

### Step 2: Update Event System ✅ COMPLETED
- [x] Define room events in InteractionEvents.ts
- [x] Add room event types to EventManager

### Step 3: Refactor SceneCoordinator ✅ COMPLETED
- [x] Replace EnvironmentRenderer.setupEnvironment() call with room:create-initial event
- [x] Remove duplicate environment creation logic

### Step 4: Refactor StorePropsRenderer ✅ COMPLETED
- [x] Remove expandStoreEnvironment() method - replaced with room:resize event emission
- [x] Remove all room creation constants/logic (moved to RoomManager.RoomConstants)
- [x] Make GAMES_PER_SURFACE and SURFACES_PER_SHELF public static properties (GameLayoutConstants)
- [x] Emit room:resize event instead of creating environment
- [x] Add event listener for room:resized to spawn shelves
- [x] Update RoomManager to handle both legacy (width/depth/height) and new (gameCount) event formats

**Current State**: Full event-driven flow implemented. StorePropsRenderer now emits room:resize events and listens for room:resized to spawn shelves. RoomManager handles dimension calculation.

### Step 5: Clean Up Dead Code 🚧 PENDING  
- [ ] Remove or deprecate EnvironmentRenderer room creation
- [ ] Remove duplicate RoomStructureBuilder usage
- [ ] Clean up unused imports and methods

**Current State**: EnvironmentRenderer.setupEnvironment() is commented out in SceneCoordinator but file still exists. RoomStructureBuilder may still be used by EnvironmentRenderer.

### Step 6: Update Game Loading Flow ✅ COMPLETED
- [x] Steam data loaded → SceneCoordinator emits room:resize with gameCount
- [x] RoomManager calculates dimensions → resizes room → emits room:resized  
- [x] StorePropsRenderer receives room:resized → spawns shelves in correctly sized room

**Current State**: Full event-driven game loading flow implemented. SceneCoordinator → RoomManager → StorePropsRenderer via events.

## Immediate Fixes (Current Session) ✅ COMPLETED
- [x] Fix light positioning relative to ceiling height
- [x] Add entrance floor mat  
- [x] Make lighting responsive to room resize events
- [x] Fix CarpetMaterialGenerator color handling bug
- [x] Restore game spawning on shelves (SceneCoordinator event handler)

## Current Status (As of Commit)

**✅ ACHIEVED:**
- RoomManager created with all room constants and logic
- Event-driven room creation via room:create-initial and room:resize events  
- SceneCoordinator integrated with RoomManager (no more duplicate environments)
- LightingRenderer responds to room dimension changes dynamically
- Entrance mat creation integrated into room setup
- Wall reuse optimization implemented (resizes instead of recreating)
- Game spawning restored and working

**🚧 REMAINING WORK:**
- EnvironmentRenderer cleanup needed (Step 5)
- Some integration tests failing due to legacy dependencies
- Event data structure debugging (room:resize event format compatibility)

## Expected Benefits

1. **Single Source of Truth**: All room logic in RoomManager ✅
2. **No More Duplicates**: Only one system creates/manages room structure ✅  
3. **Event-Driven**: Clean separation of concerns via events ✅
4. **Performance**: Wall reuse instead of recreation ✅
5. **Maintainable**: Clear responsibility boundaries ✅
6. **Extensible**: Easy to add non-square rooms later ✅

## Migration Strategy

- Create RoomManager alongside existing code
- Gradually migrate callers to use events
- Remove old code once migration is complete
- Can commit incremental progress and rollback if needed

## TODO: Future Improvements

- Replace window.steamBrickAndMortarApp access with proper dependency injection
- Add support for non-square room shapes
- Implement more sophisticated wall reuse algorithms
- Add room state persistence/caching
- **TODO: Fluorescent Light Improvements**
  - Make fluorescent overhead lights physically touch the ceiling (like in real life)
  - Add rounded corners to fluorescent light fixtures for more realistic appearance
  - Consider adding light fixture geometry that properly connects to ceiling structure