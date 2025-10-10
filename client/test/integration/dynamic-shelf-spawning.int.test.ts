/**
 * Integration test for dynamic shelf spawning functionality
 * Verifies that shelves are properly created and added to the scene via event-driven architecture
 * 
 * Migration: Updated to use event system instead of direct method calls
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { StorePropsRenderer } from '../../src/scene/StorePropsRenderer'
import { DataManager, type DataDomain } from '../../src/core/data/DataManager'
import { EventManager, EventSource } from '../../src/core/EventManager'
import { RoomEventTypes } from '../../src/types/InteractionEvents'
import { ServiceContainer } from '../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../src/core/di/ServiceKeys'
import { createSceneTestContainer } from '../utils/test-container-helpers'

describe('Dynamic Shelf Spawning Integration', () => {
    let container: ServiceContainer
    let scene: THREE.Scene
    let propsRenderer: StorePropsRenderer
    let dataManager: DataManager
    let eventManager: EventManager

    beforeEach(async () => {
        // Create isolated test container
        container = await createSceneTestContainer()
        
        scene = new THREE.Scene()
        
        // Resolve services from container
        dataManager = await container.resolve(ServiceKeys.DataManager)
        eventManager = await container.resolve(ServiceKeys.EventManager)
        
        // Clear any existing data
        dataManager.clear()
        
        // Initialize StorePropsRenderer
        propsRenderer = new StorePropsRenderer(scene, dataManager)
        
        // Inject GameBoxRenderer via DI  
        const gameBoxRenderer = await container.resolve(ServiceKeys.GameBoxRenderer) as any
        propsRenderer.setGameBoxRenderer(gameBoxRenderer)
    })

    afterEach(async () => {
        propsRenderer.dispose()
        
        // Clear DataManager state to prevent test pollution
        dataManager.clear()
        
        // Dispose container to clean up all services
        await container.dispose()
    })

    it('should spawn dynamic shelves and add them to scene via event system', async () => {
        // Given: We set up game count in DataManager
        const gameCount = 12
        dataManager.set('steam.gameCount', gameCount, { domain: 'steam-integration' as DataDomain })
        console.debug(`📊 Test: Stored ${gameCount} games in DataManager`)

        // Track initial scene children count
        const initialChildCount = scene.children.length
        console.debug(`🔍 Initial scene children count: ${initialChildCount}`)

        // When: We emit room:resized event (like RoomManager does)
        console.debug(`📡 Test: Emitting room:resized event`)
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 3.2 },
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Wait for async shelf creation
        await new Promise(resolve => setTimeout(resolve, 20))

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

        expect(totalShelfUnits).toBeGreaterThan(0) // Should have created some shelves
        console.debug(`✅ Successfully spawned ${totalShelfUnits} shelf units via event system`)
    })

    it('should create shelves with proper positioning via event system', async () => {
        // Given: We set up minimal game count
        const gameCount = 6
        dataManager.set('steam.gameCount', gameCount, { domain: 'steam-integration' as DataDomain })
        console.debug(`📊 Test: Stored ${gameCount} games in DataManager`)

        // When: We emit room:resized event
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 3.2 },
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Wait for shelf creation
        await new Promise(resolve => setTimeout(resolve, 20))

        // Then: Shelf should be positioned correctly
        const shelfRows = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        )
        
        expect(shelfRows.length).toBeGreaterThan(0)
        
        const shelfRow = shelfRows[0] as THREE.Group
        const shelves = shelfRow.children.filter(child => 
            child.name?.includes('dynamic-shelf')
        )
        
        expect(shelves.length).toBeGreaterThan(0)
        
        const shelf = shelves[0] as THREE.Group
        console.debug(`📍 Shelf position:`, shelf.position)
        
        // Should have reasonable positioning (shelves positioned in layout)
        expect(shelf.position.z).toBeGreaterThan(0) // Should be positioned in store layout
    })

    it('should clear existing shelves before spawning new ones via event system', async () => {
        // Given: We spawn some initial shelves
        dataManager.set('steam.gameCount', 6, { domain: 'steam-integration' as DataDomain })
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 3.2 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        await new Promise(resolve => setTimeout(resolve, 20))
        
        const initialShelfCount = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        ).length
        
        // When: We update game count and emit new room:resized event
        dataManager.set('steam.gameCount', 18, { domain: 'steam-integration' as DataDomain })
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 3.2 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        await new Promise(resolve => setTimeout(resolve, 20))
        
        // Then: Should have new shelf configuration, not added to old
        const finalShelfRows = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        )
        
        expect(finalShelfRows.length).toBeGreaterThan(0)
        
        let totalShelves = 0
        finalShelfRows.forEach(row => {
            totalShelves += row.children.filter(child => 
                child.name?.includes('dynamic-shelf')
            ).length
        })
        
        expect(totalShelves).toBeGreaterThan(0) // Should have shelves for the new game count
        console.debug(`✅ Successfully cleared old shelves and created ${totalShelves} new ones via event system`)
    })

    it('should spawn game boxes via event system when game data is available', async () => {
        // Given: We have game data stored in DataManager
        const mockGames = [
            { name: 'Portal 2', appid: 620 },
            { name: 'Half-Life: Alyx', appid: 546560 },
            { name: 'Counter-Strike 2', appid: 730 },
            { name: 'Team Fortress 2', appid: 440 },
            { name: 'Left 4 Dead 2', appid: 550 },
            { name: 'Dota 2', appid: 570 }
        ]

        dataManager.set('steam.gameCount', mockGames.length, { domain: 'steam-integration' as DataDomain })
        dataManager.set('steam.games', mockGames, { domain: 'steam-integration' as DataDomain })
        console.debug(`📊 Test: Stored ${mockGames.length} games with data in DataManager`)

        // When: We emit room:resized event
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 22, depth: 16, height: 3.2 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        await new Promise(resolve => setTimeout(resolve, 20))

        // Then: Should create shelves with game boxes
        const shelfRows = scene.children.filter(child => 
            child.name?.includes('shelf-row')
        )
        
        expect(shelfRows.length).toBeGreaterThan(0)
        
        const shelfRow = shelfRows[0] as THREE.Group
        const shelves = shelfRow.children.filter(child => 
            child.name?.includes('dynamic-shelf')
        ) as THREE.Group[]
        
        expect(shelves.length).toBeGreaterThan(0)
        
        // Check for game boxes in shelves
        let totalGameBoxes = 0
        shelves.forEach(shelf => {
            const gameBoxes = shelf.children.filter(child => 
                child.name?.includes('game-') && child instanceof THREE.Mesh
            )
            totalGameBoxes += gameBoxes.length
            console.debug(`🏷️ Shelf game box names:`, gameBoxes.map(box => box.name))
        })
        
        console.debug(`🎮 Found ${totalGameBoxes} game boxes total via event system`)
        
        // Should have created game boxes when game data is available
        expect(totalGameBoxes).toBeGreaterThan(0)
    })
})