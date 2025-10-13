/**
 * Unit tests for StorePropsRenderer shelf spawning logic
 * 
 * Fast unit test that focuses on shelf calculation and event handling
 * without heavy Three.js dependencies that cause timeout issues.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../src/core/data'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { RoomEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

// Mock GameBoxRenderer completely to avoid SharedMaterialManager
const mockGameBoxRenderer = {
    createGameBox: vi.fn().mockReturnValue(new THREE.Mesh()),
    getInstancedLabelRenderer: vi.fn().mockReturnValue({ updateGPU: vi.fn() }),
    getInstancedArtworkRenderer: vi.fn().mockReturnValue({ updateGPU: vi.fn() }),
    dispose: vi.fn()
}

// Mock GameBoxRenderer class
vi.mock('../../../src/scene/GameBoxRenderer', () => ({
    GameBoxRenderer: vi.fn().mockImplementation(() => mockGameBoxRenderer)
}))

// Mock SharedMaterialManager to prevent initialization
vi.mock('../../../src/scene/game-box/SharedMaterialManager', () => ({
    SharedMaterialManager: {
        getInstance: vi.fn().mockReturnValue({
            getGameBoxMaterial: vi.fn().mockReturnValue(new THREE.MeshBasicMaterial()),
            getShelfMaterial: vi.fn().mockReturnValue(new THREE.MeshBasicMaterial()),
            dispose: vi.fn()
        })
    }
}))

describe('StorePropsRenderer Shelf Spawning', () => {
    let dataManager: DataManager
    let eventManager: EventManager
    let scene: THREE.Scene
    let StorePropsRenderer: any
    let renderer: any

    beforeEach(async () => {
        // Import after mocks are set up
        const module = await import('../../../src/scene/StorePropsRenderer')
        StorePropsRenderer = module.StorePropsRenderer
        
        scene = new THREE.Scene()
        dataManager = DataManager.getInstance()
        eventManager = EventManager.getInstance()
        
        // Clear any existing data
        dataManager.clear()
        
        // Create renderer with mocked dependencies
        renderer = new StorePropsRenderer(scene, dataManager, mockGameBoxRenderer)
    })

    afterEach(() => {
        vi.clearAllMocks()
        dataManager.clear()
        renderer?.dispose()
    })

    it('should create game boxes when room:resized event is emitted with games data', async () => {
        // Set up test games using current steam.games architecture
        const testGames: SteamGameData[] = [
            { appid: '1', name: 'Test Game 1', playtime_forever: 120 },
            { appid: '2', name: 'Test Game 2', playtime_forever: 60 },
            { appid: '3', name: 'Test Game 3', playtime_forever: 180 }
        ]
        
        dataManager.set('steam.games', testGames, { domain: 'steam-integration' as any })
        
        // Trigger shelf generation via room:resized event
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 20, height: 15, depth: 25 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        
        // Wait for async shelf generation
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Verify observable behavior: GameBoxRenderer.createGameBox was called for each game
        expect(mockGameBoxRenderer.createGameBox).toHaveBeenCalledTimes(testGames.length)
        
        // Verify games were processed in order
        testGames.forEach((game, index) => {
            expect(mockGameBoxRenderer.createGameBox).toHaveBeenNthCalledWith(
                index + 1,
                game,
                expect.any(Object)
            )
        })
    })

    it('should handle empty game collections gracefully', async () => {
        // Set up empty games array
        dataManager.set('steam.games', [], { domain: 'steam-integration' as any })
        
        // Trigger shelf generation
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 20, height: 15, depth: 25 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Should not crash and should not create any game boxes
        expect(mockGameBoxRenderer.createGameBox).not.toHaveBeenCalled()
        
        // Should handle subsequent events without errors
        expect(() => {
            eventManager.emit(RoomEventTypes.Resized, {
                dimensions: { width: 15, height: 15, depth: 20 },
                timestamp: Date.now(),
                source: EventSource.System
            })
        }).not.toThrow()
    })

    it('should regenerate shelves when room dimensions change', async () => {
        const testGames: SteamGameData[] = Array.from({ length: 5 }, (_, i) => ({
            appid: `${i + 1}`,
            name: `Game ${i + 1}`,
            playtime_forever: 60 * (i + 1)
        }))
        
        dataManager.set('steam.games', testGames, { domain: 'steam-integration' as any })
        
        // First room layout
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 15, height: 15, depth: 20 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Should create game boxes for first layout
        expect(mockGameBoxRenderer.createGameBox).toHaveBeenCalledTimes(testGames.length)
        
        // Clear mock calls for second test
        mockGameBoxRenderer.createGameBox.mockClear()
        
        // Second room layout (larger room)
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 25, height: 15, depth: 30 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Should recreate game boxes for new layout
        expect(mockGameBoxRenderer.createGameBox).toHaveBeenCalledTimes(testGames.length)
    })

    it('should recreate shelves when game data changes', async () => {
        // Initial games
        const initialGames: SteamGameData[] = [
            { appid: '1', name: 'Game 1', playtime_forever: 120 }
        ]
        
        dataManager.set('steam.games', initialGames, { domain: 'steam-integration' as any })
        
        // First generation
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 20, height: 15, depth: 25 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Should create box for initial game
        expect(mockGameBoxRenderer.createGameBox).toHaveBeenCalledTimes(1)
        expect(mockGameBoxRenderer.createGameBox).toHaveBeenCalledWith(
            initialGames[0],
            expect.any(Object)
        )
        
        // Clear mock calls
        mockGameBoxRenderer.createGameBox.mockClear()
        
        // Update games
        const updatedGames: SteamGameData[] = [
            { appid: '2', name: 'Game 2', playtime_forever: 90 },
            { appid: '3', name: 'Game 3', playtime_forever: 150 }
        ]
        
        dataManager.set('steam.games', updatedGames, { domain: 'steam-integration' as any })
        
        // Regenerate with updated data
        eventManager.emit(RoomEventTypes.Resized, {
            dimensions: { width: 20, height: 15, depth: 25 },
            timestamp: Date.now(),
            source: EventSource.System
        })
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Should create boxes for new games
        expect(mockGameBoxRenderer.createGameBox).toHaveBeenCalledTimes(updatedGames.length)
        updatedGames.forEach((game, index) => {
            expect(mockGameBoxRenderer.createGameBox).toHaveBeenNthCalledWith(
                index + 1,
                game,
                expect.any(Object)
            )
        })
    })
})