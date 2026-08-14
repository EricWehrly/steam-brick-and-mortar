/**
 * SettingsPanelProjector - projects the real #pause-menu-overlay DOM node onto a plane via
 * CSS3DRenderer, parented to the main camera. CSS3DRenderer/CSS3DObject are pure DOM (no WebGL),
 * so real instances run fine under jsdom - no mocking needed for them.
 */

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { SettingsPanelProjector } from '../../../../src/scene/css3d/SettingsPanelProjector'
import { EventManager } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { WebXREventTypes } from '../../../../src/types/InteractionEvents'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'

const PANEL_ID = 'pause-menu-overlay'
const CALLBACK_KEY = 'SettingsPanelProjector'

function createPanelElement(): HTMLElement {
    const panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.style.width = '100vw'
    panel.style.height = '100vh'
    document.body.appendChild(panel)
    return panel
}

// No public API to trigger a render frame - reach into the registry's internal map, same
// pattern LiminalBoundaryTracker.test.ts uses.
function getFrameCallback(): (now: number, deltaTime: number) => void {
    return (RenderLoopRegistry.getInstance() as unknown as {
        callbacks: Map<string, (now: number, deltaTime: number) => void>
    }).callbacks.get(CALLBACK_KEY)!
}

function renderFrame(): void {
    getFrameCallback()(0, 0)
}

describe('SettingsPanelProjector', () => {
    let camera: THREE.PerspectiveCamera
    let scene: THREE.Scene
    let projector: SettingsPanelProjector | undefined

    beforeEach(() => {
        document.body.innerHTML = ''
        EventManager.getInstance().removeAllListeners()
        DataManager.resetInstance()

        camera = new THREE.PerspectiveCamera()
        scene = new THREE.Scene()
        scene.add(camera)
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
        DataManager.getInstance().set(DataKey.MainScene, scene, { domain: DataDomain.Scene })
    })

    afterEach(() => {
        projector?.dispose()
        projector = undefined
        RenderLoopRegistry.getInstance().unregister(CALLBACK_KEY)
        document.body.innerHTML = ''
    })

    it('stays inactive after construction and init() alone', () => {
        createPanelElement()
        projector = new SettingsPanelProjector(EventManager.getInstance(), false)
        projector.init()

        const panel = document.getElementById(PANEL_ID)!
        expect(panel.parentNode).toBe(document.body)
        expect(camera.children).toHaveLength(0)
    })

    it('activates on WebXR session start: wraps the panel and applies fixed pixel sizing', () => {
        createPanelElement()
        projector = new SettingsPanelProjector(EventManager.getInstance(), false)
        projector.init()

        EventManager.getInstance().emit(WebXREventTypes.SessionStart, {})

        expect(camera.children).toHaveLength(1)
        expect(camera.children[0]).toBeInstanceOf(CSS3DObject)

        const panel = document.getElementById(PANEL_ID)!
        expect(panel.style.width).toBe('900px')
        expect(panel.style.height).toBe('650px')
    })

    it('moves the panel into the CSS3D DOM layer once a frame renders', () => {
        const panel = createPanelElement()
        projector = new SettingsPanelProjector(EventManager.getInstance(), false)
        projector.init()

        EventManager.getInstance().emit(WebXREventTypes.SessionStart, {})
        expect(panel.parentNode).toBe(document.body)

        renderFrame()

        expect(panel.parentNode).not.toBe(document.body)
    })

    it('restores the panel to its original parent and inline style on session end', () => {
        const panel = createPanelElement()
        projector = new SettingsPanelProjector(EventManager.getInstance(), false)
        projector.init()

        EventManager.getInstance().emit(WebXREventTypes.SessionStart, {})
        renderFrame()
        expect(panel.parentNode).not.toBe(document.body)

        EventManager.getInstance().emit(WebXREventTypes.SessionEnd, {})

        expect(panel.parentNode).toBe(document.body)
        expect(panel.style.width).toBe('100vw')
        expect(panel.style.height).toBe('100vh')
        expect(camera.children).toHaveLength(0)
    })

    it('stays active through a session end when forced via the URL override', () => {
        createPanelElement()
        projector = new SettingsPanelProjector(EventManager.getInstance(), true)
        projector.init()

        expect(camera.children).toHaveLength(1)

        EventManager.getInstance().emit(WebXREventTypes.SessionEnd, {})

        expect(camera.children).toHaveLength(1)
    })

    it('does nothing (and does not throw) if no main camera is published yet', () => {
        DataManager.resetInstance()
        createPanelElement()
        projector = new SettingsPanelProjector(EventManager.getInstance(), false)
        projector.init()

        expect(() => EventManager.getInstance().emit(WebXREventTypes.SessionStart, {})).not.toThrow()

        const panel = document.getElementById(PANEL_ID)!
        expect(panel.parentNode).toBe(document.body)
    })

    it('does nothing (and does not throw) if the pause menu overlay is not in the DOM', () => {
        projector = new SettingsPanelProjector(EventManager.getInstance(), false)
        projector.init()

        expect(() => EventManager.getInstance().emit(WebXREventTypes.SessionStart, {})).not.toThrow()
        expect(camera.children).toHaveLength(0)
    })

    it('dispose() tears down the CSS3D layer, restores the panel, and deregisters listeners', () => {
        const panel = createPanelElement()
        projector = new SettingsPanelProjector(EventManager.getInstance(), false)
        projector.init()
        EventManager.getInstance().emit(WebXREventTypes.SessionStart, {})
        renderFrame()

        projector.dispose()

        expect(panel.parentNode).toBe(document.body)
        expect(camera.children).toHaveLength(0)

        // Nothing should be listening anymore.
        EventManager.getInstance().emit(WebXREventTypes.SessionStart, {})
        expect(camera.children).toHaveLength(0)
    })
})
