/**
 * Test utilities for Steam API testing
 * Provides common mocks, fixtures, and test helpers
 */

import { vi } from 'vitest'
import type { SteamGame, SteamUser } from '../../src/steam/SteamApiClient'
import { ServiceContainer, ServiceLifetime, type ServiceKey } from '../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../src/core/di/ServiceKeys'

export const mockGame: SteamGame = {
    appid: 220,
    name: 'Half-Life 2',
    playtime_forever: 1200,
    img_icon_url: 'test_icon',
    img_logo_url: 'test_logo',
    artwork: {
        icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/test_icon.jpg',
        logo: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/test_logo.jpg',
        header: 'https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg',
        library: 'https://cdn.akamai.steamstatic.com/steam/apps/220/library_600x900.jpg'
    }
}

export const mockUser: SteamUser = {
    steamid: '76561197984589530',
    vanity_url: 'testuser',
    game_count: 1,
    retrieved_at: new Date().toISOString(),
    games: [mockGame]
}

export function createMockBlob(type = 'image/jpeg', content = 'fake image data'): Blob {
    return new Blob([content], { type })
}

export function createMockFetchResponse(blob: Blob, ok = true) {
    return {
        ok,
        blob: vi.fn().mockResolvedValue(blob),
        status: ok ? 200 : 500,
        statusText: ok ? 'OK' : 'Internal Server Error'
    }
}

export function setupFetchMock() {
    ;(globalThis as any).fetch = vi.fn()
    return globalThis.fetch as any
}

export function setupLocalStorageMock() {
    const storage = new Map<string, string>()
    
    const localStorageMock = {
        storage,
        getItem: vi.fn((key: string) => storage.get(key) || null),
        setItem: vi.fn((key: string, value: string) => {
            storage.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
            storage.delete(key)
        }),
        clear: vi.fn(() => {
            storage.clear()
        }),
        get length() {
            return storage.size
        },
        key: vi.fn((index: number) => {
            const keys = Array.from(storage.keys())
            return keys[index] || null
        })
    }

    Object.defineProperty(globalThis, 'localStorage', {
        value: localStorageMock,
        writable: true
    })
    
    return localStorageMock
}

export function setupAbortControllerMock() {
    const mockAbortController = {
        signal: { aborted: false },
        abort: vi.fn()
    }
    ;(globalThis as any).AbortController = vi.fn(() => mockAbortController)
    return mockAbortController
}

/**
 * TestServiceContainer - Utility for creating DI containers in tests
 * 
 * Provides helper methods for:
 * - Creating clean containers for each test
 * - Registering mock services easily  
 * - Standard WebGL-free mocks for common services
 * - Cleanup and isolation between tests
 */
export class TestServiceContainer {
    private container: ServiceContainer
    private disposables: (() => Promise<void> | void)[] = []

    constructor() {
        this.container = new ServiceContainer()
    }

    /**
     * Register a mock singleton service
     */
    mockSingleton<T>(key: ServiceKey<T>, mockFactory: () => T | Promise<T>): TestServiceContainer {
        this.container.registerSingleton(key, async () => {
            const service = await mockFactory()
            return service
        })
        return this
    }

    /**
     * Register a mock transient service
     */
    mockTransient<T>(key: ServiceKey<T>, mockFactory: () => T | Promise<T>): TestServiceContainer {
        this.container.registerTransient(key, async () => {
            const service = await mockFactory()
            return service
        })
        return this
    }

    /**
     * Register standard WebGL-free mocks for common services
     */
    setupStandardMocks(): TestServiceContainer {
        // Mock SceneManager without WebGL
        this.mockSingleton(ServiceKeys.SceneManager, () => ({
            name: 'MockSceneManager',
            getScene: vi.fn(() => ({ add: vi.fn(), remove: vi.fn() })),
            dispose: vi.fn()
        }))

        // Mock SharedMaterialManager  
        this.mockSingleton(ServiceKeys.SharedMaterialManager, () => ({
            name: 'MockSharedMaterialManager',
            getMaterial: vi.fn(() => ({ name: 'MockMaterial' })),
            dispose: vi.fn()
        }))

        // Note: GameBoxRenderer removed from DI - now created via composition in renderers

        // Mock EventManager
        this.mockSingleton(ServiceKeys.EventManager, () => ({
            name: 'MockEventManager', 
            on: vi.fn(),
            emit: vi.fn(),
            off: vi.fn(),
            dispose: vi.fn()
        }))

        return this
    }

    /**
     * Initialize the container and make it ready for service resolution
     */
    async initialize(): Promise<TestServiceContainer> {
        await this.container.initialize()
        return this
    }

    /**
     * Resolve a service from the container
     */
    async resolve<T>(key: ServiceKey<T>): Promise<T> {
        return this.container.resolve(key)
    }

    /**
     * Get the underlying ServiceContainer for advanced usage
     */
    getContainer(): ServiceContainer {
        return this.container
    }

    /**
     * Register a cleanup function to run when disposing
     */
    onDispose(cleanup: () => Promise<void> | void): TestServiceContainer {
        this.disposables.push(cleanup)
        return this
    }

    /**
     * Clean up the container and all registered services
     */
    async dispose(): Promise<void> {
        // Run custom cleanup functions
        await Promise.all(this.disposables.map(cleanup => cleanup()))
        
        // Dispose the container
        await this.container.dispose()
    }
}

/**
 * Create a fresh TestServiceContainer for a test case
 * 
 * Example usage:
 * ```typescript
 * describe('MyService', () => {
 *   let testContainer: TestServiceContainer
 * 
 *   beforeEach(async () => {
 *     testContainer = await createTestContainer()
 *       .setupStandardMocks()
 *       .mockSingleton(ServiceKeys.MyService, () => new MockMyService())
 *       .initialize()
 *   })
 * 
 *   afterEach(async () => {
 *     await testContainer.dispose()
 *   })
 * 
 *   it('should work with DI', async () => {
 *     const service = await testContainer.resolve(ServiceKeys.MyService)
 *     expect(service).toBeDefined()
 *   })
 * })
 * ```
 */
export function createTestContainer(): TestServiceContainer {
    return new TestServiceContainer()
}
