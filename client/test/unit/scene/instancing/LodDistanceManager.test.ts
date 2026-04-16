import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { LodDistanceManager } from '../../../../src/scene/game-box/instancing/LodDistanceManager'
import { LOD_LEVEL, type ILodArtworkRenderer } from '../../../../src/scene/game-box/instancing/ILodArtworkRenderer'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey } from '../../../../src/core/data/DataTypes'
import { EventManager } from '../../../../src/core/EventManager'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'
import { AppSettings } from '../../../../src/core/AppSettings'

// Mock dependencies
vi.mock('../../../../src/core/data/DataManager', () => ({
    DataManager: {
        getInstance: vi.fn().mockReturnValue({
            get: vi.fn(),
            set: vi.fn()
        })
    }
}))

vi.mock('../../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: vi.fn().mockReturnValue({
            registerEventHandler: vi.fn(),
            deregisterEventHandler: vi.fn()
        })
    }
}))

vi.mock('../../../../src/scene/RenderLoopRegistry', () => ({
    RenderLoopRegistry: {
        getInstance: vi.fn().mockReturnValue({
            register: vi.fn(),
            unregister: vi.fn()
        })
    }
}))

vi.mock('../../../../src/core/AppSettings', () => ({
    AppSettings: {
        get: vi.fn()
    },
    Setting: {
        LodHighDistance: 'lodHighDistance',
        LodMedDistance: 'lodMedDistance'
    }
}))

describe('LodDistanceManager', () => {
    let distanceManager: LodDistanceManager
    let mockRenderer: vi.Mocked<ILodArtworkRenderer>
    let mockCamera: THREE.PerspectiveCamera
    let mockDataManager: ReturnType<typeof DataManager.getInstance>

    beforeEach(() => {
        vi.clearAllMocks()

        // Setup mock camera
        mockCamera = new THREE.PerspectiveCamera()
        mockCamera.position.set(0, 0, 0)

        // Setup mock DataManager
        mockDataManager = DataManager.getInstance()
        vi.mocked(mockDataManager.get).mockImplementation((key) => {
            if (key === DataKey.MainCamera) return mockCamera
            return null
        })

        // Setup mock AppSettings to return predictable defaults for tests
        vi.mocked(AppSettings.get).mockImplementation((key) => {
            if (key === 'lodHighDistance') return 3.0
            if (key === 'lodMedDistance') return 8.0
            return null
        })

        // Setup mock renderer
        const instanceData = new Map()
        // Instance 0 is at x=0 (distance 0 from origin)
        instanceData.set(0, { position: new THREE.Vector3(0, 0, 0), lodLevel: LOD_LEVEL.MID })
        
        mockRenderer = {
            getInstanceCount: vi.fn().mockReturnValue(1),
            getInstanceData: vi.fn().mockReturnValue(instanceData),
            setInstanceLod: vi.fn().mockReturnValue(true),
            getInstanceLod: vi.fn().mockReturnValue(LOD_LEVEL.MID),
            setArtworkInstanceFromUrl: vi.fn(),
            dispose: vi.fn()
        } as unknown as vi.Mocked<ILodArtworkRenderer>

        distanceManager = new LodDistanceManager(mockRenderer, {
            updateFrequency: 1, // Update every frame for easy testing
            hysteresis: 0.5     // 0.5m hysteresis
        })

        // Initial sync
        distanceManager.syncInstances()
    })

    afterEach(() => {
        distanceManager.dispose()
    })

    describe('Hysteresis Math & LOD Transitions', () => {
        it('should upgrade MID to HIGH when closer than highDistance (3.0m)', () => {
            // Move camera to 2.0m away from instance 0 (which is at 0,0,0)
            mockCamera.position.set(2.0, 0, 0)
            
            distanceManager.update(mockCamera)

            // Should upgrade to HIGH
            expect(mockRenderer.setInstanceLod).toHaveBeenCalledWith(0, LOD_LEVEL.HIGH)
        })

        it('should NOT downgrade HIGH to MID until passing highDistance + hysteresis (3.5m)', () => {
            // First, force it to HIGH by getting close
            mockCamera.position.set(2.0, 0, 0)
            distanceManager.update(mockCamera)
            expect(mockRenderer.setInstanceLod).toHaveBeenCalledWith(0, LOD_LEVEL.HIGH)
            vi.mocked(mockRenderer.setInstanceLod).mockClear()

            // Now move to 3.2m (Past the 3.0m threshold, but within 0.5m hysteresis)
            mockCamera.position.set(3.2, 0, 0)
            distanceManager.update(mockCamera)
            
            // Should NOT change LOD yet
            expect(mockRenderer.setInstanceLod).not.toHaveBeenCalled()

            // Move to 3.6m (Past the 3.5m high+hysteresis threshold)
            mockCamera.position.set(3.6, 0, 0)
            distanceManager.update(mockCamera)

            // NOW it should downgrade to MID
            expect(mockRenderer.setInstanceLod).toHaveBeenCalledWith(0, LOD_LEVEL.MID)
        })

        it('should NOT upgrade MID to HIGH until crossing highDistance boundary inwards', () => {
            // Start at 4.0m (MID)
            mockCamera.position.set(4.0, 0, 0)
            distanceManager.update(mockCamera)
            vi.mocked(mockRenderer.setInstanceLod).mockClear()

            // Move to 3.2m (Inside the hysteresis zone, but coming from outside)
            mockCamera.position.set(3.2, 0, 0)
            distanceManager.update(mockCamera)

            // Should STILL BE MID (requires crossing 3.0m to upgrade)
            expect(mockRenderer.setInstanceLod).not.toHaveBeenCalled()

            // Move to 2.8m (Crossed 3.0m threshold)
            mockCamera.position.set(2.8, 0, 0)
            distanceManager.update(mockCamera)

            // NOW it should upgrade
            expect(mockRenderer.setInstanceLod).toHaveBeenCalledWith(0, LOD_LEVEL.HIGH)
        })
    })
})
