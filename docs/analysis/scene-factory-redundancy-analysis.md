# Scene Factory Redundancy Analysis

## Overview
This document analyzes the factory and instantiation patterns throughout our codebase to identify redundancy issues similar to what we discovered with RoomManager and TextureManager - where components are being created in multiple places instead of having a single source of truth.

## Executive Summary
Our codebase shows **significant factory pattern redundancy** across multiple scene components. We have identified **5 major redundancy patterns** that are creating performance issues, memory waste, and architectural inconsistencies:

1. **GameBoxRenderer**: Created in 3+ different locations
2. **SceneManager**: Multiple instantiations in different contexts  
3. **RoomManager**: Created inconsistently across coordinators
4. **StoreLayout**: Dual creation pattern causing confusion
5. **SharedMaterialManager**: Singleton pattern mixed with direct instantiation

## Critical Findings

### 🔴 HIGH PRIORITY: GameBoxRenderer Multiple Instantiation

**Problem**: GameBoxRenderer is being created independently in multiple places:

**Locations Found**:
```typescript
// 1. StorePropsRenderer.ts:214
this.gameBoxRenderer = new GameBoxRenderer(dimensions, undefined, performanceConfig)

// 2. StoreLayout.ts:29  
this.gameBoxRenderer = new GameBoxRenderer()

// 3. SteamGameManager.ts (referenced, likely instantiated elsewhere)
this.gameBoxRenderer.createGameBoxWithTexture(...)

// 4. Tests: Multiple direct instantiations
renderer = new GameBoxRenderer()
```

**Impact**: 
- Each instance creates its own `GameBoxTextureManager`
- Multiple `SharedMaterialManager.getInstance()` calls creating redundant material pools
- Performance degradation from duplicate resource management
- Inconsistent configuration between instances

**Root Cause**: No centralized factory or dependency injection for GameBoxRenderer

---

### 🟡 MEDIUM PRIORITY: SceneManager Creation Pattern

**Problem**: SceneManager instantiated in multiple contexts without coordination:

**Locations Found**:
```typescript
// 1. SteamBrickAndMortarApp.ts:76 (Primary)
this.sceneManager = new SceneManager({...})

// 2. Various test files
const mockSceneManager = new SceneManager()
sceneManager = new SceneManager({})

// 3. Integration tests creating independent instances
```

**Impact**:
- Multiple Three.js Scene/Renderer/Camera instances
- WebGL context conflicts in tests
- Resource competition between instances

---

### 🟡 MEDIUM PRIORITY: RoomManager Coordination Gap

**Problem**: RoomManager creation not centrally coordinated:

**Locations Found**:
```typescript
// 1. SceneCoordinator.ts:63 (Primary)
this.roomManager = new RoomManager(this.sceneManager.getScene())

// 2. Multiple test files
roomManager = new RoomManager(scene)
roomManager = new RoomManager(mockScene)
```

**Impact**:
- Multiple room structures could theoretically be created
- Event handler registration conflicts
- Unclear ownership of room lifecycle

---

### 🟡 MEDIUM PRIORITY: StoreLayout Dual Creation

**Problem**: StoreLayout created in multiple places with different purposes:

**Locations Found**:
```typescript
// 1. StorePropsRenderer.ts:87
this.storeLayout = new StoreLayout(this.scene)

// 2. Various integration tests  
storeLayout = new StoreLayout(scene)
```

**Impact**:
- Confusion about StoreLayout's role vs StorePropsRenderer
- Potential for duplicate store structures
- Architectural unclear boundaries

---

### 🟢 LOW PRIORITY: SharedMaterialManager Singleton Issues

**Problem**: Proper singleton pattern but shows signs of potential misuse:

**Current Pattern**:
```typescript
// Correct singleton usage
this.materialManager = SharedMaterialManager.getInstance()

// But multiple components call getInstance() independently
// GameBoxRenderer.ts, RoomManager.ts, etc.
```

**Potential Risk**:
- While technically correct, the distributed getInstance() calls make dependency tracking difficult
- Could lead to initialization order issues

## Architectural Root Causes

### 1. **Missing Dependency Injection Container**
We lack a central DI container that could manage component lifecycles and ensure single instances where appropriate.

### 2. **Inconsistent Factory Patterns**
- Some components use singletons (SharedMaterialManager, UIManager)
- Others use direct instantiation (GameBoxRenderer, RoomManager)
- No clear guidelines on when to use which pattern

### 3. **Test Isolation Problems**
Test files frequently create their own instances instead of using proper mocking, leading to:
- Resource conflicts
- Inconsistent test environments  
- Performance issues in test suites

### 4. **Unclear Component Ownership**
Several components don't have clear "owners":
- Who owns the GameBoxRenderer lifecycle?
- When should StoreLayout vs StorePropsRenderer be used?
- How do we prevent multiple RoomManagers?

## Performance Impact Analysis

### Current Material Reduction Success
We successfully reduced materials from **2373 → ~20** through SharedMaterialManager. However, multiple GameBoxRenderer instances could be:
- Creating duplicate texture managers
- Loading textures multiple times
- Fragmenting material sharing effectiveness

### Draw Call Analysis
With **3350 draw calls** currently, multiple renderer instances contribute to:
- Geometry duplication across instances
- Missed batching opportunities
- Suboptimal InstancedMesh potential

### Memory Waste Estimation
Each GameBoxRenderer instance includes:
- BoxGeometry creation
- GameBoxTextureManager (~2-5MB)
- GameBoxPerformanceManager
- Event handlers and caches

**Estimated waste**: 10-20MB per redundant instance

## Recommended Solutions

### Phase 1: Immediate Fixes (This Sprint)

#### 1. **GameBoxRenderer Factory Pattern**
Create a central GameBoxRenderer factory:

```typescript
// New: GameBoxRendererFactory.ts
export class GameBoxRendererFactory {
  private static instance: GameBoxRenderer | null = null
  
  public static getInstance(): GameBoxRenderer {
    if (!GameBoxRendererFactory.instance) {
      GameBoxRendererFactory.instance = new GameBoxRenderer(
        // Centralized config
      )
    }
    return GameBoxRendererFactory.instance
  }
  
  public static dispose(): void {
    GameBoxRendererFactory.instance?.dispose()
    GameBoxRendererFactory.instance = null
  }
}
```

#### 2. **Update All GameBoxRenderer Usage**
Replace direct instantiation:
```typescript
// Before
this.gameBoxRenderer = new GameBoxRenderer()

// After  
this.gameBoxRenderer = GameBoxRendererFactory.getInstance()
```

### Phase 2: Architectural Improvements (Next Sprint)

#### 1. **Component Lifecycle Manager**
```typescript
export class ComponentLifecycleManager {
  private components = new Map<string, any>()
  
  public register<T>(key: string, factory: () => T): T
  public get<T>(key: string): T | undefined
  public dispose(key: string): void
  public disposeAll(): void
}
```

#### 2. **Dependency Injection Container**
```typescript
export class DIContainer {
  private singletons = new Map<Constructor, any>()
  
  public registerSingleton<T>(ctor: Constructor<T>, instance?: T): void
  public get<T>(ctor: Constructor<T>): T
}
```

### Phase 3: Test Architecture Fixes (Ongoing)

#### 1. **Centralized Test Mocks**
- Expand `test/mocks/index.ts` with factory-aware mocks
- Create mock factories that respect singleton patterns
- Standardize test setup/teardown procedures

#### 2. **Resource Management**
- Implement proper dispose() chains
- Add resource tracking in tests
- Create test utilities for clean component lifecycle

## Implementation Priority

### Sprint 1 (Current)
1. ✅ **Complete SharedMaterialManager consolidation** (DONE)
2. 🔄 **Document factory redundancies** (IN PROGRESS)  
3. **Create GameBoxRenderer factory pattern**
4. **Update StorePropsRenderer and StoreLayout usage**

### Sprint 2  
1. **Implement ComponentLifecycleManager**
2. **Standardize RoomManager creation**
3. **Clean up test instantiation patterns**

### Sprint 3
1. **Full DI container implementation**
2. **Performance validation**
3. **InstancedMesh integration** (depends on single GameBoxRenderer instance)

## Success Metrics

### Memory Efficiency
- **Target**: Reduce redundant GameBoxRenderer instances from 3+ to 1
- **Measure**: Memory usage monitoring in performance tests

### Draw Call Optimization  
- **Target**: Enable InstancedMesh implementation (depends on single geometry source)
- **Measure**: Draw call reduction from 3350 → ~50

### Code Clarity
- **Target**: Single source of truth for each major component
- **Measure**: Grep search results for "new ComponentName(" patterns

## Next Actions

1. **Immediate (Today)**: Complete this analysis documentation
2. **Sprint Planning**: Add GameBoxRenderer factory pattern to sprint backlog  
3. **Code Review**: Establish factory pattern guidelines
4. **Testing**: Update test patterns to use factory mocks

---

## Appendix: Search Results Summary

### Direct Instantiation Locations
```bash
# GameBoxRenderer instantiations found:
- StorePropsRenderer.ts:214
- StoreLayout.ts:29  
- Multiple test files

# SceneManager instantiations found:
- SteamBrickAndMortarApp.ts:76 (primary)
- Various test files

# RoomManager instantiations found:
- SceneCoordinator.ts:63 (primary)
- Multiple test files
```

### Singleton Patterns Found
- ✅ SharedMaterialManager (proper singleton)
- ✅ UIManager (proper singleton)  
- ❌ GameBoxRenderer (should be singleton)
- ❌ RoomManager (should be coordinated)

This analysis provides the foundation for eliminating factory redundancies and enabling the InstancedMesh performance optimization that requires single geometry sources.