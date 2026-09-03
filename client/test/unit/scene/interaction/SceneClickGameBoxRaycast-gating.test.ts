/**
 * SceneClickGameBoxRaycast — occlusion and input-paused gating (direct request, 2026-09-02):
 * "rays can go through shelves ... need to only worry about ... pixels the player camera can
 * see" and "if I have a UI/menu open, like the game box, the world raycast ... shouldn't be
 * active."
 *
 * This class asks InputManager.isInputPaused() rather than tracking menu-open state itself (PR
 * review request, 2026-09-03) - a real InputManager instance is constructed below so
 * InputManager.getActiveInstance() resolves the way it does at runtime. WHAT decides to call
 * pause()/resume() - SystemUICoordinator counts every open menuType app-wide - is out of scope
 * here (see SystemUICoordinator-menu-gating.test.ts for that); this only checks that the raycast
 * itself correctly stands down while InputManager reports paused, regardless of why.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../../src/core/data/DataManager'
import { EventManager } from '../../../../src/core/EventManager'
import {
    InputEventTypes, GameEventTypes,
    type SceneCanvasClickEvent, type GameSelectedEvent
} from '../../../../src/types/InteractionEvents'
import { SceneLayer } from '../../../../src/scene/SceneLayers'
import { SceneClickGameBoxRaycast } from '../../../../src/scene/interaction/SceneClickGameBoxRaycast'
import { InputManager } from '../../../../src/input/InputManager'

function createGameBoxMesh(appid: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.userData.isGameBox = true
    mesh.userData.appid = appid
    mesh.layers.set(SceneLayer.Interactable)
    return mesh
}

/** A plain, non-interactable occluder - a shelf panel, a wall - carrying no game-box metadata
 *  and no SceneLayer.Interactable tag, matching every real occluder in the scene today. */
function createOccluderMesh(): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.1))
}

function emitCenterScreenClick(eventManager: EventManager): void {
    eventManager.emit<SceneCanvasClickEvent>(InputEventTypes.SceneCanvasClick, {
        clientX: 0, clientY: 0, button: 0, ndcX: 0, ndcY: 0
    })
}

function syncWorldMatrices(scene: THREE.Scene, camera: THREE.Camera): void {
    camera.updateMatrixWorld(true)
    scene.updateMatrixWorld(true)
}

describe('SceneClickGameBoxRaycast occlusion and menu gating', () => {
    const eventManager = EventManager.getInstance()
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let raycast: SceneClickGameBoxRaycast
    let inputManager: InputManager
    let selectedHandler: ReturnType<typeof vi.fn<(event: CustomEvent<GameSelectedEvent>) => void>>

    beforeEach(() => {
        DataManager.resetInstance()
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100)
        camera.position.set(0, 0, 0)
        camera.lookAt(0, 0, -1)

        selectedHandler = vi.fn<(event: CustomEvent<GameSelectedEvent>) => void>()
        eventManager.registerEventHandler<GameSelectedEvent>(GameEventTypes.Selected, selectedHandler)

        inputManager = new InputManager()
        raycast = new SceneClickGameBoxRaycast({ scene, camera, maxDistance: 10 })
    })

    afterEach(() => {
        eventManager.deregisterEventHandler(GameEventTypes.Selected, selectedHandler)
        raycast.dispose()
        inputManager.dispose()
        DataManager.resetInstance()
    })

    it('does not select a box behind a nearer, non-interactable occluder - the ray should stop at what the camera can actually see', () => {
        const occluder = createOccluderMesh()
        occluder.position.set(0, 0, -2) // between the camera and the box
        scene.add(occluder)

        const box = createGameBoxMesh(111)
        box.position.set(0, 0, -5)
        scene.add(box)

        syncWorldMatrices(scene, camera)
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).not.toHaveBeenCalled()
    })

    it('still selects a box with nothing physically in front of it (non-regression)', () => {
        const box = createGameBoxMesh(222)
        box.position.set(0, 0, -5)
        scene.add(box)

        syncWorldMatrices(scene, camera)
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).toHaveBeenCalledTimes(1)
        expect(selectedHandler.mock.calls[0][0].detail.appid).toBe(222)
    })

    it('an occluder behind the box (further away) does not block selection', () => {
        const box = createGameBoxMesh(333)
        box.position.set(0, 0, -5)
        scene.add(box)

        const farWall = createOccluderMesh()
        farWall.position.set(0, 0, -8) // beyond the box, not in front of it
        scene.add(farWall)

        syncWorldMatrices(scene, camera)
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).toHaveBeenCalledTimes(1)
        expect(selectedHandler.mock.calls[0][0].detail.appid).toBe(333)
    })

    it('ignores clicks entirely while InputManager reports input paused', () => {
        const box = createGameBoxMesh(444)
        box.position.set(0, 0, -5)
        scene.add(box)
        syncWorldMatrices(scene, camera)

        inputManager.pause()
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).not.toHaveBeenCalled()
    })

    it('resumes handling clicks once InputManager resumes', () => {
        const box = createGameBoxMesh(555)
        box.position.set(0, 0, -5)
        scene.add(box)
        syncWorldMatrices(scene, camera)

        inputManager.pause()
        inputManager.resume()
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).toHaveBeenCalledTimes(1)
        expect(selectedHandler.mock.calls[0][0].detail.appid).toBe(555)
    })
})
