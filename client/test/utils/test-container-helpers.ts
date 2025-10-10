/**
 * Test Container Helpers for DI Migration
 * 
 * Provides specialized test container setup functions for different test categories.
 * These helpers simplify test migration from manual getInstance() calls to proper DI.
 * 
 * Usage Patterns:
 * - Scene/RoomManager tests: Use createSceneTestContainer()
 * - Performance tests: Use createPerformanceTestContainer()
 * - Lighting tests: Use createLightingTestContainer()
 * - Quick mock setup: Use createMockDependencies()
 * 
 * Design Philosophy:
 * - Each helper creates a clean, isolated container
 * - Singletons are used for services that MUST be singletons (EventManager, DataManager)
 * - Mocks are injected for external dependencies (WebGL, Steam API)
 * - Helpers are composable - you can add custom mocks after creation
 */

import { vi } from 'vitest'
import { ServiceContainer } from '../../src/core/di/ServiceContainer'
import { ServiceKeys, type ServiceKeyType } from '../../src/core/di/ServiceKeys'
import { EventManager } from '../../src/core/EventManager'
import { DataManager } from '../../src/core/data/DataManager'
import { AppSettings } from '../../src/core/AppSettings'

/**
 * Mock dependencies commonly needed across test types
 */
export interface MockDependencies {
    eventManager: EventManager
    dataManager: DataManager
    appSettings: AppSettings
    sceneManager?: any
    sharedMaterialManager?: any
    proceduralTextures?: any
}

/**
 * Create mock dependencies without a container
 * 
 * Use this for simple tests that don't need full DI container infrastructure.
 * Good for unit tests of small components that take direct dependencies.
 * 
 * Example:
 * ```typescript
 * const mocks = createMockDependencies()
 * const component = new MyComponent(mocks.eventManager, mocks.dataManager)
 * ```
 */
export function createMockDependencies(): MockDependencies {
    const eventManager = EventManager.getInstance()
    const dataManager = DataManager.getInstance()
    const appSettings = AppSettings.getInstance()

    // Mock scene manager without WebGL
    const sceneManager = {
        name: 'MockSceneManager',
        scene: {
            add: vi.fn(),
            remove: vi.fn(),
            children: []
        },
        getScene: vi.fn(function() { return this.scene }),
        dispose: vi.fn()
    }

    // Mock shared material manager
    const sharedMaterialManager = {
        name: 'MockSharedMaterialManager',
        getMaterial: vi.fn(() => ({ name: 'MockMaterial', dispose: vi.fn() })),
        createMaterial: vi.fn(() => ({ name: 'MockMaterial', dispose: vi.fn() })),
        dispose: vi.fn()
    }

    // Mock procedural textures
    const proceduralTextures = {
        name: 'MockProceduralTextures',
        getTexture: vi.fn(() => ({ name: 'MockTexture', dispose: vi.fn() })),
        createTexture: vi.fn(() => ({ name: 'MockTexture', dispose: vi.fn() })),
        dispose: vi.fn()
    }

    return {
        eventManager,
        dataManager,
        appSettings,
        sceneManager,
        sharedMaterialManager,
        proceduralTextures
    }
}

/**
 * Create a test container for Scene/RoomManager tests
 * 
 * Sets up:
 * - EventManager (singleton - must be shared for event coordination)
 * - DataManager (singleton - must be shared for data consistency)
 * - AppSettings (singleton - must be shared for settings)
 * - Mock SceneManager (no WebGL)
 * - Mock SharedMaterialManager
 * 
 * Use this for tests in:
 * - test/unit/scene/RoomManager-verification.test.ts
 * - test/unit/scene/shelf-spawning-integration.test.ts
 * - test/unit/scene/ceiling-visibility.test.ts
 * - test/unit/scene/game-layout.test.ts
 * - test/unit/scene/room-state.test.ts
 * 
 * Example:
 * ```typescript
 * let container: ServiceContainer
 * 
 * beforeEach(async () => {
 *   container = await createSceneTestContainer()
 * })
 * 
 * afterEach(async () => {
 *   await container.dispose()
 * })
 * 
 * it('should create room manager with DI', async () => {
 *   const eventManager = await container.resolve(ServiceKeys.EventManager)
 *   const dataManager = await container.resolve(ServiceKeys.DataManager)
 *   const roomManager = new RoomManager(eventManager, dataManager, ...)
 *   // ...
 * })
 * ```
 */
export async function createSceneTestContainer(): Promise<ServiceContainer> {
    const container = new ServiceContainer()

    // Register core singletons (MUST be shared across the test)
    container.registerSingleton(ServiceKeys.EventManager, () => {
        return EventManager.getInstance()
    })

    container.registerSingleton(ServiceKeys.DataManager, () => {
        return DataManager.getInstance()
    })

    container.registerSingleton(ServiceKeys.AppSettings, () => {
        return AppSettings.getInstance()
    })

    // Register mock scene services (no WebGL dependencies)
    container.registerSingleton(ServiceKeys.SceneManager, () => ({
        name: 'MockSceneManager',
        scene: {
            add: vi.fn(),
            remove: vi.fn(),
            children: []
        },
        getScene: vi.fn(function() { return this.scene }),
        dispose: vi.fn()
    }))

    container.registerSingleton(ServiceKeys.SharedMaterialManager, () => ({
        name: 'MockSharedMaterialManager',
        getMaterial: vi.fn(() => ({ name: 'MockMaterial', dispose: vi.fn() })),
        createMaterial: vi.fn(() => ({ name: 'MockMaterial', dispose: vi.fn() })),
        dispose: vi.fn()
    }))

    await container.initialize()
    return container
}

/**
 * Create a test container for performance tests
 * 
 * Sets up:
 * - EventManager (singleton)
 * - DataManager (singleton)
 * - AppSettings (singleton)
 * - Mock SceneManager
 * - Mock SharedMaterialManager
 * - Mock ProceduralTextures (for texture performance tests)
 * 
 * Use this for tests in:
 * - test/performance/utils/enhanced-textures.test.ts
 * - test/performance/scene/room-manager-performance.test.ts
 * 
 * Example:
 * ```typescript
 * let container: ServiceContainer
 * 
 * beforeEach(async () => {
 *   container = await createPerformanceTestContainer()
 * })
 * 
 * afterEach(async () => {
 *   await container.dispose()
 * })
 * 
 * it('should measure texture creation performance', async () => {
 *   const textures = await container.resolve(ServiceKeys.ProceduralTextures)
 *   // ... performance measurement
 * })
 * ```
 */
export async function createPerformanceTestContainer(): Promise<ServiceContainer> {
    const container = new ServiceContainer()

    // Core singletons
    container.registerSingleton(ServiceKeys.EventManager, () => {
        return EventManager.getInstance()
    })

    container.registerSingleton(ServiceKeys.DataManager, () => {
        return DataManager.getInstance()
    })

    container.registerSingleton(ServiceKeys.AppSettings, () => {
        return AppSettings.getInstance()
    })

    // Mock scene services
    container.registerSingleton(ServiceKeys.SceneManager, () => ({
        name: 'MockSceneManager',
        scene: {
            add: vi.fn(),
            remove: vi.fn(),
            children: []
        },
        getScene: vi.fn(function() { return this.scene }),
        dispose: vi.fn()
    }))

    container.registerSingleton(ServiceKeys.SharedMaterialManager, () => ({
        name: 'MockSharedMaterialManager',
        getMaterial: vi.fn(() => ({ name: 'MockMaterial', dispose: vi.fn() })),
        createMaterial: vi.fn(() => ({ name: 'MockMaterial', dispose: vi.fn() })),
        dispose: vi.fn()
    }))

    await container.initialize()
    return container
}

/**
 * Create a test container for lighting tests
 * 
 * Sets up:
 * - EventManager (singleton)
 * - DataManager (singleton)
 * - AppSettings (singleton)
 * - Mock SceneManager
 * - Mock LightingManager
 * 
 * Use this for tests in:
 * - test/unit/lighting/adaptive-lighting.test.ts
 * 
 * Example:
 * ```typescript
 * let container: ServiceContainer
 * 
 * beforeEach(async () => {
 *   container = await createLightingTestContainer()
 * })
 * 
 * afterEach(async () => {
 *   await container.dispose()
 * })
 * 
 * it('should adjust lighting based on scene', async () => {
 *   const eventManager = await container.resolve(ServiceKeys.EventManager)
 *   const lightingManager = await container.resolve(ServiceKeys.LightingManager)
 *   // ...
 * })
 * ```
 */
export async function createLightingTestContainer(): Promise<ServiceContainer> {
    const container = new ServiceContainer()

    // Core singletons
    container.registerSingleton(ServiceKeys.EventManager, () => {
        return EventManager.getInstance()
    })

    container.registerSingleton(ServiceKeys.DataManager, () => {
        return DataManager.getInstance()
    })

    container.registerSingleton(ServiceKeys.AppSettings, () => {
        return AppSettings.getInstance()
    })

    // Mock scene services
    container.registerSingleton(ServiceKeys.SceneManager, () => ({
        name: 'MockSceneManager',
        scene: {
            add: vi.fn(),
            remove: vi.fn(),
            children: []
        },
        getScene: vi.fn(function() { return this.scene }),
        dispose: vi.fn()
    }))

    await container.initialize()
    return container
}

/**
 * Add custom mock service to an existing container
 * 
 * Helper for extending containers with test-specific mocks.
 * 
 * Example:
 * ```typescript
 * const container = await createSceneTestContainer()
 * 
 * // Add custom mock for this specific test
 * addMockService(container, ServiceKeys.SteamIntegration, () => ({
 *   loadGames: vi.fn().mockResolvedValue([])
 * }))
 * 
 * // Container now has both scene services AND custom mock
 * const steamIntegration = await container.resolve(ServiceKeys.SteamIntegration)
 * ```
 */
export function addMockService<T>(
    container: ServiceContainer,
    key: ServiceKeyType<T>,
    mockFactory: () => T | Promise<T>
): void {
    container.registerSingleton(key, async () => {
        return await mockFactory()
    })
}

/**
 * Helper to verify singleton behavior in tests
 * 
 * Use this when testing that singletons actually work as singletons.
 * Resolves a service twice and verifies both references are the same instance.
 * 
 * Example:
 * ```typescript
 * it('should maintain singleton behavior', async () => {
 *   const container = await createSceneTestContainer()
 *   await verifySingleton(container, ServiceKeys.EventManager)
 * })
 * ```
 */
export async function verifySingleton<T>(
    container: ServiceContainer,
    key: ServiceKeyType<T>
): Promise<void> {
    const instance1 = await container.resolve(key)
    const instance2 = await container.resolve(key)
    
    if (instance1 !== instance2) {
        throw new Error(`Service ${String(key)} is not a singleton! Got different instances.`)
    }
}
