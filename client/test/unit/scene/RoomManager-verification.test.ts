/**
 * Simple test to verify RoomManager DataManager integration logs
 * 
 * Migration: Updated to use DI container for proper test isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { RoomManager } from '../../../src/scene/RoomManager'
import { DataManager, DataDomain } from '../../../src/core/data'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { ServiceContainer } from '../../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../../src/core/di/ServiceKeys'
import { createSceneTestContainer } from '../../utils/test-container-helpers'

// Mock complex dependencies
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

vi.mock('../../../src/scene/PropRenderer', () => ({
    PropRenderer: vi.fn().mockImplementation(() => ({
        createEntranceFloorMat: vi.fn().mockReturnValue(new THREE.Group())
    }))
}))

describe('RoomManager DataManager Integration Verification', () => {
    let container: ServiceContainer
    let scene: THREE.Scene
    let roomManager: RoomManager
    let eventManager: EventManager
    let dataManager: DataManager
    let consoleSpy: any

    beforeEach(async () => {
        // Create isolated DI container for this test
        container = await createSceneTestContainer()
        
        scene = new THREE.Scene()
        
        // Resolve services from container (isolated instances)
        eventManager = await container.resolve(ServiceKeys.EventManager)
        dataManager = await container.resolve(ServiceKeys.DataManager)

        // Set up console spy to capture logs
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        roomManager = new RoomManager(scene)
    })

    afterEach(async () => {
        roomManager?.dispose()
        consoleSpy?.mockRestore()
        
        // Dispose container to clean up all services
        await container.dispose()
    })

    it('should verify DataManager integration with explicit method checking', async () => {
        // Store game array in DataManager
        const sampleGames = Array.from({ length: 99 }, (_, i) => ({
            appid: i.toString(),
            name: `Game ${i + 1}`,
            playtime_forever: 100,
            img_icon_url: 'test.jpg',
            img_logo_url: 'test_logo.jpg'
        }))
        
        dataManager.set('steam.games', sampleGames, {
            domain: DataDomain.SteamIntegration
        })

        // Spy on DataManager.get method to verify actual usage
        const dataManagerSpy = vi.spyOn(dataManager, 'get')

        console.log('🔍 TEST: About to emit room:resize event')

        // Emit room resize event without gameCount
        eventManager.emit('room:resize', {
            reason: 'datamanager-verification',
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Wait for async event processing
        await new Promise(resolve => setTimeout(resolve, 50))

        // Verify DataManager was used to retrieve games
        expect(dataManagerSpy).toHaveBeenCalledWith('steam.games')
        
        // Verify the data is accessible and correct
        const retrievedGames = dataManager.get('steam.games')
        expect(retrievedGames).toHaveLength(99)
        
        dataManagerSpy.mockRestore()
    })

    it('should verify DataManager is used for centralized game count access', async () => {
        // Store game array in DataManager
        const sampleGames = Array.from({ length: 77 }, (_, i) => ({
            appid: i.toString(),
            name: `Game ${i + 1}`,
            playtime_forever: 100,
            img_icon_url: 'test.jpg',
            img_logo_url: 'test_logo.jpg'
        }))
        
        dataManager.set('steam.games', sampleGames, {
            domain: DataDomain.SteamIntegration
        })

        // Spy on DataManager.get method
        const dataManagerSpy = vi.spyOn(dataManager, 'get')

        console.log('🔍 TEST: About to emit room:resize event without gameCount')

        // Emit room resize WITHOUT gameCount (should use DataManager)
        eventManager.emit('room:resize', {
            reason: 'datamanager-usage-test',
            timestamp: Date.now(),
            source: EventSource.System
        })

        await new Promise(resolve => setTimeout(resolve, 50))

        // Check that DataManager was used to retrieve games
        expect(dataManagerSpy).toHaveBeenCalledWith('steam.games')
        
        dataManagerSpy.mockRestore()
    })
})