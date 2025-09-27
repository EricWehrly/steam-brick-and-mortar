/**
 * Performance test for measuring and validating application performance metrics
 * 
 * This test provides numerical measurements that can be observed during development
 * and helps establish performance baselines.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SteamBrickAndMortarApp } from '../../src/core/SteamBrickAndMortarApp'

// Mock all dependencies to focus on performance measurement
vi.mock('../../src/scene/SceneManager', async () => {
    const { sceneManagerMockFactory } = await import('../mocks/scene/SceneManager.mock')
    return sceneManagerMockFactory()
})

vi.mock('../../src/scene/AssetLoader', async () => {
    const { assetLoaderMockFactory } = await import('../mocks/scene/AssetLoader.mock')
    return assetLoaderMockFactory()
})

vi.mock('../../src/scene/GameBoxRenderer', async () => {
    const { gameBoxRendererMockFactory } = await import('../mocks/scene/GameBoxRenderer.mock')
    return gameBoxRendererMockFactory()
})

vi.mock('../../src/scene/SignageRenderer', async () => {
    const { signageRendererMockFactory } = await import('../mocks/scene/SignageRenderer.mock')
    return signageRendererMockFactory()
})

vi.mock('../../src/scene/StoreLayout', async () => {
    const { storeLayoutMockFactory } = await import('../mocks/scene/StoreLayout.mock')
    return storeLayoutMockFactory()
})

vi.mock('../../src/steam-integration/SteamIntegration', async () => {
    const { steamIntegrationMockFactory } = await import('../mocks/steam-integration/SteamIntegration.mock')
    return steamIntegrationMockFactory()
})

vi.mock('../../src/webxr/WebXRManager', async () => {
    const { webxrManagerMockFactory } = await import('../mocks/webxr/WebXRManager.mock')
    return webxrManagerMockFactory()
})

vi.mock('../../src/webxr/InputManager', async () => {
    const { inputManagerMockFactory } = await import('../mocks/webxr/InputManager.mock')
    return inputManagerMockFactory()
})

vi.mock('../../src/ui/UIManager', async () => {
    const { uiManagerMockFactory } = await import('../mocks/ui/UIManager.mock')
    return uiManagerMockFactory()
})

vi.mock('../../src/ui/CacheManagementUI', async () => {
    const { cacheManagementUIMockFactory } = await import('../mocks/ui/CacheManagementUI.mock')
    return cacheManagementUIMockFactory()
})

// Mock DOM for PerformanceMonitor
const mockDocument = {
    createElement: vi.fn().mockReturnValue({
        id: '',
        style: {},
        innerHTML: '',
        appendChild: vi.fn(),
        parentNode: null
    }),
    body: {
        appendChild: vi.fn()
    }
}

Object.defineProperty(globalThis, 'document', {
    value: mockDocument,
    writable: true
})

// Mock global performance with memory extension
interface PerformanceWithMemory {
    now: () => number
    memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
        jsHeapSizeLimit: number
    }
}

const mockPerformance: PerformanceWithMemory = {
    now: vi.fn().mockReturnValue(1000),
    memory: {
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024
    }
}

Object.defineProperty(globalThis, 'window', {
    value: {
        performance: mockPerformance,
        requestAnimationFrame: vi.fn(),
        cancelAnimationFrame: vi.fn()
    },
    writable: true
})

// Mock global performance
Object.defineProperty(globalThis, 'performance', {
    value: mockPerformance,
    writable: true
})

describe.skip('Performance Measurements', () => {
    let app: SteamBrickAndMortarApp

    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        if (app?.getIsInitialized()) {
            app.dispose()
        }
    })

    it('should measure application initialization time', async () => {
        const startTime = window.performance.now()
        
        app = new SteamBrickAndMortarApp({
            scene: {
                antialias: false, // Disable for faster initialization
                shadowQuality: 0 // Shadows disabled for performance
            },
            steam: {
                apiBaseUrl: 'http://test.com',
                maxGames: 10 // Small number for faster tests
            }
        })
        
        await app.init()
        
        const endTime = window.performance.now()
        const initializationTime = endTime - startTime
        
        console.log(`🚀 App initialization took: ${initializationTime.toFixed(2)}ms`)
        
        // Expect initialization to be reasonably fast (adjust threshold as needed)
        expect(initializationTime).toBeLessThan(100) // 100ms threshold
        expect(app.getIsInitialized()).toBe(true)
    })

    it('should measure performance stats retrieval time', async () => {
        app = new SteamBrickAndMortarApp()
        await app.init()
        
        const measurements: number[] = []
        const iterations = 100
        
        for (let i = 0; i < iterations; i++) {
            const startTime = window.performance.now()
            const stats = app.getCurrentPerformanceStats()
            const endTime = window.performance.now()
            
            measurements.push(endTime - startTime)
            
            // Validate stats structure
            expect(stats).toHaveProperty('fps')
            expect(stats).toHaveProperty('frameTime')
            expect(typeof stats.fps).toBe('number')
            expect(typeof stats.frameTime).toBe('number')
        }
        
        const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length
        const maxTime = Math.max(...measurements)
        const minTime = Math.min(...measurements)
        
        console.log(`📊 Performance stats retrieval:`)
        console.log(`  Average: ${avgTime.toFixed(3)}ms`)
        console.log(`  Min: ${minTime.toFixed(3)}ms`)
        console.log(`  Max: ${maxTime.toFixed(3)}ms`)
        console.log(`  Iterations: ${iterations}`)
        
        // Performance stats should be very fast to retrieve
        expect(avgTime).toBeLessThan(1) // 1ms average threshold
        expect(maxTime).toBeLessThan(5) // 5ms max threshold
    })

    it('should measure memory usage patterns', async () => {
        const initialMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0
        
        app = new SteamBrickAndMortarApp()
        await app.init()
        
        const afterInitMemory = (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0
        const memoryIncrease = afterInitMemory - initialMemory
        
        console.log(`💾 Memory usage:`)
        console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`)
        console.log(`  After init: ${(afterInitMemory / 1024 / 1024).toFixed(2)}MB`)
        console.log(`  Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
        
        // Get performance stats to see current readings
        const perfStats = app.getCurrentPerformanceStats()
        if (perfStats.memoryUsed !== undefined) {
            console.log(`  Performance monitor reading: ${perfStats.memoryUsed.toFixed(2)}MB`)
        }
        
        // Memory increase should be reasonable (adjust as needed)
        expect(memoryIncrease).toBeGreaterThan(0) // Should use some memory
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024) // Less than 100MB increase
    })

    it('should measure disposal performance', async () => {
        app = new SteamBrickAndMortarApp()
        await app.init()
        
        const startTime = window.performance.now()
        app.dispose()
        const endTime = window.performance.now()
        
        const disposalTime = endTime - startTime
        
        console.log(`🧹 App disposal took: ${disposalTime.toFixed(2)}ms`)
        
        expect(disposalTime).toBeLessThan(50) // 50ms threshold for cleanup
        expect(app.getIsInitialized()).toBe(false)
    })

    it('should validate performance monitor baseline metrics', async () => {
        app = new SteamBrickAndMortarApp()
        await app.init()
        
        // Get baseline measurements
        const stats = app.getCurrentPerformanceStats()
        
        console.log(`📈 Performance baseline:`)
        console.log(`  FPS: ${stats.fps.toFixed(1)}`)
        console.log(`  Frame time: ${stats.frameTime.toFixed(2)}ms`)
        
        if (stats.memoryUsed !== undefined) {
            console.log(`  Memory used: ${stats.memoryUsed.toFixed(2)}MB`)
        }
        if (stats.memoryTotal !== undefined) {
            console.log(`  Memory total: ${stats.memoryTotal.toFixed(2)}MB`)
        }
        
        // Basic sanity checks
        expect(stats.fps).toBeGreaterThanOrEqual(0)
        expect(stats.frameTime).toBeGreaterThanOrEqual(0)
        
        if (stats.memoryUsed !== undefined) {
            expect(stats.memoryUsed).toBeGreaterThan(0)
        }
    })
})
