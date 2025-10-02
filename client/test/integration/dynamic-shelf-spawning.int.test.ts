/**
 * Integration test for dynamic shelf spawning functionality
 * Verifies that shelves are properly created and added to the scene
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { StorePropsRenderer } from '../../src/scene/StorePropsRenderer'

describe('Dynamic Shelf Spawning Integration', () => {
    let scene: THREE.Scene
    let propsRenderer: StorePropsRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        propsRenderer = new StorePropsRenderer(scene)
    })

    it('should spawn dynamic shelves and add them to scene', async () => {
        // Given: We need shelves for 12 games
        const gameCount = 12
        const expectedShelvesNeeded = 2 // Math.ceil(12 / 6) = 2 shelves

        // Track initial scene children count
        const initialChildCount = scene.children.length
        console.debug(`🔍 Initial scene children count: ${initialChildCount}`)

        // When: We spawn dynamic shelves
        await propsRenderer.spawnDynamicShelvesWithGames(expectedShelvesNeeded, gameCount)

        // Then: Scene should have additional children for the shelves
        const finalChildCount = scene.children.length
        console.debug(`🔍 Final scene children count: ${finalChildCount}`)
        console.debug(`🏷️ Scene children names:`, scene.children.map(child => child.name))

        // Should have added shelf rows to the scene
        expect(finalChildCount).toBeGreaterThan(initialChildCount)

        // Should have shelf-row objects in the scene
        const shelfRows = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        )
        console.debug(`📚 Found ${shelfRows.length} shelf rows in scene`)
        
        expect(shelfRows.length).toBeGreaterThan(0)

        // Each shelf row should contain shelf units
        let totalShelfUnits = 0
        shelfRows.forEach((row, index) => {
            const shelves = row.children.filter(child => 
                child.name?.includes('dynamic-shelf')
            )
            console.debug(`📚 Shelf row ${index} contains ${shelves.length} shelf units`)
            totalShelfUnits += shelves.length
            
            expect(shelves.length).toBeGreaterThan(0)
        })

        expect(totalShelfUnits).toBe(expectedShelvesNeeded)
        console.debug(`✅ Successfully spawned ${totalShelfUnits} shelf units`)
    })

    it('should create shelves with proper positioning', async () => {
        // Given: We need 1 shelf for testing
        const shelvesNeeded = 1
        const gameCount = 6

        // When: We spawn dynamic shelves
        await propsRenderer.spawnDynamicShelvesWithGames(shelvesNeeded, gameCount)

        // Then: Shelf should be positioned correctly
        const shelfRows = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        )
        
        expect(shelfRows.length).toBe(1)
        
        const shelfRow = shelfRows[0] as THREE.Group
        const shelves = shelfRow.children.filter(child => 
            child.name?.includes('dynamic-shelf')
        )
        
        expect(shelves.length).toBe(1)
        
        const shelf = shelves[0] as THREE.Group
        console.debug(`📍 Shelf position:`, shelf.position)
        
        // Should have reasonable positioning (not at origin due to layout)
        expect(shelf.position.z).toBeLessThan(0) // Should be behind origin (negative Z)
    })

    it('should clear existing shelves before spawning new ones', async () => {
        // Given: We spawn some initial shelves
        await propsRenderer.spawnDynamicShelvesWithGames(1, 6)
        const initialShelfCount = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        ).length
        
        // When: We spawn different number of shelves
        await propsRenderer.spawnDynamicShelvesWithGames(3, 18)
        
        // Then: Should have new shelf configuration, not added to old
        const finalShelfRows = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        )
        
        // Should have 2 rows now (Math.ceil(3/4) = 1 row, but 3 shelves means 1 row with 3 shelves)
        expect(finalShelfRows.length).toBeGreaterThan(0)
        
        let totalShelves = 0
        finalShelfRows.forEach(row => {
            totalShelves += row.children.filter(child => 
                child.name?.includes('dynamic-shelf')
            ).length
        })
        
        expect(totalShelves).toBe(3) // Should have exactly the new number of shelves
        console.debug(`✅ Successfully cleared old shelves and created ${totalShelves} new ones`)
    })

    it('should spawn game boxes with names when game data is provided', async () => {
        // Given: We have mock game data
        const mockGames = [
            { name: 'Portal 2', appid: 620 },
            { name: 'Half-Life: Alyx', appid: 546560 },
            { name: 'Counter-Strike 2', appid: 730 },
            { name: 'Team Fortress 2', appid: 440 },
            { name: 'Left 4 Dead 2', appid: 550 },
            { name: 'Dota 2', appid: 570 }
        ]

        // When: We spawn shelves with game data
        await propsRenderer.spawnDynamicShelvesWithGames(1, mockGames.length, mockGames)

        // Then: Should create game boxes with game names
        const shelfRows = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        )
        
        expect(shelfRows.length).toBe(1)
        
        const shelfRow = shelfRows[0] as THREE.Group
        const shelves = shelfRow.children.filter(child => 
            child.name?.includes('dynamic-shelf')
        ) as THREE.Group[]
        
        expect(shelves.length).toBe(1)
        
        // Check for game boxes in the shelf
        const shelf = shelves[0]
        const gameBoxes = shelf.children.filter(child => 
            child.name?.includes('game-') && child instanceof THREE.Mesh
        )
        
        console.debug(`🎮 Found ${gameBoxes.length} game boxes in dynamic shelf`)
        console.debug(`🏷️ Game box names:`, gameBoxes.map(box => box.name))
        
        // Should have created game boxes for the provided games
        expect(gameBoxes.length).toBeGreaterThan(0)
    })
})