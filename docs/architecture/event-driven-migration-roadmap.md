# Event-Driven Architecture Migration Roadmap

## Overview

This roadmap outlines the step-by-step migration from the current DI/singleton-based system to a pure event-driven architecture, using the bifurcated StorePropsRenderer as our first implementation target.

## Current State Analysis

### Existing Infrastructure ✅
- **Event System Foundation**: EventManager.ts with typed events
- **Event Type Definitions**: 40+ event types in InteractionEvents.ts
- **Bifurcated Renderers**: LegacyStorePropsRenderer + InstancedStorePropsRenderer
- **Service Container**: Full DI system with lifecycle management
- **Capability Detection**: Basic WebGL/hardware capability checking

### Dependencies to Migrate 🔄
- **Cross-Class Dependencies**: SceneCoordinator → StorePropsRenderer direct calls
- **Singleton Patterns**: DataManager.getInstance(), EventManager.getInstance()
- **Constructor Injection**: Service dependencies passed through constructors
- **Mixed Patterns**: Half DI, half getInstance() calls

## Phase 1: Enhanced Event Manager (Foundation) ⚡

### 1.1 Enhanced Event Manager Implementation ✅ COMPLETED

**Actual Timeline**: 1 day  
**Priority**: CRITICAL - Foundation for everything else

#### Tasks:
- [x] ~~Add handler replacement system (default vs replacement handlers)~~ ✅ DONE
- [x] ~~Create handler registration interfaces and types~~ ✅ DONE
- [ ] TODO DEFERRED: Phase support (pre-process, process, post-process) - when needed
- [ ] TODO DEFERRED: Event metadata support (stopProcessing, handled, priority, idempotency) - when needed
- [ ] TODO DEFERRED: Capability-based handler filtering - handlers self-check instead

#### Deliverable:
```typescript
// Enhanced event manager with phase support and replacement system
class EnhancedEventManager extends EventManager {
  registerDefaultHandler<T>(eventType: string, handler: EventHandler<T>): void
  registerReplacementHandler<T>(eventType: string, handler: EventHandler<T>, options?: HandlerOptions): void
  emitPhased<T>(eventType: string, payload: T, phases?: EventPhase[]): Promise<void>
  // ... other enhanced methods
}
```

### 1.2 System Capabilities Detection ✅ COMPLETED

**Actual Timeline**: 0.5 days  
**Priority**: HIGH - Required for handler selection

#### Tasks:
- [x] ~~Create SystemCapabilities interface and detection logic~~ ✅ DONE
- [x] ~~Implement WebGL2, instanced arrays, GPU performance detection~~ ✅ DONE
- [x] ~~Add capability requirement checking for handlers~~ ✅ DONE - handlers self-check
- [x] ~~Create capability-based handler filtering system~~ ✅ DONE - handlers decide registration

#### Deliverable:
```typescript
interface SystemCapabilities {
  hasWebGL2: boolean
  hasInstancedArrays: boolean
  hasGoodGPU: boolean
  maxTextureSize: number
  // ... other capability flags
}
```

### 1.3 Event Type Extensions ✅ COMPLETED

**Actual Timeline**: 0.5 days  
**Priority**: MEDIUM - Extends existing event system

#### Tasks:
- [x] ~~Add StorePropsEventTypes to InteractionEvents.ts~~ ✅ DONE
- [x] ~~Create event interfaces for store props operations~~ ✅ DONE with readonly data
- [x] ~~Update type mappings and utility types~~ ✅ DONE
- [ ] TODO DEFERRED: Event metadata and phase support - when needed

#### Expected Deliverable:
```typescript
export const StorePropsEventTypes = {
  SetupRequest: 'store-props:setup-request',
  SetupStarted: 'store-props:setup-started',
  SetupCompleted: 'store-props:setup-completed',
  // ... other store props events
} as const
```

## Phase 2: StorePropsRenderer Event Handlers ⚡

### 2.1 Legacy Store Props Handler ✅ COMPLETED

**Actual Timeline**: 1 day  
**Priority**: HIGH - Reference implementation

#### Tasks:
- [x] ~~Create LegacyStorePropsHandler class~~ ✅ DONE
- [x] ~~Implement default handler registration logic~~ ✅ DONE - registers in constructor
- [x] ~~Add event handling for setup requests~~ ✅ DONE - setup, clear, atmospheric
- [x] ~~Integrate with existing LegacyStorePropsRenderer~~ ✅ DONE - wraps renderer
- [x] ~~Add performance monitoring and event emission~~ ✅ DONE

#### Expected Deliverable:
```typescript
export class LegacyStorePropsHandler {
  // Registers as default handler, wraps LegacyStorePropsRenderer
  // Handles all store props events with fallback logic
}
```

### 2.2 Instanced Store Props Handler ✅ COMPLETED

**Actual Timeline**: 1 day  
**Priority**: HIGH - Feature-rich implementation

#### Tasks:
- [x] ~~Create InstancedStorePropsHandler class~~ ✅ DONE
- [x] ~~Implement capability checking and replacement registration~~ ✅ DONE - self-checks in constructor
- [x] ~~Add event handling with capability validation~~ ✅ DONE
- [x] ~~Integrate with existing InstancedStorePropsRenderer~~ ✅ DONE - wraps renderer
- [x] ~~Add fallback logic when instanced rendering fails~~ ✅ DONE - calls fallbackToDefault

#### Expected Deliverable:
```typescript
export class InstancedStorePropsHandler {
  // Registers as replacement handler if system has WebGL2 + instanced arrays
  // Falls back to default handler on failure
}
```

### 2.3 SceneCoordinator Migration ✅ COMPLETED

**Actual Timeline**: 1 day  
**Priority**: HIGH - Proves the pattern works

#### Tasks:
- [x] ~~Remove direct StorePropsRenderer dependency from SceneCoordinator~~ ✅ DONE
- [x] ~~Replace setupProps() method calls with event emissions~~ ✅ DONE
- [x] ~~Add event listeners for setup completion~~ ✅ DONE - Promise-based completion
- [x] ~~Update error handling to use event-based patterns~~ ✅ DONE - handlers handle errors
- [x] ~~Maintain backward compatibility during transition~~ ✅ DONE - constructor API unchanged

#### Expected Deliverable:
```typescript
export class SceneCoordinator {
  // No longer depends on StorePropsRenderer directly
  // Emits events, listens for responses
  // Zero cross-class dependencies
}
```

## Phase 3: Handler Bootstrap System ⚡

### 3.1 Event-Driven Bootstrap ✅ COMPLETED

**Actual Timeline**: 0.5 days  
**Priority**: MEDIUM - System integration

#### Tasks:
- [x] ~~Create EventDrivenBootstrap class~~ ✅ DONE - StorePropsHandlersBootstrap
- [x] ~~Implement handler initialization and self-registration~~ ✅ DONE - auto-initializes on import
- [x] ~~Add system capability detection and handler selection~~ ✅ DONE - handlers self-select
- [x] ~~Create coordinator initialization without dependencies~~ ✅ DONE - SceneCoordinator updated
- [x] ~~Add system readiness verification~~ ✅ DONE - handlers register or don't

#### Expected Deliverable:
```typescript
export class EventDrivenBootstrap {
  // Initializes all handlers (they self-register based on capabilities)
  // Initializes coordinators (they emit events, don't know about handlers)
  // System ready - coordinators emit, handlers respond
}
```

### 3.2 Handler Selection Strategy

**Timeline**: 1 day  
**Priority**: LOW - Can defer to manual selection initially

#### Tasks:
- [ ] Create HandlerSelectionStrategy class (future enhancement)
- [ ] Implement capability-based handler selection logic
- [ ] Add performance-based automatic selection
- [ ] Create A/B testing framework for handler selection
- [ ] Add user preference handling

#### Acceptance:
Automatic selection between legacy and instanced renderers based on system capabilities and performance requirements.

## Phase 4: GameBox System Migration ⚡

### 4.1 GameBox Event Types and Handlers

**Timeline**: 3-4 days  
**Priority**: HIGH - Critical rendering system

#### Tasks:
- [ ] Add GameBoxEventTypes to event system
- [ ] Create LegacyGameBoxHandler (default)
- [ ] Create InstancedGameBoxHandler (replacement)
- [ ] Implement capability-based registration
- [ ] Migrate GameBoxRenderer usage to event-driven pattern

#### Expected Deliverable:
```typescript
export const GameBoxEventTypes = {
  RenderRequest: 'game-box:render-request',
  BatchComplete: 'game-box:batch-complete',
  TextureLoadComplete: 'game-box:texture-load-complete'
} as const
```

### 4.2 Material System Migration

**Timeline**: 2-3 days  
**Priority**: MEDIUM - Shared resource management

#### Tasks:
- [ ] Create MaterialEventTypes
- [ ] Implement LegacyMaterialHandler and InstancedMaterialHandler
- [ ] Migrate SharedMaterialManager to event-driven pattern
- [ ] Add resource sharing through events instead of direct calls

#### Acceptance:
Material management completely decoupled from rendering systems, shared through events.

## Phase 5: Singleton Elimination ⚡

### 5.1 DataManager Migration

**Timeline**: 2 days  
**Priority**: HIGH - Core data access

#### Tasks:
- [ ] Create DataEventTypes for get/set operations
- [ ] Implement DataHandler for event-based data access
- [ ] Replace DataManager.getInstance() calls with event emissions
- [ ] Add data change notification events
- [ ] Maintain data consistency through event ordering

#### Expected Deliverable:
```typescript
export const DataEventTypes = {
  GetRequest: 'data:get-request',
  GetResponse: 'data:get-response', 
  SetRequest: 'data:set-request',
  Changed: 'data:changed'
} as const
```

### 5.2 Service Container Integration

**Timeline**: 1-2 days  
**Priority**: MEDIUM - Gradual migration path

#### Tasks:
- [ ] Create hybrid bootstrap that supports both DI and events
- [ ] Add gradual migration path for existing services
- [ ] Implement service-to-event adapters for backward compatibility
- [ ] Plan deprecation timeline for DI system

#### Expected Deliverable:
Hybrid system allowing gradual migration from DI to events without breaking existing code.

## Phase 6: Legacy System Cleanup ⚡

### 6.1 DI System Deprecation

**Timeline**: 1-2 days  
**Priority**: LOW - Final cleanup

#### Tasks:
- [ ] Add deprecation warnings to ServiceContainer
- [ ] Create migration guide for remaining DI usage
- [ ] Remove unused DI infrastructure
- [ ] Update documentation to reflect event-driven patterns

### 6.2 Performance Validation

**Timeline**: 2-3 days  
**Priority**: HIGH - Ensure no performance regressions

#### Tasks:
- [ ] Benchmark event-driven vs DI performance
- [ ] Optimize event emission for high-frequency operations
- [ ] Add performance monitoring for event processing
- [ ] Validate memory usage and garbage collection impact

#### Acceptance:
Event-driven system performs as well as or better than DI system, with measurable improvements in testability and maintainability.

## Implementation Summary ✅ PHASE 1 & 2 COMPLETED

### ✅ COMPLETED: StorePropsRenderer Event-Driven Migration (3 days total)

**What We Built:**
- **EnhancedEventManager**: Handler replacement system with composition-based approach
- **SystemCapabilities**: WebGL2/instanced arrays detection utilities  
- **Store Props Events**: Full readonly event types with type-safe mappings
- **LegacyStorePropsHandler**: Default handler wrapping LegacyStorePropsRenderer
- **InstancedStorePropsHandler**: Replacement handler with capability self-checking and fallback
- **Bootstrap System**: Auto-initializing handler registration via import
- **Event-Driven SceneCoordinator**: Zero dependencies, pure event emissions

**Key Learnings:**
1. **Handler Bootstrap**: Solved via auto-initialization on import - simple and effective
2. **Capability Self-Checking**: Handlers decide their own registration, not the event system
3. **Readonly Events**: All event data is readonly, preventing mutation bugs
4. **Composition > Inheritance**: EnhancedEventManager uses composition, avoiding singleton issues
5. **Promise-based Completion**: Event-driven async with Promise wrappers for await compatibility
6. **Fallback Strategy**: Replacement handlers call `fallbackToDefault()` on errors

### Sprint 1-2 (Days 1-3): StoreProps Migration ✅ COMPLETED
- Enhanced Event Manager implementation ✅
- System capabilities detection ✅
- Event type extensions ✅
- Legacy and Instanced Store Props Handlers ✅
- SceneCoordinator migration ✅
- Handler bootstrap system ✅
- **Milestone**: StorePropsRenderer completely event-driven ✅

### Sprint 3 (Week 3): GameBox Migration
- GameBox event types and handlers
- Material system migration
- **Milestone**: Core rendering systems event-driven

### Sprint 4 (Week 4): Singleton Elimination
- DataManager migration
- Service Container integration
- **Milestone**: Zero singleton dependencies

### Sprint 5 (Week 5): Cleanup and Validation
- Legacy system cleanup
- Performance validation
- Documentation updates
- **Milestone**: Pure event-driven architecture

## Integration with Bifurcation Plan

### Compatibility Matrix

| Component | Legacy System | Event-Driven System | Bifurcation Status |
|-----------|--------------|--------------------|--------------------|
| StorePropsRenderer | ✅ Available | 🚧 In Progress | ✅ Complete - Split into Legacy + Instanced |
| GameBoxRenderer | ✅ Available | ⏳ Phase 4 | 🔄 Next - Needs bifurcation |
| MaterialManager | ✅ Available | ⏳ Phase 4 | 🔄 Next - Needs bifurcation |
| DataManager | ✅ Available | ⏳ Phase 5 | ❌ Not Started |

### Prerequisites Alignment

1. **Bifurcation Completion**: StorePropsRenderer ✅ DONE, supports event-driven pattern
2. **Handler Registration**: Both Legacy + Instanced handlers can register independently
3. **Capability Detection**: WebGL2 + instanced array detection for handler selection
4. **Performance Monitoring**: Event metadata supports performance tracking
5. **Backward Compatibility**: Hybrid bootstrap supports gradual migration

## Risk Mitigation

### Technical Risks
- **Event Performance**: Mitigate with benchmarking and optimization (Phase 6.2)
- **Event Ordering**: Mitigate with phase system and priority handling  
- **Handler Conflicts**: Mitigate with capability-based registration
- **Memory Leaks**: Mitigate with proper handler cleanup and disposal

### Migration Risks  
- **Breaking Changes**: Mitigate with hybrid bootstrap and gradual migration
- **Testing Complexity**: Mitigate with isolated handler testing
- **Documentation Drift**: Mitigate with concurrent documentation updates
- **Team Adoption**: Mitigate with clear examples and migration guides

## Success Metrics

### Technical Metrics
- [ ] Zero `getInstance()` calls in production code
- [ ] Zero direct cross-class method calls between rendering systems
- [ ] 100% event-driven communication for rendering pipeline
- [ ] No performance regression vs current DI system
- [ ] 95%+ test coverage for event handlers

### Architecture Metrics  
- [ ] Clear separation between Legacy and Instanced rendering systems
- [ ] Capability-based handler selection working automatically
- [ ] Event-driven bootstrap successfully initializing all systems
- [ ] Backward compatibility maintained throughout migration

This roadmap provides a concrete path from our current bifurcated renderer system to a pure event-driven architecture, eliminating all dependency injection while maintaining performance and backward compatibility.