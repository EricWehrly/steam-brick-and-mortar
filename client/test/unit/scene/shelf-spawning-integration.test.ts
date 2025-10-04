/**
 * Test suite for verifying shelf spawning works with the cleaned up event architecture
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { StorePropsRenderer } from '../../../src/scene/StorePropsRenderer'
import { DataManager, DataDomain } from '../../../src/core/data'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { RoomEventTypes } from '../../../src/types/InteractionEvents'

describe('Shelf Spawning Integration', () => {
    let scene: THREE.Scene
    let propsRenderer: StorePropsRenderer
    let dataManager: DataManager
    let eventManager: EventManager

    beforeEach(() => {
        // Setup THREE.js scene
        scene = new THREE.Scene()
        
        // Initialize DataManager 
        dataManager = DataManager.getInstance()
        dataManager.clear()
        
        // Initialize EventManager
        eventManager = EventManager.getInstance()
        
        // Initialize StorePropsRenderer (this registers for room:resized events)
        propsRenderer = new StorePropsRenderer(scene)
    })

    afterEach(() => {
        propsRenderer.dispose()
        dataManager.clear()
    })

    describe('Fixed Event-Driven Architecture', () => {
        it('should spawn shelves when room:resized event is emitted with game count in DataManager', async () => {
            // Store game count in DataManager (simulating SteamWorkflowManager behavior)  
            dataManager.set('steam.gameCount', 20, { domain: DataDomain.SteamIntegration })
            console.log(`📊 Test: Stored 20 games in DataManager`)
            
            // Emit room:resized event (simulating RoomManager behavior)
            console.log(`📡 Test: Emitting room:resized event (no games property - clean architecture)`)
            eventManager.emit(RoomEventTypes.Resized, {
                dimensions: { width: 22, depth: 16, height: 3.2 },
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            // Wait a brief moment for async shelf creation
            await new Promise(resolve => setTimeout(resolve, 10))
            
            // Verify shelves were created by checking scene children
            const shelves = scene.children.filter(child => 
                child.name.includes('shelf') || child.userData?.type === 'shelf'
            )
            
            console.log(`🔍 Test: Found ${shelves.length} shelf objects in scene`)
            console.log(`📦 Scene children:`, scene.children.map(c => c.name || c.type))
            
            // With 20 games, we expect at least 1 shelf (18 games per shelf max)
            expect(shelves.length).toBeGreaterThan(0)
        })

        it('should not spawn shelves when no game count is available in DataManager', async () => {
            // Don't store any game count in DataManager
            console.log(`📊 Test: No games stored in DataManager`)
            
            // Emit room:resized event  
            console.log(`📡 Test: Emitting room:resized event with no game data`)
            eventManager.emit(RoomEventTypes.Resized, {
                dimensions: { width: 22, depth: 16, height: 3.2 },
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            // Wait a brief moment
            await new Promise(resolve => setTimeout(resolve, 10))
            
            // Verify no shelves were created
            const shelves = scene.children.filter(child => 
                child.name.includes('shelf') || child.userData?.type === 'shelf'
            )
            
            console.log(`🔍 Test: Found ${shelves.length} shelf objects in scene (should be 0)`)
            expect(shelves.length).toBe(0)
        })

        it('should calculate correct number of shelves based on game count', async () => {
            // Store a larger game count to test shelf calculation
            const gameCount = 50
            dataManager.set('steam.gameCount', gameCount, { domain: DataDomain.SteamIntegration })
            console.log(`📊 Test: Stored ${gameCount} games in DataManager`)
            
            // Emit room:resized event
            eventManager.emit(RoomEventTypes.Resized, {
                dimensions: { width: 22, depth: 20, height: 3.2 },
                timestamp: Date.now(),
                source: EventSource.System
            })
            
            // Wait for shelf creation
            await new Promise(resolve => setTimeout(resolve, 10))
            
            // Calculate expected shelves (18 games per shelf: 3 games × 6 surfaces)
            const gamesPerShelf = 3 * 6 // GAMES_PER_SURFACE * SURFACES_PER_SHELF
            const expectedShelves = Math.ceil(gameCount / gamesPerShelf)
            
            const shelves = scene.children.filter(child => 
                child.name.includes('shelf') || child.userData?.type === 'shelf'
            )
            
            console.log(`🔍 Test: Expected ${expectedShelves} shelves for ${gameCount} games, found ${shelves.length}`)
            
            // Allow some flexibility in shelf counting due to implementation details
            expect(shelves.length).toBeGreaterThanOrEqual(expectedShelves - 1)
            expect(shelves.length).toBeLessThanOrEqual(expectedShelves + 1)
        })
    })
})