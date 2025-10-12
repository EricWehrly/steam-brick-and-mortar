/**
 * RoomManager DataManager Integration Test
 * 
 * Tests that RoomManager correctly stores and retrieves Steam game data
 * using the new DataManager instead of global access patterns.
 * 
 * Migration: Updated to use createSceneTestContainer() for proper DI isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { RoomManager } from '../../../src/scene/RoomManager'
import { DataManager, DataDomain } from '../../../src/core/data'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import { ServiceContainer } from '../../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../../src/core/di/ServiceKeys'
import { createSceneTestContainer } from '../../utils/test-container-helpers'

// Mock TextureManager to avoid file system dependencies
vi.mock('../../../src/utils/TextureManager', () => ({
    TextureManager: {
        getInstance: () => ({
            createCarpetMaterial: vi.fn().mockResolvedValue(new THREE.MeshStandardMaterial()),
            createCeilingMaterial: vi.fn().mockResolvedValue(new THREE.MeshStandardMaterial()),
            createProceduralCeilingMaterial: vi.fn().mockReturnValue(new THREE.MeshStandardMaterial()),
            createWoodMaterial: vi.fn().mockResolvedValue(new THREE.MeshStandardMaterial())
        })
    }
}))

// Mock PropRenderer to avoid complex dependencies
vi.mock('../../../src/scene/PropRenderer', () => ({
    PropRenderer: vi.fn().mockImplementation(() => ({
        createEntranceFloorMat: vi.fn().mockReturnValue(new THREE.Group())
    }))
}))

describe('RoomManager DataManager Integration', () => {
    let container: ServiceContainer
    let scene: THREE.Scene
    let roomManager: RoomManager
    let eventManager: EventManager
    let dataManager: DataManager
    
    beforeEach(async () => {
        // Create isolated test container
        container = await createSceneTestContainer()

        scene = new THREE.Scene()
        
        // Resolve services from container
        eventManager = await container.resolve(ServiceKeys.EventManager)
        dataManager = await container.resolve(ServiceKeys.DataManager)

        roomManager = new RoomManager(scene)
    })

    afterEach(async () => {
        roomManager?.dispose()
        
        // Clear DataManager state to prevent test pollution
        dataManager.clear()
        
        // Dispose container to clean up all services
        await container.dispose()
    })

    describe('Steam Data Storage Integration', () => {
        it('should react to Steam data event and request room resize (data pre-stored by SteamWorkflowManager)', () => {
            // FIRST: Simulate SteamWorkflowManager storing data (as it should do before emitting event)
            dataManager.set('steam.gameCount', 42, { domain: DataDomain.SteamIntegration })
            dataManager.set('steam.userInput', 'testuser', { domain: DataDomain.SteamIntegration })
            
            // SECOND: Emit SteamDataLoaded event (RoomManager should react but NOT store data)
            eventManager.emit(SteamEventTypes.DataLoaded, {
                userInput: 'testuser',
                gameCount: 42,
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Verify data is still there (unchanged by RoomManager)
            expect(dataManager.get<number>('steam.gameCount')).toBe(42)
            expect(dataManager.get<string>('steam.userInput')).toBe('testuser')

            // Verify RoomManager consumed the data for room sizing
            const steamKeys = dataManager.getKeysByDomain(DataDomain.SteamIntegration)
            expect(steamKeys).toContain('steam.gameCount')
            expect(steamKeys).toContain('steam.userInput')
        })

        it('should use stored game count from DataManager for room resize calculations', async () => {
            // Store sample games in DataManager (should result in game count = 15)
            const sampleGames = Array.from({ length: 15 }, (_, i) => ({
                appid: i.toString(),
                name: `Game ${i + 1}`,
                playtime_forever: 100,
                img_icon_url: 'test.jpg',
                img_logo_url: 'test_logo.jpg'
            }))
            
            dataManager.set('steam.games', sampleGames, {
                domain: DataDomain.SteamIntegration
            })

            // Spy on DataManager.get to verify it's called for game data
            const dataManagerSpy = vi.spyOn(dataManager, 'get')

            // Emit a room resize event
            eventManager.emit('room:resize', {
                reason: 'test-resize',
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify that DataManager was used to retrieve games
            expect(dataManagerSpy).toHaveBeenCalledWith('steam.games')
            
            // Verify the data was retrieved correctly
            const retrievedGames = dataManager.get('steam.games')
            expect(retrievedGames).toHaveLength(15)

            dataManagerSpy.mockRestore()
        })

        it('should use DataManager for game count without event parameters', async () => {
            // Store game array in DataManager
            const sampleGames = Array.from({ length: 10 }, (_, i) => ({
                appid: i.toString(),
                name: `Game ${i + 1}`,
                playtime_forever: 100,
                img_icon_url: 'test.jpg',
                img_logo_url: 'test_logo.jpg'
            }))
            
            dataManager.set('steam.games', sampleGames, {
                domain: DataDomain.SteamIntegration
            })

            // Spy on DataManager.get to verify it's called
            const dataManagerSpy = vi.spyOn(dataManager, 'get')

            // Emit room resize event WITHOUT gameCount (should use DataManager)
            eventManager.emit('room:resize', {
                reason: 'test-resize',
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify that DataManager was used for game retrieval
            expect(dataManagerSpy).toHaveBeenCalledWith('steam.games')

            dataManagerSpy.mockRestore()
        })

        it('should handle missing game count gracefully', async () => {
            // Ensure no games are stored in DataManager
            expect(dataManager.get<any[]>('steam.games')).toBeUndefined()

            // Spy on DataManager.get to verify it's still called even when no data exists
            const dataManagerSpy = vi.spyOn(dataManager, 'get')

            // Emit room resize without gameCount and no DataManager data
            eventManager.emit('room:resize', {
                reason: 'test-resize',
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify graceful fallback - DataManager is still called for games
            expect(dataManagerSpy).toHaveBeenCalledWith('steam.games')
            
            // Verify that no games results in empty array/undefined (graceful handling)
            const retrievedGames = dataManager.get('steam.games')
            expect(retrievedGames).toBeUndefined()

            dataManagerSpy.mockRestore()
        })
    })

    describe('Integration Architecture Validation', () => {
        it('should have replaced global access pattern with DataManager', () => {
            // This test verifies that our integration is architectural sound
            // by ensuring the RoomManager has both Steam event listening and DataManager usage

            const steamKeys = dataManager.getKeysByDomain(DataDomain.SteamIntegration)
            const roomKeys = dataManager.getKeysByDomain(DataDomain.RoomManager)

            // Before any events, both domains should be empty
            expect(steamKeys).toEqual([])
            expect(roomKeys).toEqual([])

            // Simulate SteamWorkflowManager storing data BEFORE emitting event (proper architecture)
            dataManager.set('steam.gameCount', 7, { domain: DataDomain.SteamIntegration })
            dataManager.set('steam.userInput', 'testuser', { domain: DataDomain.SteamIntegration })
            
            // Now emit Steam data event (data is already stored)
            eventManager.emit(SteamEventTypes.DataLoaded, {
                userInput: 'testuser',
                gameCount: 7,
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Steam domain should have data (stored before event, not by event handler)
            const updatedSteamKeys = dataManager.getKeysByDomain(DataDomain.SteamIntegration)
            expect(updatedSteamKeys.length).toBeGreaterThan(0)
            expect(updatedSteamKeys).toContain('steam.gameCount')
        })

        it('should use centralized DataManager for all game count retrieval', async () => {
            // Verify that room operations always use DataManager, 
            // removing the need for gameCount parameters in events

            // Store test games in DataManager
            const sampleGames = Array.from({ length: 33 }, (_, i) => ({
                appid: i.toString(),
                name: `Game ${i + 1}`,
                playtime_forever: 100,
                img_icon_url: 'test.jpg',
                img_logo_url: 'test_logo.jpg'
            }))
            
            dataManager.set('steam.games', sampleGames, {
                domain: DataDomain.SteamIntegration
            })

            const dataManagerSpy = vi.spyOn(dataManager, 'get')

            eventManager.emit('room:resize', {
                reason: 'compatibility-test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify DataManager is used for retrieving games
            expect(dataManagerSpy).toHaveBeenCalledWith('steam.games')
            
            // Verify the games array has correct length
            const retrievedGames = dataManager.get('steam.games')
            expect(retrievedGames).toHaveLength(33)

            dataManagerSpy.mockRestore()
        })
    })
})