/**
 * SceneClickGameBoxRaycast — occlusion and menu-open gating (direct request, 2026-09-02):
 * "rays can go through shelves ... need to only worry about ... pixels the player camera can
 * see" and "if I have a UI/menu open, like the game box, the world raycast ... shouldn't be
 * active."
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../../src/core/data/DataManager'
import { EventManager } from '../../../../src/core/EventManager'
import {
    InputEventTypes, GameEventTypes, UIEventTypes,
    type SceneCanvasClickEvent, type GameSelectedEvent, type MenuOpenEvent, type MenuCloseEvent
} from '../../../../src/types/InteractionEvents'
import { SceneLayer } from '../../../../src/scene/SceneLayers'
import { SceneClickGameBoxRaycast } from '../../../../src/scene/interaction/SceneClickGameBoxRaycast'

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
    let selectedHandler: ReturnType<typeof vi.fn<(event: CustomEvent<GameSelectedEvent>) => void>>

    beforeEach(() => {
        DataManager.resetInstance()
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100)
        camera.position.set(0, 0, 0)
        camera.lookAt(0, 0, -1)

        selectedHandler = vi.fn<(event: CustomEvent<GameSelectedEvent>) => void>()
        eventManager.registerEventHandler<GameSelectedEvent>(GameEventTypes.Selected, selectedHandler)

        raycast = new SceneClickGameBoxRaycast({ scene, camera, maxDistance: 10 })
    })

    afterEach(() => {
        eventManager.deregisterEventHandler(GameEventTypes.Selected, selectedHandler)
        raycast.dispose()
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

    it('ignores clicks entirely while any menu is open', () => {
        const box = createGameBoxMesh(444)
        box.position.set(0, 0, -5)
        scene.add(box)
        syncWorldMatrices(scene, camera)

        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).not.toHaveBeenCalled()
    })

    it('resumes handling clicks once the menu closes', () => {
        const box = createGameBoxMesh(555)
        box.position.set(0, 0, -5)
        scene.add(box)
        syncWorldMatrices(scene, camera)

        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).toHaveBeenCalledTimes(1)
        expect(selectedHandler.mock.calls[0][0].detail.appid).toBe(555)
    })

    it('two menus opening and only one closing still blocks - the pause menu and a game box can be open independently', () => {
        const box = createGameBoxMesh(666)
        box.position.set(0, 0, -5)
        scene.add(box)
        syncWorldMatrices(scene, camera)

        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).not.toHaveBeenCalled()
    })
})
