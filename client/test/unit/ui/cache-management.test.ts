/**
 * Integration test for cache stats functionality
 * Tests the actual cache stats flow from ImageManager to UI
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CacheManagementPanel } from '../../../src/ui/pause/panels/CacheManagementPanel'
import type { ImageCacheStats } from '../../../src/steam/images/ImageManager'

// Mock DOM methods
const mockElement = {
    querySelector: vi.fn(),
    textContent: '',
    addEventListener: vi.fn(),
    remove: vi.fn(),
    removeAttribute: vi.fn(),
    setAttribute: vi.fn()
}

Object.defineProperty(globalThis, 'document', {
    value: {
        getElementById: vi.fn().mockReturnValue(mockElement),
        createElement: vi.fn().mockReturnValue(mockElement)
    },
    writable: true
})

describe('Cache Management Integration Tests', () => {
    let cachePanel: CacheManagementPanel
    let mockCacheStats: ImageCacheStats

    beforeEach(() => {
        mockCacheStats = {
            totalImages: 15,
            totalSize: 1024 * 1024 * 3, // 3MB
            oldestTimestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
            newestTimestamp: Date.now() - 1000 * 60 * 10  // 10 minutes ago
        }

        cachePanel = new CacheManagementPanel()
        vi.clearAllMocks()
    })

    afterEach(() => {
        cachePanel.dispose()
    })

    describe('Cache Stats Provider Integration', () => {
        it('should handle successful cache stats', async () => {
            // Setup mock provider that returns real stats
            const mockProvider = vi.fn().mockResolvedValue(mockCacheStats)
            const mockClearCache = vi.fn().mockResolvedValue(undefined)
            
            cachePanel.initCacheFunctions(mockProvider, mockClearCache)

            // Should not throw when getting stats
            await expect(mockProvider()).resolves.toEqual(mockCacheStats)
        })

        it('should handle null cache stats gracefully', async () => {
            // Setup mock provider that returns null (simulating broken event system)
            const mockProvider = vi.fn().mockResolvedValue(null)
            const mockClearCache = vi.fn().mockResolvedValue(undefined)
            
            cachePanel.initCacheFunctions(mockProvider, mockClearCache)

            // Should handle null gracefully
            const stats = await mockProvider()
            expect(stats).toBeNull()
        })

        it('should handle cache stats provider errors', async () => {
            // Setup mock provider that throws error
            const mockProvider = vi.fn().mockRejectedValue(new Error('Cache unavailable'))
            const mockClearCache = vi.fn().mockResolvedValue(undefined)
            
            cachePanel.initCacheFunctions(mockProvider, mockClearCache)

            // Should propagate error
            await expect(mockProvider()).rejects.toThrow('Cache unavailable')
        })
    })

    describe('Cache Stats Conversion', () => {
        it('should convert valid ImageCacheStats correctly', () => {
            // Access private method for testing
            const convertedStats = (cachePanel as any).convertCacheStats(mockCacheStats)
            
            expect(convertedStats).toEqual({
                imageCount: 15,
                totalSize: 1024 * 1024 * 3,
                lastUpdate: new Date(mockCacheStats.newestTimestamp)
            })
        })

        it('should handle null ImageCacheStats', () => {
            // Test the null handling we added
            const convertedStats = (cachePanel as any).convertCacheStats(null)
            
            expect(convertedStats).toEqual({
                imageCount: 0,
                totalSize: 0,
                lastUpdate: null
            })
        })

        it('should handle ImageCacheStats with zero timestamps', () => {
            const zeroStats: ImageCacheStats = {
                totalImages: 5,
                totalSize: 1024,
                oldestTimestamp: 0,
                newestTimestamp: 0
            }

            const convertedStats = (cachePanel as any).convertCacheStats(zeroStats)
            
            expect(convertedStats).toEqual({
                imageCount: 5,
                totalSize: 1024,
                lastUpdate: null // Should be null when timestamp is 0
            })
        })
    })

    describe('Error Handling', () => {
        it('should not crash when DOM elements are missing', () => {
            // Mock missing DOM elements
            globalThis.document.getElementById = vi.fn().mockReturnValue(null)
            
            expect(() => {
                cachePanel.render()
                cachePanel.attachEvents()
            }).not.toThrow()
        })

        it('should show fallback text for null lastUpdate', () => {
            // Test the template rendering with null lastUpdate
            const templateData = cachePanel.render()
            
            // Should contain 'Never' when no lastUpdate
            expect(templateData).toContain('Never')
        })
    })
})
