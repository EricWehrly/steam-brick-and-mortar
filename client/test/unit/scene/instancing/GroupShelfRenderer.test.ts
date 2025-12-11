/**
 * Unit Tests for GroupShelfRenderer - Group-based Shelf Rendering
 * 
 * Tests the simplified shelf renderer that uses THREE.Group cloning
 * instead of 4 separate InstancedMeshManagers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { GroupShelfRenderer, type GroupShelfConfig } from '../../../../src/scene/instancing/GroupShelfRenderer'
import { SharedMaterialManager, MaterialType } from '../../../../src/utils/SharedMaterialManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { EventManager } from '../../../../src/core/EventManager'

// Mock dependencies to isolate unit under test
vi.mock('../../../../src/utils/SharedMaterialManager')
vi.mock('../../../../src/core/data/DataManager')
vi.mock('../../../../src/core/EventManager')

describe('GroupShelfRenderer', () => {
    let renderer: GroupShelfRenderer
    let mockScene: THREE.Scene
    let mockMaterialManager: any
    let mockDataManager: any
    let mockEventManager: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockScene = new THREE.Scene()

        mockMaterialManager = {
            getMaterial: vi.fn().mockReturnValue(new THREE.MeshBasicMaterial()),
            getInstance: vi.fn().mockReturnThis()
        }
        vi.mocked(SharedMaterialManager.getInstance).mockReturnValue(mockMaterialManager)

        mockDataManager = {
            get: vi.fn().mockReturnValue(mockScene)
        }
        vi.mocked(DataManager.getInstance).mockReturnValue(mockDataManager)

        mockEventManager = {
            registerEventHandler: vi.fn(),
            emit: vi.fn()
        }
        vi.mocked(EventManager.getInstance).mockReturnValue(mockEventManager)
    })

    afterEach(() => {
        if (renderer) {
            renderer.dispose()
        }
    })

    describe('Construction and Configuration', () => {
        it('should construct with default configuration', () => {
            renderer = new GroupShelfRenderer()

            expect(renderer).toBeDefined()
            expect(renderer.isReady()).toBe(false)
        })

        it('should apply custom configuration', () => {
            const customConfig: GroupShelfConfig = {
                maxShelfUnits: 50,
                defaultShelfConfig: {
                    width: 3.0,
                    height: 2.5,
                    depth: 0.8,
                    shelfCount: 4
                }
            }

            renderer = new GroupShelfRenderer(customConfig)
            
            expect(() => renderer.initialize()).not.toThrow()
        })

        it('should register for GPU update events during construction', () => {
            renderer = new GroupShelfRenderer()

            expect(mockEventManager.registerEventHandler).toHaveBeenCalled()
        })
    })

    describe('Initialization', () => {
        beforeEach(() => {
            renderer = new GroupShelfRenderer()
        })

        it('should initialize successfully', async () => {
            await expect(renderer.initialize()).resolves.not.toThrow()
            expect(renderer.isReady()).toBe(true)
        })

        it('should handle double initialization gracefully', async () => {
            await renderer.initialize()
            await expect(renderer.initialize()).resolves.not.toThrow()
            expect(renderer.isReady()).toBe(true)
        })

        it('should fail when materials are unavailable', async () => {
            mockMaterialManager.getMaterial.mockImplementation(() => {
                throw new Error('Material not found')
            })

            await expect(renderer.initialize()).rejects.toThrow()
            expect(renderer.isReady()).toBe(false)
        })
    })

    describe('Shelf Instance Management', () => {
        beforeEach(async () => {
            renderer = new GroupShelfRenderer()
            await renderer.initialize()
        })

        it('should create shelf instances at valid indices', () => {
            const position = new THREE.Vector3(0, 0, 0)
            const result = renderer.setInstance(0, { position })

            expect(result).toBe(true)
        })

        it('should reject indices exceeding max', () => {
            const config: GroupShelfConfig = { maxShelfUnits: 5 }
            renderer.dispose()
            renderer = new GroupShelfRenderer(config)
            renderer.initialize()

            const position = new THREE.Vector3(0, 0, 0)
            const result = renderer.setInstance(10, { position })

            expect(result).toBe(false)
        })

        it('should create multiple shelf instances', async () => {
            const positions = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(5, 0, 0),
                new THREE.Vector3(10, 0, 0)
            ]

            for (let i = 0; i < positions.length; i++) {
                const result = renderer.setInstance(i, { position: positions[i] })
                expect(result).toBe(true)
            }

            const stats = renderer.getStats()
            expect(stats.activeInstances).toBe(3)
        })

        it('should replace existing shelf at same index', async () => {
            const pos1 = new THREE.Vector3(0, 0, 0)
            const pos2 = new THREE.Vector3(5, 0, 0)

            renderer.setInstance(0, { position: pos1 })
            renderer.setInstance(0, { position: pos2 })

            const stats = renderer.getStats()
            expect(stats.activeInstances).toBe(1)
        })
    })

    describe('Statistics', () => {
        beforeEach(async () => {
            renderer = new GroupShelfRenderer()
            await renderer.initialize()
        })

        it('should return correct stats after initialization', () => {
            const stats = renderer.getStats()

            expect(stats.isInitialized).toBe(true)
            expect(stats.activeInstances).toBe(0)
            expect(stats.activeGeometryMaterialCombinations).toBe(3) // 3 materials
        })

        it('should update activeInstances as shelves are added', () => {
            renderer.setInstance(0, { position: new THREE.Vector3(0, 0, 0) })
            renderer.setInstance(1, { position: new THREE.Vector3(5, 0, 0) })

            const stats = renderer.getStats()
            expect(stats.activeInstances).toBe(2)
        })
    })

    describe('Reset and Disposal', () => {
        beforeEach(async () => {
            renderer = new GroupShelfRenderer()
            await renderer.initialize()
        })

        it('should clear all shelves on reset', () => {
            renderer.setInstance(0, { position: new THREE.Vector3(0, 0, 0) })
            renderer.setInstance(1, { position: new THREE.Vector3(5, 0, 0) })
            
            renderer.reset()

            const stats = renderer.getStats()
            expect(stats.activeInstances).toBe(0)
        })

        it('should dispose cleanly', () => {
            renderer.setInstance(0, { position: new THREE.Vector3(0, 0, 0) })
            
            renderer.dispose()

            expect(renderer.isReady()).toBe(false)
            const stats = renderer.getStats()
            expect(stats.isInitialized).toBe(false)
        })
    })
})
