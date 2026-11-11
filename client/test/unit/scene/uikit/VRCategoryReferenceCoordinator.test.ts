/**
 * VRCategoryReferenceCoordinator - world-lock placement + lifecycle. Mirrors
 * VRSettingsPanelCoordinator.test.ts's fake-renderer/stubbed-forwardHtmlEvents pattern (jsdom's
 * canvas doesn't implement the Pointer Events capture APIs the real forwardHtmlEvents needs).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { Container } from '@pmndrs/uikit'
import { VRCategoryReferenceCoordinator } from '../../../../src/scene/uikit/VRCategoryReferenceCoordinator'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'

const CALLBACK_KEY = 'VRCategoryReferenceCoordinator'

function createFakeRenderer(): THREE.WebGLRenderer {
    return {
        domElement: document.createElement('canvas'),
        localClippingEnabled: false,
        setTransparentSort: () => {}
    } as unknown as THREE.WebGLRenderer
}

const forwardEvents = vi.hoisted(() => vi.fn((_el: HTMLElement, _getCamera: unknown, _root: unknown) => ({ destroy: () => {}, update: () => {} })))
vi.mock('@pmndrs/pointer-events', async importOriginal => ({
    ...(await importOriginal<typeof import('@pmndrs/pointer-events')>()),
    forwardHtmlEvents: forwardEvents
}))

function runUpdate(coordinator: VRCategoryReferenceCoordinator): void {
    (coordinator as unknown as { update: (now: number, deltaTime: number) => void }).update(0, 16)
}

describe('VRCategoryReferenceCoordinator', () => {
    let camera: THREE.PerspectiveCamera
    let scene: THREE.Scene
    let coordinator: VRCategoryReferenceCoordinator | undefined

    beforeEach(() => {
        forwardEvents.mockClear()
        DataManager.resetInstance()
        DataManager.getInstance().set(DataKey.Renderer, createFakeRenderer(), { domain: DataDomain.Scene })
        camera = new THREE.PerspectiveCamera()
        scene = new THREE.Scene()
        scene.add(camera)
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        DataManager.getInstance().set(DataKey.MainScene, scene, { domain: DataDomain.Scene })
    })

    afterEach(() => {
        coordinator?.dispose()
        coordinator = undefined
        RenderLoopRegistry.getInstance().unregister(CALLBACK_KEY)
    })

    it('does nothing until init() and a frame have run', () => {
        coordinator = new VRCategoryReferenceCoordinator()
        expect(scene.children.some(child => child instanceof Container)).toBe(false)
    })

    it('places the panel a fixed distance in front of the camera on the first update', () => {
        camera.position.set(1, 1.6, 2)
        camera.rotation.set(0, Math.PI / 2, 0)
        camera.updateWorldMatrix(true, false)

        coordinator = new VRCategoryReferenceCoordinator()
        coordinator.init()
        runUpdate(coordinator)

        const panelContainer = scene.children.find(child => child instanceof Container)!
        expect(panelContainer).toBeDefined()
        expect(panelContainer.position.distanceTo(new THREE.Vector3(1, 1.6, 2))).toBeCloseTo(1.2, 5)
    })

    it('forwards canvas events to its own panel only, never the whole scene', () => {
        coordinator = new VRCategoryReferenceCoordinator()
        coordinator.init()
        runUpdate(coordinator)

        const panelContainer = scene.children.find(child => child instanceof Container)
        expect(forwardEvents).toHaveBeenCalledTimes(1)
        expect(forwardEvents.mock.calls[0][2]).toBe(panelContainer)
    })

    it('draws no controller ray, leaving the beam to the surfaces that are being pointed at', () => {
        const raySpace = new THREE.Group()
        DataManager.getInstance().set(
            DataKey.XRControllerSource,
            { getConnectedControllers: () => [{ index: 0, targetRaySpace: raySpace }] },
            { domain: DataDomain.Scene }
        )
        coordinator = new VRCategoryReferenceCoordinator()
        coordinator.init()

        runUpdate(coordinator)

        expect(raySpace.children).toHaveLength(0)
    })

    it('does not re-place the panel on subsequent updates even if the camera moves', () => {
        camera.position.set(0, 0, 0)
        camera.updateWorldMatrix(true, false)

        coordinator = new VRCategoryReferenceCoordinator()
        coordinator.init()
        runUpdate(coordinator)

        const panelContainer = scene.children.find(child => child instanceof Container)!
        const positionAfterFirstPlacement = panelContainer.position.clone()

        camera.position.set(10, 10, 10)
        camera.updateWorldMatrix(true, false)
        runUpdate(coordinator)

        expect(panelContainer.position.equals(positionAfterFirstPlacement)).toBe(true)
    })

    it('registers and unregisters a render-loop callback across init()/dispose()', () => {
        coordinator = new VRCategoryReferenceCoordinator()
        coordinator.init()

        expect(RenderLoopRegistry.getInstance().getCount()).toBeGreaterThan(0)

        coordinator.dispose()
        coordinator = undefined

        expect((RenderLoopRegistry.getInstance() as unknown as {
            callbacks: Map<string, unknown>
        }).callbacks.has(CALLBACK_KEY)).toBe(false)
    })

    it('dispose() removes the panel from the scene', () => {
        coordinator = new VRCategoryReferenceCoordinator()
        coordinator.init()
        runUpdate(coordinator)
        expect(scene.children.some(child => child instanceof Container)).toBe(true)

        coordinator.dispose()
        coordinator = undefined

        expect(scene.children.some(child => child instanceof Container)).toBe(false)
    })

    it('does nothing (and does not throw) if no main camera is published yet', () => {
        DataManager.resetInstance()

        coordinator = new VRCategoryReferenceCoordinator()
        coordinator.init()

        expect(() => runUpdate(coordinator!)).not.toThrow()
    })
})
