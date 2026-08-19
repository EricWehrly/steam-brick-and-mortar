/**
 * VRSettingsPanelCoordinator - lifecycle/anchoring tests. A real THREE.WebGLRenderer needs an
 * actual WebGL context, unavailable under jsdom, so these tests pass a minimal stand-in exposing
 * only what the coordinator touches (domElement for forwardHtmlEvents' addEventListener calls,
 * plus the two renderer flags it sets once at init()). Real uikit Container/Slider/Text/Button
 * construct fine under jsdom (see VRDisplayAdvancedPanel.test.ts), so the panel itself is real,
 * not stubbed - only the renderer is faked.
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Container } from '@pmndrs/uikit'
import { VRSettingsPanelCoordinator } from '../../../../src/scene/uikit/VRSettingsPanelCoordinator'
import { EventManager } from '../../../../src/core/EventManager'
import { AppSettings } from '../../../../src/core/AppSettings'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { UIEventTypes, type MenuOpenEvent, type MenuCloseEvent } from '../../../../src/types/InteractionEvents'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'
import type { XRControllerRaySource, XRControllerRayInfo } from '../../../../src/webxr/XRControllerManager'

/** Reaches into the coordinator's private render-loop callback - same private-internals-cast
 *  pattern this file already uses for RenderLoopRegistry's callbacks map below. */
function runUpdate(coordinator: VRSettingsPanelCoordinator): void {
    (coordinator as unknown as { update: (now: number, deltaTime: number) => void }).update(0, 16)
}

const CALLBACK_KEY = 'VRSettingsPanelCoordinator'

function createFakeRenderer(): THREE.WebGLRenderer {
    return {
        domElement: document.createElement('canvas'),
        localClippingEnabled: false,
        setTransparentSort: () => {}
    } as unknown as THREE.WebGLRenderer
}

// jsdom's canvas doesn't implement Pointer Events capture APIs that the real forwardHtmlEvents
// depends on - stubbed out here since these tests are about lifecycle/anchoring, not real pointer
// forwarding (which needs live browser verification, per the plan's testing strategy).
function createStubForwardEvents(): () => { destroy: () => void; update: () => void } {
    return () => ({ destroy: () => {}, update: () => {} })
}

describe('VRSettingsPanelCoordinator', () => {
    let camera: THREE.PerspectiveCamera
    let scene: THREE.Scene
    let coordinator: VRSettingsPanelCoordinator | undefined

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        DataManager.resetInstance()

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

    it('stays inactive after construction and init() alone', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        expect(camera.children).toHaveLength(0)
    })

    it('activates on the pause menu opening and anchors to the camera when no grip is published', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        expect(camera.children).toHaveLength(1)
        expect(camera.children[0]).toBeInstanceOf(Container)
    })

    it('ignores MenuOpen events for a different menu type', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'debug' })

        expect(camera.children).toHaveLength(0)
    })

    it('anchors to the primary controller grip when one is published', () => {
        const grip = new THREE.Group()
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => grip
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        expect(grip.children).toHaveLength(1)
        expect(camera.children).toHaveLength(0)
    })

    it('deactivates on the pause menu closing, removing the panel from its anchor', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        expect(camera.children).toHaveLength(1)

        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })

        expect(camera.children).toHaveLength(0)
    })

    it('stays active through a menu close when forced via the URL override', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), true, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        expect(camera.children).toHaveLength(1)

        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })

        expect(camera.children).toHaveLength(1)
    })

    it('does nothing (and does not throw) if no main camera is published yet', () => {
        DataManager.resetInstance()

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        expect(() => EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })).not.toThrow()
    })

    it('registers and unregisters a render-loop callback across init()/dispose()', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        expect(RenderLoopRegistry.getInstance().getCount()).toBeGreaterThan(0)

        coordinator.dispose()
        coordinator = undefined

        expect((RenderLoopRegistry.getInstance() as unknown as {
            callbacks: Map<string, unknown>
        }).callbacks.has(CALLBACK_KEY)).toBe(false)
    })

    it('creates a controller-ray pointer (beam) for each connected controller once update() runs', () => {
        const raySpaces: XRControllerRayInfo[] = [
            { index: 0, handedness: 'left', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace },
            { index: 1, handedness: 'right', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace }
        ]
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => null,
            getControllerRaySpaces: () => raySpaces
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        runUpdate(coordinator)

        expect(raySpaces[0].raySpace.children).toHaveLength(1)
        expect(raySpaces[1].raySpace.children).toHaveLength(1)
    })

    it('tears down a controller pointer once that controller disconnects', () => {
        let raySpaces: XRControllerRayInfo[] = [
            { index: 0, handedness: 'right', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace }
        ]
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => null,
            getControllerRaySpaces: () => raySpaces
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        runUpdate(coordinator)
        const disconnectedRaySpace = raySpaces[0].raySpace
        expect(disconnectedRaySpace.children).toHaveLength(1)

        raySpaces = []
        runUpdate(coordinator)

        expect(disconnectedRaySpace.children).toHaveLength(0)
    })

    it('disposes all controller pointers when the panel deactivates', () => {
        const raySpaces: XRControllerRayInfo[] = [
            { index: 0, handedness: 'right', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace }
        ]
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => null,
            getControllerRaySpaces: () => raySpaces
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        runUpdate(coordinator)
        expect(raySpaces[0].raySpace.children).toHaveLength(1)

        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })

        expect(raySpaces[0].raySpace.children).toHaveLength(0)
    })

    it('dispose() tears down the panel and deregisters listeners', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), false, createStubForwardEvents())
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        coordinator.dispose()

        expect(camera.children).toHaveLength(0)

        // Nothing should be listening anymore.
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        expect(camera.children).toHaveLength(0)
    })
})
