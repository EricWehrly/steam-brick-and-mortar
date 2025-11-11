# GameBoxRenderer Split Implementation Plan

**Context**: Split GameBoxRenderer (~483 lines) into LegacyGameBoxRenderer and GpuGameBoxRenderer following the StorePropsRenderer bifurcation pattern.

**Pattern Reference**: See LegacyStorePropsRenderer / GpuStorePropsRenderer for established bifurcation approach.

---

## Phase A: Create Interface and Foundation

### ✅ A.1: Create IGameBoxRenderer Interface
**Status**: COMPLETE  
**File**: `client/src/scene/game-box/IGameBoxRenderer.ts`

**Interface Definition**:
```typescript
export interface IGameBoxRenderer {
    createGameBox(game, position, textureOptions?, name?, side?): THREE.Mesh
    createBatchGameBoxes(requests: GameBoxRequest[]): void
    hasInstancedLabelRenderer(): boolean
    getDimensions(): { width, height, depth }
    dispose(): void
}
```

---

## Phase B: Create LegacyGameBoxRenderer

### ☐ B.1: Extract Legacy Path Code
**Effort**: 2-3 hours  
**File**: `client/src/scene/game-box/LegacyGameBoxRenderer.ts`

**What to Keep**:
- `createGameBoxCore()` - Individual mesh creation logic
- Canvas texture generation for labels (fallback path)
- Individual THREE.Mesh creation per game
- Geometry creation and material management
- All fallback rendering paths (non-instanced)

**What to Remove**:
- InstancedLabelRenderer usage and integration
- InstancedArtworkRenderer usage and integration
- All GPU instancing code paths
- Instanced renderer capability checks
- Batch rendering optimizations specific to instancing

**Key Methods**:
```typescript
class LegacyGameBoxRenderer implements IGameBoxRenderer {
    constructor(scene: THREE.Scene, materialManager: SharedMaterialManager)
    
    createGameBox(game, position, textureOptions?, name?, side?): THREE.Mesh {
        // Always uses individual mesh + canvas texture fallback
    }
    
    createBatchGameBoxes(requests): void {
        // Simple loop calling createGameBox for each request
    }
    
    hasInstancedLabelRenderer(): boolean {
        return false // Legacy never has instanced renderers
    }
    
    getDimensions(): { width, height, depth }
    dispose(): void
}
```

**Dependencies**:
- THREE.Scene
- SharedMaterialManager
- Canvas-based texture generation utilities

### ☐ B.2: Test LegacyGameBoxRenderer
**Effort**: 1 hour

**Test Coverage**:
- Single game box creation with canvas textures
- Batch game box creation (non-instanced loop)
- Geometry dimensions correct
- Material application correct
- Proper disposal of resources

---

## Phase C: Create GpuGameBoxRenderer

### ☐ C.1: Extract GPU Instancing Path Code
**Effort**: 2-3 hours  
**File**: `client/src/scene/game-box/GpuGameBoxRenderer.ts`

**What to Keep**:
- InstancedLabelRenderer integration (required)
- InstancedArtworkRenderer integration (required)
- GPU instancing code paths
- Batch rendering optimizations
- Instanced mesh manager usage

**What to Remove**:
- Canvas texture fallback code
- Individual mesh creation fallbacks
- Legacy non-instanced paths
- Capability detection for instancing (assume always available)

**Key Methods**:
```typescript
class GpuGameBoxRenderer implements IGameBoxRenderer {
    constructor(
        scene: THREE.Scene, 
        materialManager: SharedMaterialManager,
        instancedLabelRenderer: InstancedLabelRenderer,
        instancedArtworkRenderer: InstancedArtworkRenderer
    )
    
    createGameBox(game, position, textureOptions?, name?, side?): THREE.Mesh {
        // Always uses instanced renderers for labels/artwork
    }
    
    createBatchGameBoxes(requests): void {
        // Efficient batch processing with instanced renderers
    }
    
    hasInstancedLabelRenderer(): boolean {
        return true // GPU always has instanced renderers
    }
    
    getDimensions(): { width, height, depth }
    dispose(): void {
        // Cleanup instanced renderer references
    }
}
```

**Dependencies**:
- THREE.Scene
- SharedMaterialManager
- InstancedLabelRenderer (required)
- InstancedArtworkRenderer (required)

### ☐ C.2: Test GpuGameBoxRenderer
**Effort**: 1 hour

**Test Coverage**:
- Single game box with instanced label renderer
- Batch game box creation with instancing
- Instanced artwork integration
- Proper instanced renderer lifecycle management
- Geometry dimensions match legacy version
- Proper disposal of instanced renderer resources

---

## Phase D: Update Parent Renderers

### ☐ D.1: Update LegacyStorePropsRenderer
**Effort**: 15 minutes  
**File**: `client/src/scene/LegacyStorePropsRenderer.ts`

**Change**:
```typescript
// Old:
import { GameBoxRenderer } from './GameBoxRenderer'

// New:
import { LegacyGameBoxRenderer } from './game-box/LegacyGameBoxRenderer'

// In constructor:
this.gameBoxRenderer = new LegacyGameBoxRenderer(scene, materialManager)
```

### ☐ D.2: Update GpuStorePropsRenderer  
**Effort**: 15 minutes  
**File**: `client/src/scene/GpuStorePropsRenderer.ts`

**Change**:
```typescript
// Old:
import { GameBoxRenderer } from './GameBoxRenderer'

// New:
import { GpuGameBoxRenderer } from './game-box/GpuGameBoxRenderer'

// In constructor:
this.gameBoxRenderer = new GpuGameBoxRenderer(
    scene, 
    materialManager,
    instancedLabelRenderer,
    instancedArtworkRenderer
)
```

---

## Phase E: Event Handlers (Optional - Can be Deferred)

### ☐ E.1: Create LegacyGameBoxHandler
**Effort**: 1-2 hours  
**File**: `client/src/scene/game-box/LegacyGameBoxHandler.ts`

**Purpose**: Event-driven wrapper around LegacyGameBoxRenderer

**Pattern**: Follow LegacyStorePropsHandler structure
- Listen for game box creation events
- Delegate to LegacyGameBoxRenderer
- Emit completion events

### ☐ E.2: Create GpuGameBoxEventHandler
**Effort**: 1-2 hours  
**File**: `client/src/scene/game-box/GpuGameBoxEventHandler.ts`

**Purpose**: Event-driven wrapper around GpuGameBoxRenderer

**Pattern**: Follow GpuStorePropsEventHandler structure
- Listen for game box creation events
- Delegate to GpuGameBoxRenderer
- Emit completion events

**Note**: Event handlers can be deferred until the broader event-driven architecture migration is complete. Current delegating pattern through StorePropsRenderer works fine.

---

## Phase F: Testing and Validation

### ☐ F.1: Update Existing Tests
**Effort**: 1-2 hours

**Files to Update**:
- `test/unit/scene/game-box/GameBoxRenderer.test.ts` - Update or split into Legacy/Gpu versions
- Any integration tests that depend on GameBoxRenderer

**Validation**:
- All existing tests pass with new structure
- Test coverage maintained for both paths
- No regression in game box rendering behavior

### ☐ F.2: Run Full Test Suite
**Effort**: 5 minutes

**Command**: `yarn test`

**Expected**: All 58+ tests passing

---

## Phase G: Cleanup (Optional - Post-Split)

### ☐ G.1: Remove Original GameBoxRenderer
**Effort**: 5 minutes  
**File**: `client/src/scene/GameBoxRenderer.ts`

**Consideration**: Keep original file as reference until event handlers are created, or remove immediately if confident in split.

**Alternative**: Keep as delegating wrapper (like StorePropsRenderer pattern) if that approach is preferred.

---

## Checklist Summary

**Foundation (Complete)**:
- [x] IGameBoxRenderer interface created

**Implementation**:
- [ ] LegacyGameBoxRenderer created and tested
- [ ] GpuGameBoxRenderer created and tested  
- [ ] LegacyStorePropsRenderer updated to use LegacyGameBoxRenderer
- [ ] GpuStorePropsRenderer updated to use GpuGameBoxRenderer

**Optional/Deferred**:
- [ ] LegacyGameBoxHandler created (event-driven wrapper)
- [ ] GpuGameBoxEventHandler created (event-driven wrapper)
- [ ] Original GameBoxRenderer removed or converted to delegating wrapper

**Validation**:
- [ ] All existing tests updated and passing
- [ ] Full test suite green (58+ tests)
- [ ] Visual validation in VR environment

---

## Key Architectural Notes

1. **Clean Separation**: Each implementation focuses on its rendering path without capability detection
2. **Interface Compliance**: Both implementations satisfy IGameBoxRenderer contract
3. **Dependency Injection**: Parent renderers (StorePropsRenderer variants) handle renderer selection
4. **No Shared Code**: Duplicate code between Legacy/Gpu is acceptable - clear separation more important
5. **Event Handlers Optional**: Current delegating pattern through StorePropsRenderer works; event handlers can wait

---

## Estimated Total Effort

- **Core Implementation**: 6-8 hours (Phases B, C, D, F)
- **With Event Handlers**: 9-12 hours (includes Phase E)
- **Minimum Viable**: 4-5 hours (skip tests initially, validate manually)

**Recommended Approach**: Complete Phases B, C, D, F as one coherent unit. Defer Phase E (event handlers) until broader event architecture migration.
