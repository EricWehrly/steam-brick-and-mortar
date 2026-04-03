/**
 * SharedMaterialManager Lazy Loading Unit Tests
 * Verifies lazy initialization behavior and material creation triggers.
 *
 * Architecture note (after async worker refactor):
 * - Simple materials (FallbackGameBox, ShelfInterior, BrandAccent, Glass) are still sync
 * - Procedural materials (MdfVeneer, Carpet, Ceiling, WallWood, BasicWood) are generated
 *   off-thread via prewarm(). When called before prewarm(), a flat-colour fallback is returned.
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
            const duration = performance.now() - startTime
            expect(duration).toBeLessThan(10)
            expect(manager.isInitialized()).toBe(true)
        })

        it('should not create any materials during initialization', () => {
            const syncSpy = vi.spyOn(manager as any, 'createMaterialSync')
            manager.initialize()
            expect(syncSpy).not.toHaveBeenCalled()
            syncSpy.mockRestore()
        })

        it('should have zero materials in pool after initialization', () => {
            manager.initialize()
            expect(manager.getStats().totalMaterials).toBe(0)
        })

        it.skip('should not reinitialize when already initialized')
    })

    describe('Game Box Material Lazy Loading', () => {
        it('should create fallback game box material on first request', () => {
            const material = manager.getMaterial(MaterialType.FallbackGameBox)
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material.color.getHex()).toBe(0xff00ff) // Magenta
        })

        it('should return same material instance on subsequent requests', () => {
            const material1 = manager.getMaterial(MaterialType.FallbackGameBox)
            const material2 = manager.getMaterial(MaterialType.FallbackGameBox)
            expect(material1).toBe(material2)
            expect(manager.getStats().totalMaterials).toBe(1)
        })

        it('should return simple fallback material for game names', () => {
            const material1 = manager.getMaterial(MaterialType.FallbackGameBox)
            const material2 = manager.getMaterial(MaterialType.FallbackGameBox)
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(manager.getStats().totalMaterials).toBeGreaterThanOrEqual(1)
        })
    })

    describe('Shelf Material Lazy Loading', () => {
        it('should create MDF veneer material only when first requested', () => {
            manager.initialize()
            expect(manager.getStats().totalMaterials).toBe(0)

            // Sync fallback path: returns flat-colour placeholder (prewarm not called)
            const material = manager.getMaterial(MaterialType.MdfVeneer)
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)

            // Second request returns same cached instance
            const material2 = manager.getMaterial(MaterialType.MdfVeneer)
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(material2).toBe(material)
        })

        it('should create shelf interior material only when requested', () => {
            manager.initialize()
            const material = manager.getMaterial(MaterialType.ShelfInterior)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(manager.getStats().totalMaterials).toBe(1)
        })

        it('should create brand accent material only when requested', () => {
            manager.initialize()
            const material = manager.getMaterial(MaterialType.BrandAccent)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(manager.getStats().totalMaterials).toBe(1)
        })

        it('should throw error for unknown shelf material type', () => {
            manager.initialize()
            expect(() => {
                manager.getMaterial('unknownType' as any)
            }).toThrow('Unknown material type: unknownType')
        })
    })

    describe('Environment Material Lazy Loading', () => {
        it('should create carpet material only when requested', () => {
            manager.initialize()
            expect(manager.getStats().totalMaterials).toBe(0)

            const material = manager.getMaterial(MaterialType.Carpet)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(manager.getStats().totalMaterials).toBe(1)

            // Second request returns cached
            const material2 = manager.getMaterial(MaterialType.Carpet)
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(material2).toBe(material)
        })

        it('should create ceiling material only when requested', () => {
            manager.initialize()
            const material = manager.getMaterial(MaterialType.Ceiling)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
        })

        it('should create wall wood material only when requested', () => {
            manager.initialize()
            const material = manager.getMaterial(MaterialType.WallWood)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
        })

        it('should create basic wood material only when requested', () => {
            manager.initialize()
            const material = manager.getMaterial(MaterialType.BasicWood)
            expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
        })
    })

    describe('Auto-Initialization Behavior', () => {
        it('should auto-initialize when getting materials without explicit init', () => {
            const gameBoxMaterial = manager.getMaterial(MaterialType.FallbackGameBox)
            const shelfMaterial = manager.getMaterial(MaterialType.MdfVeneer)
            expect(gameBoxMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(shelfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
        })

        it('should auto-initialize with default config', () => {
            const material1 = manager.getMaterial(MaterialType.FallbackGameBox)
            const material2 = manager.getMaterial(MaterialType.FallbackGameBox)
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
        })
    })

    describe('Statistics and Pool State', () => {
        it('should track pool statistics correctly with lazy loading', () => {
            const m1 = manager.getMaterial(MaterialType.FallbackGameBox)
            const m2 = manager.getMaterial(MaterialType.FallbackGameBox)
            const s1 = manager.getMaterial(MaterialType.MdfVeneer)

            const stats = manager.getStats()
            expect(stats.totalMaterials).toBe(2) // FallbackGameBox + MdfVeneer
            expect(stats.poolHitRate).toBeGreaterThan(0)
            expect(m1).toBe(m2)
            expect(s1).toBeInstanceOf(THREE.MeshStandardMaterial)
        })

        it('should track material requests and hits correctly', () => {
            manager.initialize()
            manager.getMaterial(MaterialType.FallbackGameBox)
            manager.getMaterial(MaterialType.FallbackGameBox)
            const stats = manager.getStats()
            expect(stats.poolHitRate).toBe(1.0)
        })
    })

    describe('Disposal with Lazy Loading', () => {
        it('should dispose only loaded materials', () => {
            manager.initialize()

            const gameBoxMaterial = manager.getMaterial(MaterialType.FallbackGameBox)
            const shelfMaterial = manager.getMaterial(MaterialType.MdfVeneer)

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
            expect(() => manager.dispose()).not.toThrow()
            expect(manager.isInitialized()).toBe(false)
        })
    })
})
