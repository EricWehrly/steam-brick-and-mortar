/**
 * RoomManager DataManager Integration Test
 * 
 * Tests that RoomManager correctly stores and retrieves Steam game data
 * using the new DataManager instead of global access patterns.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { RoomManager } from '../../../src/scene/RoomManager'
import { DataManager, DataDomain } from '../../../src/core/data'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'

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
    let scene: THREE.Scene
    let roomManager: RoomManager
    let eventManager: EventManager
    let dataManager: DataManager
    beforeEach(() => {
        // Clean up singletons for fresh test state
        DataManager.resetInstance()

        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        dataManager = DataManager.getInstance()

        roomManager = new RoomManager(scene)
    })

    afterEach(() => {
        roomManager?.dispose()
        DataManager.resetInstance()
    })

    describe('Steam Data Storage Integration', () => {
        it('should store Steam data in DataManager when SteamDataLoaded event is emitted', () => {
            // Emit a SteamDataLoaded event
            eventManager.emit(SteamEventTypes.DataLoaded, {
                userInput: 'testuser',
                gameCount: 42,
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Verify data was stored in DataManager
            expect(dataManager.get<number>('steam.gameCount')).toBe(42)
            expect(dataManager.get<string>('steam.userInput')).toBe('testuser')

            // Verify it's stored in the correct domain
            const steamKeys = dataManager.getKeysByDomain(DataDomain.SteamIntegration)
            expect(steamKeys).toContain('steam.gameCount')
            expect(steamKeys).toContain('steam.userInput')
        })

        it('should use stored game count from DataManager for room resize calculations', async () => {
            // Store game data in DataManager (simulating Steam data load)
            dataManager.set('steam.gameCount', 15, {
                domain: DataDomain.SteamIntegration
            })

            // Spy on console.log to verify the correct retrieval path
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

            // Emit a room resize event without providing gameCount (to force DataManager retrieval)
            eventManager.emit('room:resize', {
                reason: 'test-resize',
                timestamp: Date.now(),
                source: EventSource.System
                // Note: no gameCount provided - should fallback to DataManager
            })

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify that DataManager was used as the data source
            expect(consoleSpy).toHaveBeenCalledWith('📊 Using game count from DataManager: 15')

            consoleSpy.mockRestore()
        })

        it('should use DataManager for game count without event parameters', async () => {
            // Store game count in DataManager
            dataManager.set('steam.gameCount', 10, {
                domain: DataDomain.SteamIntegration
            })

            // Spy on console.log to verify the correct retrieval path
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

            // Emit room resize event WITHOUT gameCount (should use DataManager)
            eventManager.emit('room:resize', {
                reason: 'test-resize',
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify that DataManager was used for game count
            expect(consoleSpy).toHaveBeenCalledWith('📊 Using game count from DataManager: 10')

            consoleSpy.mockRestore()
        })

        it('should handle missing game count gracefully', async () => {
            // Ensure no game count is stored in DataManager
            expect(dataManager.get<number>('steam.gameCount')).toBeUndefined()

            // Spy on console.log to verify fallback behavior
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

            // Emit room resize without gameCount and no DataManager data
            eventManager.emit('room:resize', {
                reason: 'test-resize',
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10))

            // Verify graceful fallback to default (DataManager returns 0 when no data)
            expect(consoleSpy).toHaveBeenCalledWith('📊 Using game count from DataManager: 0')

            consoleSpy.mockRestore()
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

            // Emit Steam data event
            eventManager.emit(SteamEventTypes.DataLoaded, {
                userInput: 'testuser',
                gameCount: 7,
                timestamp: Date.now(),
                source: EventSource.System
            })

            // Steam domain should now have data
            const updatedSteamKeys = dataManager.getKeysByDomain(DataDomain.SteamIntegration)
            expect(updatedSteamKeys.length).toBeGreaterThan(0)
            expect(updatedSteamKeys).toContain('steam.gameCount')
        })

        it('should use centralized DataManager for all game count retrieval', async () => {
            // Verify that room operations always use DataManager, 
            // removing the need for gameCount parameters in events

            // Store test data in DataManager
            dataManager.set('steam.gameCount', 33, {
                domain: DataDomain.SteamIntegration
            })

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

            eventManager.emit('room:resize', {
                reason: 'compatibility-test',
                timestamp: Date.now(),
                source: EventSource.System
            })

            await new Promise(resolve => setTimeout(resolve, 10))

            expect(consoleSpy).toHaveBeenCalledWith('📊 Using game count from DataManager: 33')

            consoleSpy.mockRestore()
        })
    })
})