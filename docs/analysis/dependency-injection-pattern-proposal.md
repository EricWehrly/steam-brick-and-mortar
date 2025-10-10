# Dependency Injection Pattern Proposal

## Analysis Summary

After examining our codebase, I've identified the key patterns and challenges that a DI solution needs to address:

### Current Architecture Patterns

1. **Mixed Singleton Usage**: Some components (SharedMaterialManager, UIManager, DataManager) use proper singletons, others create multiple instances
2. **Constructor Dependency Injection**: Many components already accept dependencies through constructors (GameBoxRenderer, WebXRCoordinator, UICoordinator)
3. **Optional Dependencies**: Common pattern with optional SceneManager, performance configs, etc.
4. **Lifecycle Management**: Components need proper initialization order and disposal chains
5. **WebXR Constraints**: Three.js WebGL context must be initialized before WebXR components
6. **Test Isolation**: Heavy use of mocks, need clean test patterns

## Proposed DI Pattern: Lightweight Service Container

I recommend a **service container pattern** that's lightweight, TypeScript-friendly, and fits our existing architecture without major refactoring.

## Core Implementation

### 1. ServiceContainer (Dependency Injection Core)

```typescript
// src/core/di/ServiceContainer.ts

export type ServiceFactory<T> = (container: ServiceContainer) => T | Promise<T>
export type ServiceKey<T> = string | symbol | (new (...args: any[]) => T)

export enum ServiceLifetime {
  Singleton = 'singleton',
  Transient = 'transient',
  Scoped = 'scoped'
}

export interface ServiceRegistration<T> {
  factory: ServiceFactory<T>
  lifetime: ServiceLifetime
  instance?: T
  dependencies?: ServiceKey<any>[]
}

export class ServiceContainer {
  private services = new Map<ServiceKey<any>, ServiceRegistration<any>>()
  private resolving = new Set<ServiceKey<any>>()
  private initialized = false

  /**
   * Register a service with the container
   */
  public register<T>(
    key: ServiceKey<T>, 
    factory: ServiceFactory<T>, 
    lifetime: ServiceLifetime = ServiceLifetime.Singleton,
    dependencies: ServiceKey<any>[] = []
  ): this {
    if (this.initialized) {
      throw new Error(`Cannot register service after container initialization: ${String(key)}`)
    }

    this.services.set(key, {
      factory,
      lifetime,
      dependencies
    })
    return this
  }

  /**
   * Register a singleton service (convenience method)
   */
  public registerSingleton<T>(
    key: ServiceKey<T>, 
    factory: ServiceFactory<T>,
    dependencies: ServiceKey<any>[] = []
  ): this {
    return this.register(key, factory, ServiceLifetime.Singleton, dependencies)
  }

  /**
   * Register a transient service (convenience method)
   */
  public registerTransient<T>(
    key: ServiceKey<T>, 
    factory: ServiceFactory<T>,
    dependencies: ServiceKey<any>[] = []
  ): this {
    return this.register(key, factory, ServiceLifetime.Transient, dependencies)
  }

  /**
   * Register an existing instance as singleton
   */
  public registerInstance<T>(key: ServiceKey<T>, instance: T): this {
    if (this.initialized) {
      throw new Error(`Cannot register instance after container initialization: ${String(key)}`)
    }

    this.services.set(key, {
      factory: () => instance,
      lifetime: ServiceLifetime.Singleton,
      instance,
      dependencies: []
    })
    return this
  }

  /**
   * Resolve a service by key
   */
  public async resolve<T>(key: ServiceKey<T>): Promise<T> {
    if (!this.initialized) {
      throw new Error('Container must be initialized before resolving services')
    }

    // Check for circular dependencies
    if (this.resolving.has(key)) {
      throw new Error(`Circular dependency detected: ${String(key)}`)
    }

    const registration = this.services.get(key)
    if (!registration) {
      throw new Error(`Service not registered: ${String(key)}`)
    }

    // Return existing singleton instance
    if (registration.lifetime === ServiceLifetime.Singleton && registration.instance) {
      return registration.instance
    }

    // Mark as resolving to detect circular dependencies
    this.resolving.add(key)

    try {
      // Resolve dependencies first
      const resolvedDependencies = await Promise.all(
        registration.dependencies.map(dep => this.resolve(dep))
      )

      // Create the service instance
      const instance = await registration.factory(this)

      // Store singleton instance
      if (registration.lifetime === ServiceLifetime.Singleton) {
        registration.instance = instance
      }

      return instance
    } finally {
      this.resolving.delete(key)
    }
  }

  /**
   * Initialize the container (locks registration, enables resolution)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.initialized = true
    console.debug('🔧 ServiceContainer initialized')
  }

  /**
   * Get a service synchronously (for already resolved singletons)
   */
  public get<T>(key: ServiceKey<T>): T {
    const registration = this.services.get(key)
    if (!registration?.instance) {
      throw new Error(`Service not available synchronously: ${String(key)}. Use resolve() for async resolution.`)
    }
    return registration.instance
  }

  /**
   * Check if a service is registered
   */
  public has(key: ServiceKey<any>): boolean {
    return this.services.has(key)
  }

  /**
   * Dispose all services in reverse dependency order
   */
  public async dispose(): Promise<void> {
    const disposableServices: Array<{ instance: any, key: ServiceKey<any> }> = []

    // Collect all singleton instances that have dispose methods
    for (const [key, registration] of this.services) {
      if (registration.instance && typeof registration.instance.dispose === 'function') {
        disposableServices.push({ instance: registration.instance, key })
      }
    }

    // Dispose in reverse order (last registered first)
    for (let i = disposableServices.length - 1; i >= 0; i--) {
      const { instance, key } = disposableServices[i]
      try {
        await instance.dispose()
        console.debug(`🧹 Disposed service: ${String(key)}`)
      } catch (error) {
        console.error(`Failed to dispose service ${String(key)}:`, error)
      }
    }

    this.services.clear()
    this.resolving.clear()
    this.initialized = false
  }
}
```

### 2. Service Keys (Type-Safe Service Identifiers)

```typescript
// src/core/di/ServiceKeys.ts

// Use symbols for type-safe service keys
export const ServiceKeys = {
  // Core Three.js services
  SceneManager: Symbol('SceneManager'),
  SharedMaterialManager: Symbol('SharedMaterialManager'),
  
  // Rendering services
  GameBoxRenderer: Symbol('GameBoxRenderer'),
  RoomManager: Symbol('RoomManager'),
  
  // WebXR services
  WebXRCoordinator: Symbol('WebXRCoordinator'),
  WebXRManager: Symbol('WebXRManager'),
  InputManager: Symbol('InputManager'),
  
  // UI services
  UICoordinator: Symbol('UICoordinator'),
  UIManager: Symbol('UIManager'),
  
  // Data services
  DataManager: Symbol('DataManager'),
  EventManager: Symbol('EventManager'),
  
  // Steam services
  SteamIntegration: Symbol('SteamIntegration'),
  SteamGameManager: Symbol('SteamGameManager'),
  
  // Configuration
  AppConfig: Symbol('AppConfig'),
  PerformanceConfig: Symbol('PerformanceConfig')
} as const

export type ServiceKey<T> = symbol | (new (...args: any[]) => T)
```

### 3. Service Registration Module

```typescript
// src/core/di/ServiceRegistration.ts

import { ServiceContainer, ServiceLifetime } from './ServiceContainer'
import { ServiceKeys } from './ServiceKeys'
import { SceneManager } from '../../scene/SceneManager'
import { GameBoxRenderer } from '../../scene/GameBoxRenderer'
import { RoomManager } from '../../scene/RoomManager'
import { SharedMaterialManager } from '../../utils/SharedMaterialManager'
import { WebXRCoordinator } from '../../webxr/WebXRCoordinator'
import { UICoordinator } from '../../ui/UICoordinator'
import { DataManager } from '../data/DataManager'
import { EventManager } from '../EventManager'

export interface AppConfig {
  performance?: {
    maxGameBoxes?: number
    enableVROptimizations?: boolean
  }
  webxr?: {
    preferredMode?: 'vr' | 'ar'
  }
  ui?: {
    theme?: 'dark' | 'light'
  }
}

export class ServiceRegistration {
  public static configureServices(
    container: ServiceContainer, 
    config: AppConfig = {}
  ): ServiceContainer {
    
    // Configuration
    container.registerInstance(ServiceKeys.AppConfig, config)

    // Core singletons (no dependencies)
    container.registerSingleton(
      ServiceKeys.EventManager, 
      () => EventManager.getInstance()
    )

    container.registerSingleton(
      ServiceKeys.DataManager, 
      () => DataManager.getInstance(config.data)
    )

    container.registerSingleton(
      ServiceKeys.SharedMaterialManager, 
      () => {
        const manager = SharedMaterialManager.getInstance()
        manager.initialize()
        return manager
      }
    )

    // Scene services (Three.js context required)
    container.registerSingleton(
      ServiceKeys.SceneManager,
      () => new SceneManager(config.scene),
      []
    )

    // GameBoxRenderer (depends on SharedMaterialManager)
    container.registerSingleton(
      ServiceKeys.GameBoxRenderer,
      async (container) => {
        const materialManager = await container.resolve(ServiceKeys.SharedMaterialManager)
        const sceneManager = await container.resolve(ServiceKeys.SceneManager)
        
        return new GameBoxRenderer(
          config.performance?.gameBox?.dimensions,
          config.performance?.gameBox?.shelf,
          config.performance?.gameBox?.performance,
          sceneManager
        )
      },
      [ServiceKeys.SharedMaterialManager, ServiceKeys.SceneManager]
    )

    // RoomManager (depends on SceneManager)
    container.registerSingleton(
      ServiceKeys.RoomManager,
      async (container) => {
        const sceneManager = await container.resolve(ServiceKeys.SceneManager)
        return new RoomManager(sceneManager.getScene())
      },
      [ServiceKeys.SceneManager]
    )

    // WebXR services (depend on SceneManager)
    container.registerSingleton(
      ServiceKeys.WebXRCoordinator,
      async (container) => {
        const sceneManager = await container.resolve(ServiceKeys.SceneManager)
        return new WebXRCoordinator(
          config.webxr,
          {
            // WebXR callbacks can be injected here
          }
        )
      },
      [ServiceKeys.SceneManager]
    )

    // UI services (depend on various services)
    container.registerSingleton(
      ServiceKeys.UICoordinator,
      async (container) => {
        // UICoordinator has complex dependencies - resolve them all
        const performanceMonitor = await container.resolve(ServiceKeys.PerformanceMonitor)
        const debugStatsProvider = await container.resolve(ServiceKeys.DebugStatsProvider)
        const steamIntegration = await container.resolve(ServiceKeys.SteamIntegration)
        
        return new UICoordinator(
          performanceMonitor,
          debugStatsProvider,
          undefined, // cache stats provider
          steamIntegration
        )
      },
      [ServiceKeys.PerformanceMonitor, ServiceKeys.DebugStatsProvider, ServiceKeys.SteamIntegration]
    )

    return container
  }
}
```

### 4. Enhanced SteamBrickAndMortarApp Integration

```typescript
// src/core/SteamBrickAndMortarApp.ts - Enhanced with DI

import { ServiceContainer } from './di/ServiceContainer'
import { ServiceRegistration, AppConfig } from './di/ServiceRegistration'
import { ServiceKeys } from './di/ServiceKeys'

export class SteamBrickAndMortarApp {
  private container: ServiceContainer
  private isInitialized = false

  constructor(config: AppConfig = {}) {
    // Create and configure the service container
    this.container = new ServiceContainer()
    ServiceRegistration.configureServices(this.container, config)
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('⚠️ Application already initialized')
      return
    }

    try {
      // Initialize the container (locks registration, enables resolution)
      await this.container.initialize()

      // Resolve core services in proper order
      // These calls will handle dependency injection automatically
      const sceneManager = await this.container.resolve(ServiceKeys.SceneManager)
      const webxrCoordinator = await this.container.resolve(ServiceKeys.WebXRCoordinator)
      const uiCoordinator = await this.container.resolve(ServiceKeys.UICoordinator)
      const roomManager = await this.container.resolve(ServiceKeys.RoomManager)

      // Setup WebXR with the scene manager
      await webxrCoordinator.setupWebXR(sceneManager.getRenderer())

      // Setup UI
      await uiCoordinator.setupUI(sceneManager.getRenderer())

      // Start render loop with injected dependencies
      sceneManager.startRenderLoop({
        webxrCoordinator,
        roomManager
      })

      this.isInitialized = true
      console.log('🚀 Steam Brick and Mortar initialized with DI container')

    } catch (error) {
      console.error('❌ Failed to initialize application:', error)
      throw error
    }
  }

  /**
   * Get a service from the container (for external use)
   */
  public getService<T>(key: symbol): T {
    if (!this.isInitialized) {
      throw new Error('Application must be initialized before accessing services')
    }
    return this.container.get<T>(key)
  }

  /**
   * Dispose the application and all services
   */
  public async dispose(): Promise<void> {
    if (this.isInitialized) {
      await this.container.dispose()
      this.isInitialized = false
      console.log('🧹 Application disposed')
    }
  }

  public getIsInitialized(): boolean {
    return this.isInitialized
  }

  // Legacy compatibility methods
  public getSceneManager() {
    return this.getService(ServiceKeys.SceneManager)
  }

  public getCurrentPerformanceStats() {
    // Delegate to performance monitor service
    return this.getService(ServiceKeys.PerformanceMonitor).getStats()
  }
}
```

## Testing Integration

### 5. Test Container Support

```typescript
// test/utils/TestServiceContainer.ts

import { ServiceContainer } from '../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../src/core/di/ServiceKeys'

export class TestServiceContainer {
  private container: ServiceContainer

  constructor() {
    this.container = new ServiceContainer()
    this.configureMockServices()
  }

  private configureMockServices(): void {
    // Register mock services for testing
    this.container.registerInstance(ServiceKeys.SceneManager, {
      getScene: vi.fn().mockReturnValue({ add: vi.fn(), remove: vi.fn() }),
      getRenderer: vi.fn().mockReturnValue({ setSize: vi.fn(), render: vi.fn() }),
      getCamera: vi.fn().mockReturnValue({ position: { set: vi.fn() } }),
      startRenderLoop: vi.fn(),
      dispose: vi.fn()
    })

    this.container.registerInstance(ServiceKeys.SharedMaterialManager, {
      getInstance: vi.fn().mockReturnThis(),
      initialize: vi.fn(),
      getGameBoxMaterial: vi.fn().mockReturnValue({}),
      dispose: vi.fn()
    })

    // Add other mock services as needed
  }

  public async initialize(): Promise<ServiceContainer> {
    await this.container.initialize()
    return this.container
  }

  public async dispose(): Promise<void> {
    await this.container.dispose()
  }
}

// Test helper function
export async function createTestContainer(): Promise<ServiceContainer> {
  const testContainer = new TestServiceContainer()
  return await testContainer.initialize()
}
```

### 6. Updated Test Patterns

```typescript
// Example test file using DI
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestContainer } from '../utils/TestServiceContainer'
import { ServiceKeys } from '../../src/core/di/ServiceKeys'
import type { GameBoxRenderer } from '../../src/scene/GameBoxRenderer'

describe('GameBoxRenderer Integration Tests', () => {
  let container: ServiceContainer
  let gameBoxRenderer: GameBoxRenderer

  beforeEach(async () => {
    container = await createTestContainer()
    gameBoxRenderer = await container.resolve(ServiceKeys.GameBoxRenderer)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should create game boxes with shared materials', () => {
    // Test implementation using injected dependencies
    expect(gameBoxRenderer).toBeDefined()
    // gameBoxRenderer now has properly injected SharedMaterialManager
  })
})
```

## Benefits of This Pattern

### 1. **Solves Our Current Issues**
- ✅ **Single GameBoxRenderer instance**: Container ensures singleton lifecycle
- ✅ **Proper dependency order**: WebXR setup after Three.js context
- ✅ **Test isolation**: Clean mock container for each test
- ✅ **Resource cleanup**: Automatic disposal chains

### 2. **Minimal Refactoring Required**
- Most constructors already accept dependencies
- Existing singletons can be easily integrated
- No need to change component interfaces

### 3. **Type Safety**
- Symbol-based service keys prevent typos
- TypeScript ensures proper service types
- Compile-time dependency validation

### 4. **Performance Focused**
- Lazy initialization (services created when needed)
- Singleton lifecycle management
- Async resolution supports heavy initialization

### 5. **WebXR Compatible**
- Respects Three.js initialization order
- Handles async WebXR capability detection
- Supports optional WebXR features

## Migration Strategy

### Phase 1: Core Services (Week 1)
1. Implement ServiceContainer and ServiceKeys
2. Migrate SharedMaterialManager and GameBoxRenderer
3. Update SteamBrickAndMortarApp to use container
4. Verify single GameBoxRenderer instance

### Phase 2: Scene Services (Week 2)  
1. Migrate SceneManager and RoomManager
2. Add WebXR service registration
3. Update test patterns to use TestServiceContainer
4. Performance validation

### Phase 3: Complete Migration (Week 3)
1. Migrate remaining services (UI, Steam, etc.)
2. Remove old singleton getInstance() calls where appropriate
3. Add comprehensive DI documentation
4. Clean up legacy factory patterns

This DI pattern provides the structure needed to eliminate our factory redundancies while maintaining compatibility with our WebXR-first architecture and existing component designs.