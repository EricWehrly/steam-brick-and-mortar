# Event-Driven Architecture Pattern for Steam Brick and Mortar

## Overview

This document outlines a comprehensive event-driven architecture pattern that eliminates dependency injection and singleton patterns in favor of a pure event-based communication system. The pattern promotes loose coupling, testability, and eliminates cross-class dependencies while maintaining type safety and performance.

## Core Principles

### 1. **Event-Centric Communication**
- Classes communicate exclusively through typed events
- No direct method calls between classes (except within the same bounded context)
- No dependency injection or singleton getInstance() patterns
- Data flows through event payloads, not method parameters

### 2. **Handler Registration with Replacement Strategy**
- Default handlers provide baseline functionality
- Feature-rich handlers can register as replacements to override defaults
- Capability-based selection (WebGL2, hardware features, etc.)
- Automatic fallback to defaults when replacements fail or are unavailable

### 3. **Three-Phase Event Processing**
- **Pre-process**: Setup, validation, capability checks
- **Process**: Main business logic execution (default phase)
- **Post-process**: Cleanup, notifications, side effects

### 4. **Event Metadata and Control Flow**
- Events carry metadata for processing control (`stopProcessing`, `handled`, `priority`)
- Idempotency handling through event state tracking
- Phase-specific handler registration
- Order/priority management for complex workflows

## Event System Architecture

### Event Structure

```typescript
interface BaseEventPayload {
  timestamp: number
  source: EventSource
  phase?: EventPhase
  metadata?: EventMetadata
}

interface EventMetadata {
  stopProcessing?: boolean    // Halt further processing
  handled?: boolean          // Mark as processed
  priority?: number          // Processing priority (higher = first)
  idempotencyKey?: string   // Prevent duplicate processing
  capabilities?: string[]   // Required system capabilities
}

enum EventPhase {
  PreProcess = 'pre-process',
  Process = 'process',        // Default phase
  PostProcess = 'post-process'
}
```

### Handler Registration

```typescript
interface EventHandlerRegistration<T> {
  eventType: string
  phase: EventPhase
  handler: (event: CustomEvent<T>) => void | Promise<void>
  isDefault?: boolean        // Default implementation
  replacesDefault?: boolean  // Replaces default handler
  capabilities?: string[]    // Required capabilities to register
  priority?: number          // Handler execution priority
}
```

### Enhanced Event Manager

```typescript
class EnhancedEventManager {
  // Register handlers with advanced options
  registerHandler<T>(registration: EventHandlerRegistration<T>): void
  
  // Emit events with phase support
  emitPhased<T>(eventType: string, payload: T, phases?: EventPhase[]): Promise<void>
  
  // Capability-based handler filtering
  registerCapabilityAwareHandler<T>(registration: EventHandlerRegistration<T>): void
  
  // Default/replacement handler management
  registerDefaultHandler<T>(eventType: string, handler: EventHandler<T>): void
  registerReplacementHandler<T>(eventType: string, handler: EventHandler<T>): void
}
```

## StorePropsRenderer Pattern Implementation

### Event Types for Store Props

```typescript
// Store Props Events
export const StorePropsEventTypes = {
  SetupRequest: 'store-props:setup-request',
  SetupStarted: 'store-props:setup-started', 
  SetupCompleted: 'store-props:setup-completed',
  ClearRequest: 'store-props:clear-request',
  AtmosphericPropsRequest: 'store-props:atmospheric-props-request'
} as const

export interface StorePropsSetupRequestEvent extends BaseEventPayload {
  config: PropsConfig
  scene: THREE.Scene
  dataManager: DataManager
  gameBoxRenderer: GameBoxRenderer
}

export interface StorePropsSetupCompletedEvent extends BaseEventPayload {
  propsCount: number
  renderingSystem: 'legacy' | 'instanced'
  performance: {
    setupTimeMs: number
    memoryUsageMB: number
  }
}
```

### Legacy Handler (Default)

```typescript
export class LegacyStorePropsHandler {
  private eventManager: EnhancedEventManager
  private renderer: LegacyStorePropsRenderer
  
  constructor() {
    this.eventManager = EnhancedEventManager.getInstance()
    this.registerAsDefault()
  }
  
  private registerAsDefault(): void {
    // Register as default handler for store props setup
    this.eventManager.registerDefaultHandler(
      StorePropsEventTypes.SetupRequest,
      this.handleSetupRequest.bind(this)
    )
  }
  
  private async handleSetupRequest(event: CustomEvent<StorePropsSetupRequestEvent>): Promise<void> {
    const { config, scene, dataManager, gameBoxRenderer } = event.detail
    
    // Initialize legacy renderer if not already done
    if (!this.renderer) {
      this.renderer = new LegacyStorePropsRenderer(scene, dataManager, gameBoxRenderer)
    }
    
    // Emit setup started
    this.eventManager.emit(StorePropsEventTypes.SetupStarted, {
      renderingSystem: 'legacy',
      timestamp: Date.now(),
      source: 'LegacyStorePropsHandler'
    })
    
    // Perform setup
    await this.renderer.setupProps(config)
    
    // Emit completion
    this.eventManager.emit(StorePropsEventTypes.SetupCompleted, {
      propsCount: this.renderer.getPropsCount(),
      renderingSystem: 'legacy',
      performance: this.renderer.getPerformanceStats(),
      timestamp: Date.now(),
      source: 'LegacyStorePropsHandler'
    })
  }
}
```

### Instanced Handler (Replacement)

```typescript
export class InstancedStorePropsHandler {
  private eventManager: EnhancedEventManager
  private renderer: InstancedStorePropsRenderer
  private capabilities: SystemCapabilities
  
  constructor() {
    this.eventManager = EnhancedEventManager.getInstance()
    this.capabilities = this.checkSystemCapabilities()
    this.registerAsReplacementIfCapable()
  }
  
  private checkSystemCapabilities(): SystemCapabilities {
    return {
      hasWebGL2: this.hasWebGL2Support(),
      hasInstancedArrays: this.hasInstancedArraySupport(),
      hasGoodGPU: this.hasAdequateGPUPerformance()
    }
  }
  
  private registerAsReplacementIfCapable(): void {
    // Only register if system supports instanced rendering
    if (this.capabilities.hasWebGL2 && this.capabilities.hasInstancedArrays) {
      this.eventManager.registerReplacementHandler(
        StorePropsEventTypes.SetupRequest,
        this.handleSetupRequest.bind(this),
        {
          capabilities: ['webgl2', 'instanced-arrays'],
          priority: 10 // Higher priority than default
        }
      )
    }
  }
  
  private async handleSetupRequest(event: CustomEvent<StorePropsSetupRequestEvent>): Promise<void> {
    const { config, scene, dataManager, gameBoxRenderer } = event.detail
    
    try {
      // Initialize instanced renderer
      if (!this.renderer) {
        this.renderer = new InstancedStorePropsRenderer(scene, dataManager, gameBoxRenderer)
      }
      
      // Emit setup started
      this.eventManager.emit(StorePropsEventTypes.SetupStarted, {
        renderingSystem: 'instanced',
        timestamp: Date.now(),
        source: 'InstancedStorePropsHandler'
      })
      
      // Perform instanced setup
      await this.renderer.setupProps(config)
      
      // Emit completion with performance data
      this.eventManager.emit(StorePropsEventTypes.SetupCompleted, {
        propsCount: this.renderer.getPropsCount(),
        renderingSystem: 'instanced',
        performance: this.renderer.getPerformanceStats(),
        timestamp: Date.now(),
        source: 'InstancedStorePropsHandler'
      })
      
    } catch (error) {
      console.warn('Instanced renderer failed, falling back to default:', error)
      
      // Mark event as unhandled so default handler can take over
      event.detail.metadata = { ...event.detail.metadata, handled: false }
      
      // Re-emit for default handler
      this.eventManager.emitPhased(StorePropsEventTypes.SetupRequest, event.detail)
    }
  }
}
```

### Scene Coordinator (Event Emitter)

```typescript
export class SceneCoordinator {
  private eventManager: EnhancedEventManager
  
  constructor() {
    this.eventManager = EnhancedEventManager.getInstance()
    // No more direct renderer dependencies!
  }
  
  private async setupProps(): Promise<void> {
    // Simply emit setup request - handlers will respond
    this.eventManager.emitPhased(StorePropsEventTypes.SetupRequest, {
      config: {
        enableShelves: true,
        enableGameBoxes: true,
        enableSignage: true,
        tests: this.config.tests
      },
      scene: this.sceneManager.getScene(),
      dataManager: this.dataManager,
      gameBoxRenderer: this.gameBoxRenderer,
      timestamp: Date.now(),
      source: 'SceneCoordinator'
    })
    
    // Listen for completion to know when props are ready
    this.eventManager.registerOnceHandler(
      StorePropsEventTypes.SetupCompleted,
      (event: CustomEvent<StorePropsSetupCompletedEvent>) => {
        console.log(`🏪 Props loaded using ${event.detail.renderingSystem} renderer`)
        console.log(`📊 Performance: ${event.detail.performance.setupTimeMs}ms`)
      }
    )
  }
}
```

## System Integration Pattern

### Initialization Bootstrap

```typescript
export class EventDrivenBootstrap {
  private eventManager: EnhancedEventManager
  
  constructor() {
    this.eventManager = EnhancedEventManager.getInstance()
  }
  
  public async initializeSystem(): Promise<void> {
    // 1. Initialize handlers (they self-register based on capabilities)
    new LegacyStorePropsHandler()      // Registers as default
    new InstancedStorePropsHandler()   // Registers as replacement if capable
    
    new LegacyGameBoxHandler()         // Registers as default
    new InstancedGameBoxHandler()      // Registers as replacement if capable
    
    new LegacyMaterialHandler()        // Registers as default
    new InstancedMaterialHandler()     // Registers as replacement if capable
    
    // 2. Initialize coordinators (they emit events, don't know about handlers)
    const sceneCoordinator = new SceneCoordinator()
    const gameCoordinator = new GameCoordinator()
    
    // 3. System is now ready - coordinators emit events, handlers respond
    console.log('🚀 Event-driven system initialized')
  }
}
```

### Automatic Handler Selection Logic

```typescript
export class HandlerSelectionStrategy {
  static selectOptimalHandler(
    eventType: string,
    availableHandlers: EventHandlerRegistration<any>[],
    systemCapabilities: SystemCapabilities
  ): EventHandlerRegistration<any> {
    
    // Filter by capability requirements
    const capableHandlers = availableHandlers.filter(handler => 
      this.meetsCapabilityRequirements(handler.capabilities, systemCapabilities)
    )
    
    // Prefer replacements over defaults
    const replacementHandlers = capableHandlers.filter(h => h.replacesDefault)
    if (replacementHandlers.length > 0) {
      // Return highest priority replacement
      return replacementHandlers.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
    }
    
    // Fall back to default handlers
    const defaultHandlers = capableHandlers.filter(h => h.isDefault)
    if (defaultHandlers.length > 0) {
      return defaultHandlers[0]
    }
    
    throw new Error(`No capable handler found for event: ${eventType}`)
  }
}
```

## Benefits of This Pattern

### 1. **Zero Cross-Class Dependencies**
- Classes never directly call other classes
- No constructor injection or singleton resolution
- Each class is independently testable

### 2. **Capability-Based Selection**
- Handlers self-register based on system capabilities
- Automatic fallback to compatible implementations
- No complex factory or selection logic needed

### 3. **Event-Driven Flexibility** 
- New handlers can be added without modifying existing code
- A/B testing through handler registration
- Performance monitoring through event metadata

### 4. **Type Safety**
- Full TypeScript support for event types
- Compile-time event contract validation
- IntelliSense support for event payloads

### 5. **Testability**
- Each handler can be unit tested in isolation
- Event emissions can be mocked and verified
- No dependency mocking required

## Migration Strategy

See the accompanying roadmap document for detailed implementation steps.

## Future Considerations

### Performance Optimizations
- Event batching for high-frequency events
- Handler pooling for performance-critical paths
- Async event processing with priority queues

### Advanced Features
- Event replaying for debugging
- Handler composition patterns
- Cross-system event bridging
- Event-sourcing for state reconstruction

This pattern provides a foundation for a completely decoupled, testable, and maintainable architecture that eliminates the complexity of dependency management while preserving type safety and performance.