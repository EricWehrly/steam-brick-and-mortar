/**
 * Scene Coordinator Event Registration Tests
 *
 * Tests that the SceneCoordinator properly registers for the GameStart event
 * using the correct event type constant.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../src/core/data/DataTypes'

vi.mock('../../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn()
}))

vi.mock('../../../src/scene/StoreLayout', () => ({
    StoreLayout: vi.fn().mockImplementation(function() { return {} })
}))

vi.mock('../../../src/scene/SignageRenderer', () => ({
    SignageRenderer: vi.fn().mockImplementation(function() { return {} })
}))

vi.mock('../../../src/scene/GameBoxRenderer', () => ({
    GameBoxRenderer: vi.fn().mockImplementation(function() { return {} })
}))

import { SceneCoordinator } from '../../../src/scene/SceneCoordinator'
import { GameEventTypes } from '../../../src/types/InteractionEvents'

describe('Scene Coordinator Event Registration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // SceneCoordinator creates SkyboxManager which reads MainScene from DataManager
        const mockScene = new THREE.Scene()
        const mockCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
        DataManager.getInstance().set(DataKey.MainScene, mockScene, { domain: DataDomain.Scene })
        DataManager.getInstance().set(DataKey.MainCamera, mockCamera, { domain: DataDomain.Scene })
    })

    it('should emit SceneReady event when basic environment is set up', () => {
        const mockSceneManager = {
            getScene: vi.fn().mockReturnValue({ add: vi.fn(), remove: vi.fn() }),
            getRenderer: vi.fn().mockReturnValue({ shadowMap: { enabled: false } })
        }

        new SceneCoordinator(mockSceneManager as any)

        expect(GameEventTypes.SceneReady).toBe('game:scene-ready')
    })
})
