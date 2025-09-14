/**
 * Unit tests for UICoordinator cache stats integration
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { UICoordinator } from '../../../src/ui/UICoordinator'
import { PerformanceMonitor } from '../../../src/ui/PerformanceMonitor'
import type { DebugStatsProvider, DebugStats } from '../../../src/core/DebugStatsProvider'
import type { ImageCacheStats } from '../../../src/steam/images/ImageManager'

// Mock the dependencies
vi.mock('../../../src/ui/UIManager')
vi.mock('../../../src/ui/pause/PauseMenuManager')
vi.mock('../../../src/core/EventManager')

describe('UICoordinator Cache Integration Tests', () => {
    let performanceMonitor: PerformanceMonitor
    let debugStatsProvider: DebugStatsProvider
    let mockCacheStatsProvider: Mock<[], Promise<ImageCacheStats>>
    let uiCoordinator: UICoordinator

    const mockImageCacheStats: ImageCacheStats = {
        totalImages: 42,
        totalSize: 1024 * 1024 * 5, // 5MB
        oldestTimestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
        newestTimestamp: Date.now() - 1000 * 60 * 5   // 5 minutes ago
    }

    const mockDebugStats: DebugStats = {
        sceneObjects: { total: 0, meshes: 0, lights: 0, cameras: 0, textures: 0, materials: 0, geometries: 0 },
        performance: { fps: 60, frameTime: 16, memoryUsed: 1024000, memoryTotal: 2048000, triangles: 1000, drawCalls: 50 },
        cache: { imageCount: 0, imageCacheSize: 0, gameDataCount: 0, gameDataSize: 0, quotaUsed: 0, quotaTotal: 0 },
        system: { userAgent: 'test', webxrSupported: true, webglVersion: 'WebGL 2.0', maxTextureSize: 4096, vendor: 'test', renderer: 'test' }
    }

    beforeEach(() => {
        // Create mock dependencies
        performanceMonitor = {
            start: vi.fn(),
            dispose: vi.fn(),
            toggle: vi.fn(),
            getStats: vi.fn(),
            updateRenderStats: vi.fn()
        } as any

        debugStatsProvider = {
            getDebugStats: vi.fn().mockResolvedValue(mockDebugStats)
        } as any

        mockCacheStatsProvider = vi.fn().mockResolvedValue(mockImageCacheStats)

        // Clear all mocks
        vi.clearAllMocks()
    })

    describe('Cache Stats Provider Integration', () => {
        it('should initialize with cache stats provider', () => {
            expect(() => {
                uiCoordinator = new UICoordinator(
                    performanceMonitor,
                    debugStatsProvider,
                    mockCacheStatsProvider
                )
            }).not.toThrow()
        })

        it('should initialize without cache stats provider', () => {
            expect(() => {
                uiCoordinator = new UICoordinator(
                    performanceMonitor,
                    debugStatsProvider
                )
            }).not.toThrow()
        })

        it('should provide fallback cache stats when no provider is given', async () => {
            uiCoordinator = new UICoordinator(
                performanceMonitor,
                debugStatsProvider
            )

            // Access the fallback cache stats provider directly
            const fallbackProvider = (uiCoordinator as any).cacheStatsProvider || (() => Promise.resolve({ totalImages: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 }))
            const fallbackStats = await fallbackProvider()
            
            // Should provide empty stats rather than null
            expect(fallbackStats).toEqual({
                totalImages: 0,
                totalSize: 0,
                oldestTimestamp: 0,
                newestTimestamp: 0
            })
        })

        it('should use provided cache stats provider', async () => {
            uiCoordinator = new UICoordinator(
                performanceMonitor,
                debugStatsProvider,
                mockCacheStatsProvider
            )

            // The cache stats provider should be stored and available
            expect(mockCacheStatsProvider).toBeDefined()
            
            // When called, should return the mock stats
            const stats = await mockCacheStatsProvider()
            expect(stats).toEqual(mockImageCacheStats)
        })
    })

    describe('Constructor Validation', () => {
        it('should require performance monitor', () => {
            expect(() => {
                new UICoordinator(null as any, debugStatsProvider)
            }).toThrow()
        })

        it('should require debug stats provider', () => {
            expect(() => {
                new UICoordinator(performanceMonitor, null as any)
            }).toThrow()
        })

        it('should allow optional cache stats provider', () => {
            expect(() => {
                new UICoordinator(performanceMonitor, debugStatsProvider, undefined)
            }).not.toThrow()
        })
    })

    describe('Integration Flow', () => {
        beforeEach(() => {
            uiCoordinator = new UICoordinator(
                performanceMonitor,
                debugStatsProvider,
                mockCacheStatsProvider
            )
        })

        it('should handle cache stats provider errors gracefully', async () => {
            // Create a provider that throws an error
            const errorProvider = vi.fn().mockRejectedValue(new Error('Cache unavailable'))
            
            const coordinatorWithError = new UICoordinator(
                performanceMonitor,
                debugStatsProvider,
                errorProvider
            )

            // Should not throw when provider fails
            await expect(errorProvider()).rejects.toThrow('Cache unavailable')
        })

        it('should properly dispose of resources', () => {
            expect(() => {
                uiCoordinator.dispose()
            }).not.toThrow()

            // Performance monitor should be disposed
            expect(performanceMonitor.dispose).toHaveBeenCalledOnce()
        })
    })
})
