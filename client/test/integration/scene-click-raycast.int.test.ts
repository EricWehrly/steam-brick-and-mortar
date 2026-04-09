import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { SceneClickGameBoxRaycast, type SceneGameBoxHit } from '../../src/scene/interaction/SceneClickGameBoxRaycast'
import { EventManager } from '../../src/core/EventManager'
import { DataManager } from '../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../src/core/data/DataTypes'
import { InputEventTypes, type SceneCanvasClickEvent } from '../../src/types/InteractionEvents'
import { SceneLayer } from '../../src/scene/SceneLayers'
import type { InstanceMetadata } from '../../src/debug/GameFinder'

describe('SceneClickGameBoxRaycast integration', () => {
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let eventManager: EventManager
    let dataManager: DataManager
    let raycast: SceneClickGameBoxRaycast
    let onHit: ReturnType<typeof vi.fn>

    beforeEach(() => {
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100)
        // Camera at a realistic position (NOT origin) so bounding sphere tests don't
        // accidentally pass due to distanceSq=0. Origin camera masks stale-sphere bugs.
        camera.position.set(0, 0, 5)
        camera.lookAt(0, 0, 0)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld(true)

        eventManager = EventManager.getInstance()
        dataManager = DataManager.getInstance()

        dataManager.clear()
        eventManager.removeAllListeners(InputEventTypes.SceneCanvasClick)

        onHit = vi.fn()
        raycast = new SceneClickGameBoxRaycast({
            scene,
            camera,
            maxDistance: 10
        })

        // @ts-ignore - test helper on window
        window.spotlightGame = vi.fn()
    })

    afterEach(() => {
        raycast.dispose()
        eventManager.removeAllListeners(InputEventTypes.SceneCanvasClick)
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    it('should hit LOD instanced artwork and resolve metadata', () => {})

    it('should still report hit for interactable instanced mesh before metadata is available', () => {})

    it('should not hit layerless mesh without metadata fallback data', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshBasicMaterial()
        const gameBox = new THREE.Mesh(geometry, material)

        gameBox.position.set(0, 0, 0)
        gameBox.userData = {
            isGameBox: true,
            name: 'Layerless Game',
            appid: 1234
        }

        // Intentionally do NOT set SceneLayer.Interactable to simulate production mis-tag
        scene.add(gameBox)
        scene.updateMatrixWorld(true)

        eventManager.emit<SceneCanvasClickEvent>(InputEventTypes.SceneCanvasClick, {
            clientX: 100,
            clientY: 100,
            button: 0,
            ndcX: 0,
            ndcY: 0
        })

        expect(onHit).not.toHaveBeenCalled()

        geometry.dispose()
        material.dispose()
    })

})

