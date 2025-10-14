/**
 * SharedMaterialManager Lazy Loading Unit Tests
 * Verifies lazy initialization behavior and material creation triggers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { SharedMaterialManager, MaterialType } from '../../../src/utils/SharedMaterialManager'

describe('SharedMaterialManager Lazy Loading', () => {
    let manager: SharedMaterialManager

    beforeEach(() => {
        manager = SharedMaterialManager.getInstance()
    })

    afterEach(() => {
        manager.dispose()
    })

    describe('Initialization Behavior', () => {
        it('should initialize instantly with empty material pool', () => {
            const startTime = performance.now()
            
            manager.initialize()
            
            const endTime = performance.now()
            const duration = endTime - startTime
            
            // Should be near-instant (less than 10ms)
            expect(duration).toBeLessThan(10)
            expect(manager.isInitialized()).toBe(true)
        })

        it('should not create any materials during initialization', () => {
            // Spy on material generator methods
            const woodSpy = vi.spyOn(manager as any, 'createMDFVeneerMaterial')
            const carpetSpy = vi.spyOn(manager as any, 'createCarpetMaterial')
            const ceilingSpy = vi.spyOn(manager as any, 'createCeilingMaterial')

            manager.initialize()

            // No materials should be created during initialization
            expect(woodSpy).not.toHaveBeenCalled()
            expect(carpetSpy).not.toHaveBeenCalled()
            expect(ceilingSpy).not.toHaveBeenCalled()

            woodSpy.mockRestore()
            carpetSpy.mockRestore()
            ceilingSpy.mockRestore()
        })

        it('should store game box config for lazy palette creation', () => {
            const config = {
                hueSteps: 8,
                saturation: 0.8,
                lightness: 0.6,
                roughness: 0.5,
                metalness: 0.2
            }

            manager.initialize() // No config needed for simple system

            // Should store config internally without creating palette
            const stats = manager.getStats()
            expect(stats.totalMaterials).toBe(0) // No materials created yet
        })

        it('should warn on multiple initialization attempts', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

            manager.initialize()
            manager.initialize() // Second call

            expect(consoleSpy).toHaveBeenCalledWith('⚠️ SharedMaterialManager already initialized')
            
            consoleSpy.mockRestore()
        })
    })

    describe('Game Box Material Lazy Loading', () => {
        it('should create fallback game box material on first request', () => {
            const material = manager.getGameBoxFallbackMaterial()
            
            // Should create just the fallback material
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material.color.getHex()).toBe(0xff00ff) // Magenta
        })

        it('should return same material instance on subsequent requests', () => {
            const material1 = manager.getGameBoxFallbackMaterial()
            const material2 = manager.getGameBoxFallbackMaterial()

            // Should reuse same instance regardless of game name
            expect(material1).toBe(material2)
            expect(manager.getStats().totalMaterials).toBe(1)
        })

        it('should return simple fallback material for game names', () => {
            const material1 = manager.getGameBoxFallbackMaterial()
            const material2 = manager.getGameBoxFallbackMaterial()

            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(manager.getStats().totalMaterials).toBeGreaterThanOrEqual(1)
        })
    })

    describe('Shelf Material Lazy Loading', () => {
        it('should create MDF veneer material only when first requested', () => {
            const createSpy = vi.spyOn(manager as any, 'createMDFVeneerMaterial').mockReturnValue(
                new THREE.MeshStandardMaterial()
            )

            manager.initialize()

            // Should not create material during initialization
            expect(createSpy).not.toHaveBeenCalled()

            // Should create material on first request
            const material = manager.getShelfMaterial(MaterialType.MdfVeneer)
            expect(createSpy).toHaveBeenCalledTimes(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            // Should not create again on second request
            const material2 = manager.getShelfMaterial(MaterialType.MdfVeneer)
            expect(createSpy).toHaveBeenCalledTimes(1) // Still only called once
            expect(material2).toBe(material) // Same instance

            createSpy.mockRestore()
        })

        it('should create shelf interior material only when requested', () => {
            const createSpy = vi.spyOn(manager as any, 'createShelfInteriorMaterial').mockReturnValue(
                new THREE.MeshStandardMaterial()
            )

            manager.initialize()

            const material = manager.getShelfMaterial(MaterialType.ShelfInterior)
            expect(createSpy).toHaveBeenCalledTimes(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            createSpy.mockRestore()
        })

        it('should create brand accent material only when requested', () => {
            const createSpy = vi.spyOn(manager as any, 'createBrandAccentMaterial').mockReturnValue(
                new THREE.MeshStandardMaterial()
            )

            manager.initialize()

            const material = manager.getShelfMaterial(MaterialType.BrandAccent)
            expect(createSpy).toHaveBeenCalledTimes(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            createSpy.mockRestore()
        })

        it('should throw error for unknown shelf material type', () => {
            manager.initialize()

            expect(() => {
                manager.getShelfMaterial('unknownType' as any)
            }).toThrow('Unknown material type: unknownType')
        })
    })

    describe('Environment Material Lazy Loading', () => {
        it('should create carpet material only when requested', () => {
            const createSpy = vi.spyOn(manager as any, 'createCarpetMaterial').mockReturnValue(
                new THREE.MeshStandardMaterial()
            )

            manager.initialize()

            expect(createSpy).not.toHaveBeenCalled()

            const material = manager.getCarpetMaterial()
            expect(createSpy).toHaveBeenCalledTimes(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            // Second request should return cached material
            const material2 = manager.getCarpetMaterial()
            expect(createSpy).toHaveBeenCalledTimes(1) // Still only called once
            expect(material2).toBe(material)

            createSpy.mockRestore()
        })

        it('should create ceiling material only when requested', () => {
            const createSpy = vi.spyOn(manager as any, 'createCeilingMaterial').mockReturnValue(
                new THREE.MeshStandardMaterial()
            )

            manager.initialize()

            const material = manager.getCeilingMaterial()
            expect(createSpy).toHaveBeenCalledTimes(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            createSpy.mockRestore()
        })

        it('should create wall wood material only when requested', () => {
            const createSpy = vi.spyOn(manager as any, 'createWallWoodMaterial').mockReturnValue(
                new THREE.MeshStandardMaterial()
            )

            manager.initialize()

            const material = manager.getWallWoodMaterial()
            expect(createSpy).toHaveBeenCalledTimes(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            createSpy.mockRestore()
        })

        it('should create basic wood material only when requested', () => {
            const createSpy = vi.spyOn(manager as any, 'createBasicWoodMaterial').mockReturnValue(
                new THREE.MeshStandardMaterial()
            )

            manager.initialize()

            const material = manager.getBasicWoodMaterial()
            expect(createSpy).toHaveBeenCalledTimes(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            createSpy.mockRestore()
        })
    })

    describe('Auto-Initialization Behavior', () => {
        it('should auto-initialize when getting materials without explicit init', () => {
            const gameBoxMaterial = manager.getGameBoxFallbackMaterial()
            const shelfMaterial = manager.getShelfMaterial(MaterialType.MdfVeneer)

            expect(gameBoxMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(shelfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
        })

        it('should auto-initialize with default config', () => {
            const material1 = manager.getGameBoxFallbackMaterial()
            const material2 = manager.getGameBoxFallbackMaterial()
            
            // Should use simple fallback material
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
        })
    })

    describe('Statistics and Pool State', () => {
        it('should track pool statistics correctly with lazy loading', () => {
            // Request materials
            const m1 = manager.getGameBoxFallbackMaterial()
            const m2 = manager.getGameBoxFallbackMaterial()
            const s1 = manager.getShelfMaterial(MaterialType.MdfVeneer)

            const stats = manager.getStats()
            expect(stats.totalMaterials).toBe(2)
            expect(stats.poolHitRate).toBeGreaterThan(0)
            expect(m1).toBe(m2)
            expect(s1).toBeInstanceOf(THREE.MeshStandardMaterial)
        })

        it('should track material requests and hits correctly', () => {
            manager.initialize()

            // Request same material multiple times
            manager.getGameBoxFallbackMaterial()
            manager.getGameBoxFallbackMaterial()
            
            const stats = manager.getStats()
            expect(stats.poolHitRate).toBe(1.0) // 100% hit rate for same material
        })
    })

    describe('Disposal with Lazy Loading', () => {
        it('should dispose only loaded materials', () => {
            manager.initialize()

            // Load some materials but not others
            const gameBoxMaterial = manager.getGameBoxFallbackMaterial()
            const shelfMaterial = manager.getShelfMaterial(MaterialType.MdfVeneer)
            // Don't load carpet material

            const gameBoxDisposeSpy = vi.spyOn(gameBoxMaterial, 'dispose')
            const shelfDisposeSpy = vi.spyOn(shelfMaterial, 'dispose')

            manager.dispose()

            expect(gameBoxDisposeSpy).toHaveBeenCalled()
            expect(shelfDisposeSpy).toHaveBeenCalled()
            expect(manager.isInitialized()).toBe(false)

            gameBoxDisposeSpy.mockRestore()
            shelfDisposeSpy.mockRestore()
        })

        it('should handle disposal of unloaded materials gracefully', () => {
            manager.initialize()
            // Don't load any materials

            expect(() => {
                manager.dispose()
            }).not.toThrow()

            expect(manager.isInitialized()).toBe(false)
        })
    })
})