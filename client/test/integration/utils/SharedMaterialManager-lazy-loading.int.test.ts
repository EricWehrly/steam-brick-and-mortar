/**
 * SharedMaterialManager Lazy Loading Integration Test
 * Verifies lazy loading works end-to-end in realistic usage scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { SharedMaterialManager } from '../../../src/utils/SharedMaterialManager'

describe('SharedMaterialManager Lazy Loading Integration', () => {
    let manager: SharedMaterialManager
    let scene: THREE.Scene

    beforeEach(() => {
        // Reset singleton and create test scene
        SharedMaterialManager.reset()
        manager = SharedMaterialManager.getInstance()
        scene = new THREE.Scene()
    })

    afterEach(() => {
        // Clean up scene and manager
        scene.clear()
        manager.dispose()
    })

    describe('Real-World Usage Scenarios', () => {
        it('should support immediate material usage without pre-initialization', () => {
            const startTime = performance.now()
            
            // Simulate creating game box meshes immediately
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            
            // Get materials for different games (should trigger lazy loading)
            const material1 = manager.getGameBoxMaterialFromName('Game A')   // Simple fallback
            const material2 = manager.getGameBoxMaterialFromName('Game B')   // Same fallback
            const material3 = manager.getGameBoxMaterialFromName('Game C')   // Same fallback
            
            const endTime = performance.now()
            const duration = endTime - startTime
            
            // Should be fast (lazy loading should be < 100ms for palette creation)
            expect(duration).toBeLessThan(100)
            
            // Materials should be valid
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material3).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material1).toBe(material2)      // All use same fallback
            expect(material2).toBe(material3)      // All use same fallback
            
            // Should have created simple fallback
            expect(manager.getStats().gameBoxMaterialCount).toBe(1) // Just fallback material
            expect(manager.isInitialized()).toBe(true)
            
            // Create actual meshes to verify materials work
            const mesh1 = new THREE.Mesh(geometry, material1)
            const mesh2 = new THREE.Mesh(geometry, material2)
            const mesh3 = new THREE.Mesh(geometry, material3)
            
            scene.add(mesh1, mesh2, mesh3)
            expect(scene.children.length).toBe(3)
            
            geometry.dispose()
        })

        it('should handle mixed material types efficiently', () => {
            const startTime = performance.now()
            
            // Simulate real shelf spawning workflow
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            
            // 1. Create shelf structure
            const shelfMaterial = manager.getShelfMaterial('mdfVeneer')
            const interiorMaterial = manager.getShelfMaterial('shelfInterior')
            
            // 2. Add game boxes
            const gameBoxMaterial1 = manager.getGameBoxMaterialFromName('Game 1')
            const gameBoxMaterial2 = manager.getGameBoxMaterialFromName('Game 2')
            
            // 3. Add environment elements
            const carpetMaterial = manager.getCarpetMaterial()
            
            const endTime = performance.now()
            const duration = endTime - startTime
            
            // Should be reasonable even with multiple material types including texture generation
            expect(duration).toBeLessThan(5000) // Allow up to 5 seconds for texture generation
            
            // All materials should be valid
            expect(shelfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(interiorMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(gameBoxMaterial1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(gameBoxMaterial2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(carpetMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            
            // Stats should reflect loaded materials
            const stats = manager.getStats()
            expect(stats.gameBoxMaterialCount).toBe(12) // Default palette
            expect(stats.totalMaterials).toBe(15) // 12 game box + 2 shelf + 1 carpet
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
            
            // Request materials for all games
            gameNames.forEach(gameName => {
                const material = manager.getGameBoxMaterialFromName(gameName)
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
            expect(stats.gameBoxMaterialCount).toBe(12) // Should only have created palette once
        })

        it('should maintain performance under memory pressure simulation', () => {
            // Initialize with smaller palette for focused testing
            manager.initialize() // No config needed for simple system
            
            const geometry = new THREE.BoxGeometry(1, 1, 1)
            const meshes: THREE.Mesh[] = []
            
            // Create many meshes with shared materials
            for (let i = 0; i < 100; i++) {
                const hue = (i * 60) % 360 // Cycle through hues
                const material = manager.getGameBoxMaterialFromName(`Game ${hue}`)
                const mesh = new THREE.Mesh(geometry, material)
                meshes.push(mesh)
                scene.add(mesh)
            }
            
            expect(scene.children.length).toBe(100)
            expect(manager.getStats().gameBoxMaterialCount).toBe(6) // Only 6 unique materials
            
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
            const material1 = manager.getGameBoxMaterialFromName('Game 1')
            
            // Manual re-initialization should warn but not break
            manager.initialize() // No config needed for simple system
            
            // Should still work and use original configuration
            const material2 = manager.getGameBoxMaterialFromName('Game 2')
            
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(material2).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(manager.getStats().gameBoxMaterialCount).toBe(12) // Original default
        })

        it('should handle disposal and re-creation correctly', () => {
            // Load some materials
            const material1 = manager.getGameBoxMaterialFromName('Game Test')
            const shelfMaterial = manager.getShelfMaterial('mdfVeneer')
            
            expect(material1).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(shelfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            
            // Dispose manager
            manager.dispose()
            expect(manager.isInitialized()).toBe(false)
            
            // Get new instance and verify it works
            const newManager = SharedMaterialManager.getInstance()
            const newMaterial = newManager.getGameBoxMaterialFromName('New Game')
            
            expect(newMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
            expect(newManager.isInitialized()).toBe(true)
            expect(newManager.getStats().gameBoxMaterialCount).toBe(12) // Fresh instance
        })
    })
})