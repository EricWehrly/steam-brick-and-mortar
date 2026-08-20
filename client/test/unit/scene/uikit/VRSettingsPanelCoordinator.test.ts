/**
 * VRSettingsPanelCoordinator - lifecycle/anchoring tests. A real THREE.WebGLRenderer needs an
 * actual WebGL context, unavailable under jsdom, so these tests pass a minimal stand-in exposing
 * only what the coordinator touches (domElement for forwardHtmlEvents' addEventListener calls,
 * plus the two renderer flags it sets once at init()). Real uikit Container/Slider/Text/Button
 * construct fine under jsdom (see VRDisplayAdvancedPanel.test.ts), so the panel itself is real,
 * not stubbed - only the renderer is faked.
 *
 * deactivate() hides the panel (container.visible = false) rather than removing it from the scene
 * graph - see the coordinator's own comment on why (avoiding Object3D.add()'s unconditional
 * removeFromParent()-then-add() churn on every open of the common "same anchor as last time"
 * case). So these tests check visibility, not child-array membership, once a panel has attached.
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Container } from '@pmndrs/uikit'
import { VRSettingsPanelCoordinator } from '../../../../src/scene/uikit/VRSettingsPanelCoordinator'
import { EventManager } from '../../../../src/core/EventManager'
import { AppSettings } from '../../../../src/core/AppSettings'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { UIEventTypes, type MenuOpenEvent, type MenuCloseEvent, type MenuPanelChangedEvent } from '../../../../src/types/InteractionEvents'
import { VR_MENU_TABS } from '../../../../src/scene/uikit/VRMenuTabRegistry'
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
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        expect(camera.children).toHaveLength(0)
    })

    it('activates on the pause menu opening and camera-attaches by default', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        expect(camera.children).toHaveLength(1)
        expect(camera.children[0]).toBeInstanceOf(Container)
        expect(camera.children[0].visible).toBe(true)
    })

    it('anchors to a fixed point in front of the camera, independent of the camera afterward, in world-lock mode', () => {
        camera.position.set(1, 1.6, 2)
        camera.rotation.set(0, Math.PI / 2, 0)
        camera.updateWorldMatrix(true, false)

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents(), 'world-lock')
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        const panelContainer = scene.children.find(child => child instanceof Container)!
        const positionAtOpen = panelContainer.position.clone()

        // Moving the camera afterward must not move the already-open panel - that's the entire
        // point of world-lock vs. camera/grip-attach.
        camera.position.set(5, 5, 5)
        camera.updateWorldMatrix(true, false)

        expect(panelContainer.position.equals(positionAtOpen)).toBe(true)
        expect(positionAtOpen.distanceTo(new THREE.Vector3(1, 1.6, 2))).toBeCloseTo(0.6, 5)
    })

    it('world-lock strips camera pitch, keeping the panel upright', () => {
        camera.rotation.set(Math.PI / 6, Math.PI / 4, 0.3)
        camera.updateWorldMatrix(true, false)

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents(), 'world-lock')
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        const panelContainer = scene.children.find(child => child instanceof Container)!
        const panelEuler = new THREE.Euler().setFromQuaternion(panelContainer.quaternion, 'YXZ')

        expect(panelEuler.x).toBeCloseTo(0, 5)
        expect(panelEuler.z).toBeCloseTo(0, 5)
    })

    it('ignores MenuOpen events for a different menu type', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'debug' })

        expect(camera.children).toHaveLength(0)
    })

    it('anchors to the camera when grip-attached mode has no grip published', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents(), 'grip-attached')
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        expect(camera.children).toHaveLength(1)
        expect(camera.children[0]).toBeInstanceOf(Container)
    })

    it('anchors to the primary controller grip in grip-attached mode when one is published', () => {
        const grip = new THREE.Group()
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => grip
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents(), 'grip-attached')
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        expect(grip.children).toHaveLength(1)
        expect(camera.children).toHaveLength(0)
    })

    it('keeps the same menu shell container (and its selected tab) across a close/reopen cycle', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        const otherTab = VR_MENU_TABS[1]
        EventManager.getInstance().emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: otherTab.panelId })
        const shellContainerAtFirstOpen = camera.children[0]

        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        const shellContainerAtReopen = camera.children[0]

        // Same object identity - the shell itself is long-lived (constructed once, not
        // per-activation), and its container stays parented throughout (only visibility toggles).
        expect(shellContainerAtReopen).toBe(shellContainerAtFirstOpen)
    })

    it('deactivates on the pause menu closing by hiding the panel, not removing it from its anchor', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        expect(camera.children).toHaveLength(1)
        expect(camera.children[0].visible).toBe(true)

        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })

        expect(camera.children).toHaveLength(1)
        expect(camera.children[0].visible).toBe(false)
    })

    it('re-shows the same container (visible again) on reactivation rather than reparenting', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        expect(camera.children).toHaveLength(1)
        expect(camera.children[0].visible).toBe(true)
    })

    it('does nothing (and does not throw) if no main camera is published yet', () => {
        DataManager.resetInstance()

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())

        expect(() => EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })).not.toThrow()
    })

    it('registers and unregisters a render-loop callback across init()/dispose()', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
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
            { index: 0, handedness: 'left', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace, triggerValue: 1 },
            { index: 1, handedness: 'right', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace, triggerValue: 1 }
        ]
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => null,
            getControllerRaySpaces: () => raySpaces
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        runUpdate(coordinator)

        expect(raySpaces[0].raySpace.children).toHaveLength(1)
        expect(raySpaces[1].raySpace.children).toHaveLength(1)
    })

    it('tears down a controller pointer once that controller disconnects', () => {
        let raySpaces: XRControllerRayInfo[] = [
            { index: 0, handedness: 'right', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace, triggerValue: 1 }
        ]
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => null,
            getControllerRaySpaces: () => raySpaces
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
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
            { index: 0, handedness: 'right', raySpace: new THREE.Group() as unknown as THREE.XRTargetRaySpace, triggerValue: 1 }
        ]
        const raySource: XRControllerRaySource = {
            getPrimaryControllerRay: () => null,
            getPrimaryControllerGrip: () => null,
            getControllerRaySpaces: () => raySpaces
        }
        DataManager.getInstance().set(DataKey.XRControllerRaySource, raySource, { domain: DataDomain.Scene })

        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        runUpdate(coordinator)
        expect(raySpaces[0].raySpace.children).toHaveLength(1)

        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })

        expect(raySpaces[0].raySpace.children).toHaveLength(0)
    })

    it('dispose() hides the panel and deregisters listeners', () => {
        coordinator = new VRSettingsPanelCoordinator(EventManager.getInstance(), AppSettings.getInstance(), createStubForwardEvents())
        coordinator.init(createFakeRenderer())
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        coordinator.dispose()

        expect(camera.children[0].visible).toBe(false)

        // Nothing should be listening anymore.
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        expect(camera.children[0].visible).toBe(false)
    })
})
