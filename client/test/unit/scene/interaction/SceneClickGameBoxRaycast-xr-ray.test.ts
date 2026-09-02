/**
 * SceneClickGameBoxRaycast — controller-ray branch (VR).
 *
 * A published XRControllerSource should redirect the raycast origin/direction away from the
 * click's NDC position; with no controller source (or one returning null), behavior must be
 * identical to today's desktop/mouse/gamepad NDC-based raycast (explicit non-regression check).
 * See docs/plans/vr-support-plan.md.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../../src/core/data/DataTypes'
import { EventManager } from '../../../../src/core/EventManager'
import { InputEventTypes, GameEventTypes, type SceneCanvasClickEvent, type GameSelectedEvent } from '../../../../src/types/InteractionEvents'
import { SceneLayer } from '../../../../src/scene/SceneLayers'
import { SceneClickGameBoxRaycast } from '../../../../src/scene/interaction/SceneClickGameBoxRaycast'
import type { XRControllerSource } from '../../../../src/webxr/XRControllerManager'

function createGameBoxMesh(appid: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.userData.isGameBox = true
    mesh.userData.appid = appid
    mesh.layers.set(SceneLayer.Interactable)
    return mesh
}

function emitCenterScreenClick(eventManager: EventManager): void {
    eventManager.emit<SceneCanvasClickEvent>(InputEventTypes.SceneCanvasClick, {
        clientX: 0, clientY: 0, button: 0, ndcX: 0, ndcY: 0
    })
}

// Object3D.matrixWorld only updates via updateMatrixWorld() - normally driven by the renderer's
// own render loop each frame. No renderer runs in this test, so raycasting against stale
// (identity) matrices would silently miss everything positioned off-origin.
function syncWorldMatrices(scene: THREE.Scene, camera: THREE.Camera): void {
    camera.updateMatrixWorld(true)
    scene.updateMatrixWorld(true)
}

describe('SceneClickGameBoxRaycast controller-ray branch', () => {
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

    it('falls back to NDC/camera raycasting when no controller source is published (non-regression)', () => {
        const box = createGameBoxMesh(111)
        box.position.set(0, 0, -5) // directly ahead of the camera
        scene.add(box)

        syncWorldMatrices(scene, camera)
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).toHaveBeenCalledTimes(1)
        expect(selectedHandler.mock.calls[0][0].detail.appid).toBe(111)
    })

    it('falls back to NDC/camera raycasting when the published controller source returns null', () => {
        const box = createGameBoxMesh(222)
        box.position.set(0, 0, -5)
        scene.add(box)

        DataManager.getInstance().set<XRControllerSource>(DataKey.XRControllerSource, {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => null
        }, { domain: DataDomain.Scene })

        syncWorldMatrices(scene, camera)
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).toHaveBeenCalledTimes(1)
        expect(selectedHandler.mock.calls[0][0].detail.appid).toBe(222)
    })

    it('uses the published controller ray instead of NDC when one is available', () => {
        const centerBox = createGameBoxMesh(1) // sits where NDC (0,0) would hit - must NOT be selected
        centerBox.position.set(0, 0, -5)
        scene.add(centerBox)

        const sideBox = createGameBoxMesh(2) // off to the side - only the controller ray reaches this
        sideBox.position.set(5, 0, -5)
        scene.add(sideBox)

        const fakeControllerSource: XRControllerSource = {
            getPrimaryControllerRay: () => ({
                origin: new THREE.Vector3(5, 0, 0),
                direction: new THREE.Vector3(0, 0, -1)
            }),
            getPrimaryControllerGrip: () => null
        }
        DataManager.getInstance().set(DataKey.XRControllerSource, fakeControllerSource, { domain: DataDomain.Scene })

        syncWorldMatrices(scene, camera)
        emitCenterScreenClick(eventManager)

        expect(selectedHandler).toHaveBeenCalledTimes(1)
        expect(selectedHandler.mock.calls[0][0].detail.appid).toBe(2)
    })
})
