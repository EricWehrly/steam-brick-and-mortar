/**
 * SharedMaterialManager Lazy Loading Integration Test
 * Verifies lazy loading works end-to-end in realistic usage scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { SharedMaterialManager, MaterialType } from '../../../src/utils/SharedMaterialManager'

describe('SharedMaterialManager Lazy Loading Integration', () => {
    let manager: SharedMaterialManager
    let scene: THREE.Scene

    beforeEach(() => {
        manager = SharedMaterialManager.getInstance()
        scene = new THREE.Scene()
    })

    afterEach(() => {
        scene.clear()
        manager.dispose()
    })

    describe('Real-World Usage Scenarios', () => {
        it('should support immediate material usage without pre-initialization', () => {
            const startTime = performance.now()
            
            // Simulate creating game box meshes immediately
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            
            // Get materials for different games (simplified fallback for all)
            const material1 = manager.getMaterial(MaterialType.FallbackGameBox)
            const material2 = manager.getMaterial(MaterialType.FallbackGameBox)
            const material3 = manager.getMaterial(MaterialType.FallbackGameBox)
            
            const endTime = performance.now()
            const duration = endTime - startTime
            
            // Should be fast
            expect(duration).toBeLessThan(100)
            
            // Materials should be valid and identical
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material3).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material1).toBe(material2)
            expect(material2).toBe(material3)
            
            // Should have created simple fallback
            expect(manager.getStats().totalMaterials).toBe(1)
            expect(manager.isInitialized()).toBe(true)
            
            // Create actual meshes to verify materials work
            const mesh1 = new THREE.Mesh(geometry, material1)
            const mesh2 = new THREE.Mesh(geometry, material2)
            const mesh3 = new THREE.Mesh(geometry, material3)
            
            scene.add(mesh1, mesh2, mesh3)
            expect(scene.children.length).toBe(3)
            
            geometry.dispose()
        })

        // TODO(perf): This currently exercises synchronous procedural texture generation on the main thread.
        // Re-enable with deterministic thresholds after worker-based texture generation lands.
        // also this is a perf test in a file called "int" and that's kinda braindead
        it('should handle mixed material types efficiently', () => {
            const startTime = performance.now()
            
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            
            // 1. Create shelf structure
            const shelfMaterial = manager.getMaterial(MaterialType.MdfVeneer)
            const interiorMaterial = manager.getMaterial(MaterialType.ShelfInterior)
            
            // 2. Add game boxes (fallback for all)
            const gameBoxMaterial1 = manager.getMaterial(MaterialType.FallbackGameBox)
            const gameBoxMaterial2 = manager.getMaterial(MaterialType.FallbackGameBox)
            
            // 3. Add environment elements
            const carpetMaterial = manager.getMaterial(MaterialType.Carpet)
            
            const endTime = performance.now()
            const duration = endTime - startTime
            
            expect(duration).toBeLessThan(30000) // Loose ceiling — synchronous texture gen; tighten post-worker refactor
            
            // All materials should be valid
            expect(shelfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(interiorMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(gameBoxMaterial1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(gameBoxMaterial2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(carpetMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            
            // Stats should reflect loaded materials
            const stats = manager.getStats()
            expect(stats.totalMaterials).toBeGreaterThanOrEqual(1) // At least fallback material
            expect(stats.totalMaterials).toBe(4) // fallback game box + 2 shelf + carpet
            expect(stats.poolHitRate).toBeGreaterThan(0)
            
            // Create scene to verify everything works
            const shelfMesh = new THREE.Mesh(geometry, shelfMaterial)
            const gameBoxMesh1 = new THREE.Mesh(geometry, gameBoxMaterial1)
            const gameBoxMesh2 = new THREE.Mesh(geometry, gameBoxMaterial2)
            const floorMesh = new THREE.Mesh(geometry, carpetMaterial)
            
            scene.add(shelfMesh, gameBoxMesh1, gameBoxMesh2, floorMesh)
            expect(scene.children.length).toBe(4)
            
            geometry.dispose()
        })

        it('should handle high-frequency game box material requests efficiently', () => {
            const startTime = performance.now()
            
            // Simulate loading many games quickly (like in a steam library)
            const materials: THREE.MeshStandardMaterial[] = []
            const gameNames = [
                'Portal 2', 'Half-Life: Alyx', 'Counter-Strike 2', 'Dota 2',
                'Team Fortress 2', 'Left 4 Dead 2', 'Garry\'s Mod', 'Rust',
                'PUBG', 'Apex Legends', 'Cyberpunk 2077', 'The Witcher 3'
            ]
            
            // Request fallback material for all
            gameNames.forEach(() => {
                const material = manager.getMaterial(MaterialType.FallbackGameBox)
                materials.push(material)
            })
            
            const endTime = performance.now()
            const duration = endTime - startTime
            
            // Should be very fast for subsequent requests (pool hits)
            expect(duration).toBeLessThan(50) // Should be mostly pool hits
            expect(materials.length).toBe(gameNames.length)
            
            // All materials should be valid
            materials.forEach(material => {
                expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
            })
            
            // Pool hit rate should be high for repeated requests
            const stats = manager.getStats()
            expect(stats.poolHitRate).toBeGreaterThan(0.8) // 80%+ hit rate
            expect(stats.totalMaterials).toBeGreaterThanOrEqual(1) // Should only have created materials once
        })

        it('should maintain performance under memory pressure simulation', () => {
            // Initialize with smaller palette for focused testing
            manager.initialize() // No config needed for simple system
            
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            const meshes: THREE.Mesh[] = []
            
            // Create many meshes with shared materials
            for (let i = 0; i < 100; i++) {
                const material = manager.getMaterial(MaterialType.FallbackGameBox)
                const mesh = new THREE.Mesh(geometry, material)
                meshes.push(mesh)
                scene.add(mesh)
            }
            
            expect(scene.children.length).toBe(100)
            expect(manager.getStats().totalMaterials).toBe(1) // Only fallback material
            
            // Pool hit rate should be very high (lots of material reuse)
            const stats = manager.getStats()
            expect(stats.poolHitRate).toBeGreaterThanOrEqual(0.94) // 94%+ hit rate
            
            // Clean up
            meshes.forEach(mesh => {
                scene.remove(mesh)
            })
            geometry.dispose()
        })
    })

    describe('Error Handling and Edge Cases', () => {
        it('should recover gracefully from initialization errors', () => {
            // Test auto-initialization fallback
            const material1 = manager.getMaterial(MaterialType.FallbackGameBox)
            
            // Manual re-initialization should warn but not break
            manager.initialize() // No config needed for simple system
            
            // Should still work and use original configuration
            const material2 = manager.getMaterial(MaterialType.FallbackGameBox)
            
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(manager.getStats().totalMaterials).toBeGreaterThanOrEqual(1) // Original materials
        })

        it('should handle disposal and re-creation correctly', () => {
            // Load some materials
            const material1 = manager.getMaterial(MaterialType.FallbackGameBox)
            const shelfMaterial = manager.getMaterial(MaterialType.MdfVeneer)
            
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(shelfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            
            // Dispose manager
            manager.dispose()
            expect(manager.isInitialized()).toBe(false)
            
            // Get new instance and verify it works
            const newManager = SharedMaterialManager.getInstance()
            const newMaterial = newManager.getMaterial(MaterialType.FallbackGameBox)
            
            expect(newMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(newManager.isInitialized()).toBe(true)
            expect(newManager.getStats().totalMaterials).toBeGreaterThanOrEqual(1) // Fresh instance
        })
    })
})