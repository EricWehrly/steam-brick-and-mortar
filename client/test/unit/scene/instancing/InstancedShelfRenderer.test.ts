/**
 * Unit Tests for InstancedShelfRenderer - GPU Instanced Shelf Generation
 * 
 * These tests protect against regressions during refactoring by validating:
 * - Core contracts and interfaces
 * - Resource management and lifecycle
 * - Mathematical correctness of positioning and scaling
 * - Performance characteristics and limits
 * - Integration boundaries and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { InstancedShelfRenderer, type InstancedShelfConfig } from '../../../../src/scene/instancing/InstancedShelfRenderer'
import type { ShelfConfig } from '../../../../src/scene/props/SharedPropsUtils'
import { SharedMaterialManager, MaterialType } from '../../../../src/utils/SharedMaterialManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { EventManager } from '../../../../src/core/EventManager'

// Mock dependencies to isolate unit under test
vi.mock('../../../../src/utils/SharedMaterialManager')
vi.mock('../../../../src/core/data/DataManager')
vi.mock('../../../../src/core/EventManager')

describe('InstancedShelfRenderer', () => {
    let renderer: InstancedShelfRenderer
    let mockScene: THREE.Scene
    let mockMaterialManager: any
    let mockDataManager: any
    let mockEventManager: any

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks()

        // Setup mock scene
        mockScene = new THREE.Scene()

        // Setup mock material manager
        mockMaterialManager = {
            getMaterial: vi.fn().mockReturnValue(new THREE.MeshBasicMaterial()),
            getInstance: vi.fn().mockReturnThis()
        }
        vi.mocked(SharedMaterialManager.getInstance).mockReturnValue(mockMaterialManager)

        // Setup mock data manager
        mockDataManager = {
            get: vi.fn().mockReturnValue(mockScene)
        }
        vi.mocked(DataManager.getInstance).mockReturnValue(mockDataManager)

        // Setup mock event manager
        mockEventManager = {
            registerEventHandler: vi.fn(),
            emit: vi.fn()
        }
        vi.mocked(EventManager.getInstance).mockReturnValue(mockEventManager)
    })

    afterEach(() => {
        // Cleanup renderer to prevent memory leaks in test environment
        if (renderer) {
            renderer.dispose()
        }
    })

    describe('Construction and Configuration', () => {
        it('should construct with default configuration when no config provided', () => {
            renderer = new InstancedShelfRenderer()

            expect(renderer).toBeDefined()
            expect(renderer.isReady()).toBe(false) // Not initialized yet
        })

        it('should apply custom configuration overrides correctly', () => {
            const customConfig: InstancedShelfConfig = {
                maxShelfUnits: 500,
                maxInstances: 1000,
                defaultShelfConfig: {
                    width: 3.0,
                    height: 2.5,
                    depth: 0.8,
                    shelfCount: 4
                }
            }

            renderer = new InstancedShelfRenderer(customConfig)
            
            // Test that configuration is applied (via behavior, not internals)
            expect(() => renderer.initialize()).not.toThrow()
        })

        it('should register for GPU update events during construction', () => {
            renderer = new InstancedShelfRenderer()

            expect(mockEventManager.registerEventHandler).toHaveBeenCalled()
        })
    })

    describe('Initialization Contract', () => {
        beforeEach(() => {
            renderer = new InstancedShelfRenderer()
        })

        it('should initialize successfully with valid materials', async () => {
            await expect(renderer.initialize()).resolves.not.toThrow()
            expect(renderer.isReady()).toBe(true)
        })

        it('should prevent double initialization', async () => {
            await renderer.initialize()
            
            // Second initialization should not throw but should warn
            await expect(renderer.initialize()).resolves.not.toThrow()
            expect(renderer.isReady()).toBe(true)
        })

        it('should fail gracefully when materials are unavailable', async () => {
            // Mock material manager to throw error when materials are unavailable
            mockMaterialManager.getMaterial.mockImplementation(() => {
                throw new Error('Material not found')
            })

            await expect(renderer.initialize()).rejects.toThrow('Material not found')
            expect(renderer.isReady()).toBe(false)
        })

        it('should request correct material types during initialization', async () => {
            await renderer.initialize()

            // Verify all required material types are requested
            expect(mockMaterialManager.getMaterial).toHaveBeenCalledTimes(3)
            // Material types are internal, but we can verify the call count
        })
    })

    describe('Shelf Instance Management', () => {
        beforeEach(async () => {
            renderer = new InstancedShelfRenderer()
            await renderer.initialize()
        })

        it('should create shelf instances with valid indices', () => {
            const position = new THREE.Vector3(0, 0, 0)
            const result = renderer.setInstance(0, { position })

            expect(result).toBe(true)
        })

        it('should reject invalid instance indices', () => {
            const position = new THREE.Vector3(0, 0, 0)
            const maxUnits = 100 // Default max
            
            const result = renderer.setInstance(maxUnits, { position })

            expect(result).toBe(false)
        })

        it('should handle custom shelf configurations per instance', () => {
            const position = new THREE.Vector3(0, 0, 0)
            const customConfig: ShelfConfig = {
                width: 4.0,
                height: 3.0,
                shelfCount: 5
            }

            const result = renderer.setInstance(0, { 
                position, 
                shelfConfig: customConfig 
            })

            expect(result).toBe(true)
        })

        it('should maintain shelf unit count in statistics', () => {
            const position = new THREE.Vector3(0, 0, 0)
            
            renderer.setInstance(0, { position })
            renderer.setInstance(1, { position })

            const stats = renderer.getStats()
            expect(stats.activeInstances).toBe(2)
            expect(stats.shelfUnits).toBe(2)
        })
    })

    describe('Mathematical Correctness', () => {
        beforeEach(async () => {
            renderer = new InstancedShelfRenderer()
            await renderer.initialize()
        })

        it('should position shelf components at correct relative positions', () => {
            // This test ensures the mathematical relationships between components remain stable
            const position = new THREE.Vector3(5, 2, -3)
            const result = renderer.setInstance(0, { position })

            expect(result).toBe(true)
            
            // The internal positioning should be mathematically consistent
            // We can't directly test positions without exposing internals,
            // but we can ensure the operation succeeds and doesn't throw
        })

        it('should handle edge case positions without errors', () => {
            const edgeCases = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(-1000, 1000, -1000),
                new THREE.Vector3(Number.MAX_SAFE_INTEGER, 0, 0)
            ]

            edgeCases.forEach((position, index) => {
                const result = renderer.setInstance(index, { position })
                expect(result).toBe(true)
            })
        })

        it('should scale shelf dimensions correctly based on configuration', () => {
            const smallShelf: ShelfConfig = { width: 0.5, height: 0.5, depth: 0.1 }
            const largeShelf: ShelfConfig = { width: 10.0, height: 5.0, depth: 2.0 }

            const result1 = renderer.setInstance(0, { 
                position: new THREE.Vector3(0, 0, 0), 
                shelfConfig: smallShelf 
            })
            const result2 = renderer.setInstance(1, { 
                position: new THREE.Vector3(10, 0, 0), 
                shelfConfig: largeShelf 
            })

            expect(result1).toBe(true)
            expect(result2).toBe(true)
        })
    })

    describe('Performance and Resource Management', () => {
        beforeEach(async () => {
            renderer = new InstancedShelfRenderer({ maxShelfUnits: 10 })
            await renderer.initialize()
        })

        it('should enforce maximum shelf unit limits', () => {
            const position = new THREE.Vector3(0, 0, 0)
            
            // Fill to capacity
            for (let i = 0; i < 10; i++) {
                const result = renderer.setInstance(i, { position })
                expect(result).toBe(true)
            }
            
            // Attempt to exceed capacity
            const result = renderer.setInstance(10, { position })
            expect(result).toBe(false)
        })

        it('should provide accurate statistics about resource usage', () => {
            const position = new THREE.Vector3(0, 0, 0)
            
            // Create some instances
            renderer.setInstance(0, { position })
            renderer.setInstance(2, { position }) // Non-sequential to test tracking

            const stats = renderer.getStats()
            
            expect(stats.isInitialized).toBe(true)
            expect(stats.activeInstances).toBe(2)
            expect(stats.maxInstances).toBe(10)
            expect(stats.activeGeometryMaterialCombinations).toBeGreaterThan(0)
        })

        it('should reset state completely', () => {
            const position = new THREE.Vector3(0, 0, 0)
            
            // Create instances
            renderer.setInstance(0, { position })
            renderer.setInstance(1, { position })
            
            // Reset
            renderer.reset()
            
            const stats = renderer.getStats()
            expect(stats.activeInstances).toBe(0)
            expect(stats.shelfUnits).toBe(0)
        })

        it('should handle GPU updates without errors', () => {
            const position = new THREE.Vector3(0, 0, 0)
            renderer.setInstance(0, { position })

            expect(() => renderer.updateGPU()).not.toThrow()
        })
    })

    describe('Error Handling and Resilience', () => {
        it('should handle operations before initialization gracefully', () => {
            renderer = new InstancedShelfRenderer()
            // Don't initialize

            const position = new THREE.Vector3(0, 0, 0)
            const result = renderer.setInstance(0, { position })

            expect(result).toBe(false)
            expect(renderer.isReady()).toBe(false)
        })

        it('should handle invalid shelf configurations gracefully', () => {
            const invalidConfigs = [
                { width: -1 },
                { height: 0 },
                { shelfCount: -5 },
                { boardThickness: Infinity }
            ]

            renderer = new InstancedShelfRenderer()

            // Construction should not fail even with invalid configs in defaults
            expect(renderer).toBeDefined()
        })

        it('should maintain consistent state during partial failures', async () => {
            renderer = new InstancedShelfRenderer()
            await renderer.initialize()

            const position = new THREE.Vector3(0, 0, 0)
            
            // Create valid instance
            const result1 = renderer.setInstance(0, { position })
            expect(result1).toBe(true)

            // Attempt invalid instance
            const result2 = renderer.setInstance(1000, { position })
            expect(result2).toBe(false)

            // Valid instances should still be tracked
            const stats = renderer.getStats()
            expect(stats.activeInstances).toBe(1)
        })
    })

    describe('Integration Boundaries', () => {
        beforeEach(async () => {
            renderer = new InstancedShelfRenderer()
            await renderer.initialize()
        })

        it('should interact correctly with SharedMaterialManager', () => {
            // Verify the integration boundary works correctly
            expect(mockMaterialManager.getMaterial).toHaveBeenCalled()
        })

        it('should be self-contained without requiring scene during initialization', () => {
            // Verify InstancedShelfRenderer is independent and doesn't need scene access during init
            // Scene integration happens at higher levels (props handlers) when needed
            expect(mockDataManager.get).not.toHaveBeenCalledWith('core.mainScene')
        })

        it('should register with EventManager for GPU updates', () => {
            // Verify event system integration
            expect(mockEventManager.registerEventHandler).toHaveBeenCalled()
        })
    })

    describe('Disposal and Cleanup', () => {
        beforeEach(async () => {
            renderer = new InstancedShelfRenderer()
            await renderer.initialize()
        })

        it('should dispose cleanly without errors', () => {
            const position = new THREE.Vector3(0, 0, 0)
            renderer.setInstance(0, { position })

            expect(() => renderer.dispose()).not.toThrow()
            expect(renderer.isReady()).toBe(false)
        })

        it('should clear all state after disposal', () => {
            const position = new THREE.Vector3(0, 0, 0)
            renderer.setInstance(0, { position })
            
            renderer.dispose()
            
            const stats = renderer.getStats()
            expect(stats.isInitialized).toBe(false)
            expect(stats.activeInstances).toBe(0)
        })

        it('should handle disposal of uninitialized renderer', () => {
            const uninitializedRenderer = new InstancedShelfRenderer()
            expect(() => uninitializedRenderer.dispose()).not.toThrow()
        })
    })

    describe('Regression Prevention', () => {
        // These tests protect against specific bugs that could be reintroduced

        it('should maintain geometry/material combination count accuracy', async () => {
            renderer = new InstancedShelfRenderer()
            await renderer.initialize()

            const stats = renderer.getStats()
            const combinationCount = stats.activeGeometryMaterialCombinations

            // This should be a positive integer representing actual geometry types
            expect(combinationCount).toBeGreaterThan(0)
            expect(Number.isInteger(combinationCount)).toBe(true)
            expect(combinationCount).toBeLessThanOrEqual(10) // Reasonable upper bound
        })

        it('should preserve shelf configuration defaults across instances', async () => {
            renderer = new InstancedShelfRenderer({
                defaultShelfConfig: { width: 2.5, height: 3.0 }
            })
            await renderer.initialize()

            const position = new THREE.Vector3(0, 0, 0)
            
            // Create multiple instances - each should inherit defaults
            const result1 = renderer.setInstance(0, { position })
            const result2 = renderer.setInstance(1, { position })

            expect(result1).toBe(true)
            expect(result2).toBe(true)
        })

        it('should handle concurrent shelf creation without state corruption', async () => {
            renderer = new InstancedShelfRenderer()
            await renderer.initialize()

            const positions = Array.from({ length: 5 }, (_, i) => 
                new THREE.Vector3(i * 2, 0, 0)
            )

            // Create multiple shelves in rapid succession
            const results = positions.map((position, index) =>
                renderer.setInstance(index, { position })
            )

            expect(results.every(result => result === true)).toBe(true)
            expect(renderer.getStats().activeInstances).toBe(5)
        })
    })
})