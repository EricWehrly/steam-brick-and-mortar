/**
 * Simple test to verify RoomManager DataManager integration logs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { RoomManager } from '../../../src/scene/RoomManager'
import { DataManager, DataDomain } from '../../../src/core/data'
import { EventManager, EventSource } from '../../../src/core/EventManager'

// Mock complex dependencies
vi.mock('../../../src/utils/TextureManager', () => ({
    TextureManager: {
        getInstance: () => ({
            createCarpetMaterial: vi.fn().mockResolvedValue(new THREE.MeshStandardMaterial()),
            createCeilingMaterial: vi.fn().mockResolvedValue(new THREE.MeshStandardMaterial()),
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
    let scene: THREE.Scene
    let roomManager: RoomManager
    let eventManager: EventManager
    let dataManager: DataManager
    let mockEnvironmentRenderer: any
    let consoleSpy: any

    beforeEach(() => {
        DataManager.resetInstance()
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        dataManager = DataManager.getInstance()

        mockEnvironmentRenderer = {
            registerCeiling: vi.fn()
        }

        // Set up console spy to capture logs
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        roomManager = new RoomManager(scene, mockEnvironmentRenderer)
    })

    afterEach(() => {
        roomManager?.dispose()
        consoleSpy?.mockRestore()
        DataManager.resetInstance()
    })

    it('should verify DataManager integration with explicit log checking', async () => {
        // Store game count in DataManager
        dataManager.set('steam.gameCount', 99, {
            domain: DataDomain.SteamIntegration
        })

        console.log('🔍 TEST: About to emit room:resize event')

        // Emit room resize event without gameCount
        eventManager.emit('room:resize', {
            reason: 'datamanager-verification',
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Wait for async event processing
        await new Promise(resolve => setTimeout(resolve, 50))

        console.log('🔍 TEST: All console.log calls captured:')
        consoleSpy.mock.calls.forEach((call: any[], index: number) => {
            console.log(`  ${index}: ${call[0]}`)
        })

        // Verify DataManager was used as data source
        const dataManagerLogFound = consoleSpy.mock.calls.some((call: any[]) => 
            call[0]?.includes('Using game count from DataManager: 99')
        )
        
        expect(dataManagerLogFound).toBe(true)
    })

    it('should verify DataManager is used for centralized game count access', async () => {
        // Store game count in DataManager
        dataManager.set('steam.gameCount', 77, {
            domain: DataDomain.SteamIntegration
        })

        console.log('🔍 TEST: About to emit room:resize event without gameCount')

        // Emit room resize WITHOUT gameCount (should use DataManager)
        eventManager.emit('room:resize', {
            reason: 'datamanager-usage-test',
            timestamp: Date.now(),
            source: EventSource.System
        })

        await new Promise(resolve => setTimeout(resolve, 50))

        // Check that DataManager was used
        const dataManagerLogFound = consoleSpy.mock.calls.some((call: any[]) => 
            call[0]?.includes('Using game count from DataManager: 77')
        )
        
        expect(dataManagerLogFound).toBe(true)
    })
})