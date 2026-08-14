/**
 * Settings Panel Projector - projects the real settings/pause menu DOM onto a plane in the
 * 3D scene via THREE.CSS3DRenderer, instead of the normal flatscreen page overlay.
 *
 * Exploratory: per docs/plans/css3d-panel-projection-spike.md, CSS3D content never reaches
 * XRWebGLLayer, so this is NOT expected to be visible in an actual immersive WebXR session -
 * activating on WebXREventTypes.SessionStart is a deliberate "try it and see" step, not a claim
 * that this fixes VR visibility. The ?forceSettingsPanelProjection=1 override exists specifically
 * to preview the projection outside a headset, where it CAN be seen (flatscreen 3D view).
 */

import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { EventManager } from '../../core/EventManager'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { WebXREventTypes } from '../../types/InteractionEvents'
import { UrlUtils } from '../../utils/UrlUtils'
import { RenderLoopRegistry } from '../RenderLoopRegistry'

const PANEL_ELEMENT_ID = 'pause-menu-overlay'

// Same "held in front of the viewer" offset convention GameBoxFoldCoordinator anchors its box
// to (CAMERA_LOCAL_OFFSET there) - not imported from it since that constant is module-private,
// but deliberately kept in parity.
const PANEL_LOCAL_OFFSET = new THREE.Vector3(0, 0, -0.6)

// The real pause menu template sizes itself with 100vw/100vh, which doesn't respect CSS3D's
// transform-faked 3D viewport (confirmed in css3d-panel-projection-spike.md) - fixed pixel
// overrides make it legible once projected. Restored on deactivate.
const PROJECTED_PANEL_WIDTH_PX = 900
const PROJECTED_PANEL_HEIGHT_PX = 650

export class SettingsPanelProjector {
    private readonly eventManager: EventManager
    private readonly forceEnabled: boolean
    private cssRenderer: CSS3DRenderer | null = null
    private cssObject: CSS3DObject | null = null
    private panelElement: HTMLElement | null = null
    private panelOriginalParent: Node | null = null
    private panelOriginalNextSibling: Node | null = null
    private panelOriginalStyleCssText = ''
    private active = false
    private resolvedScene: THREE.Scene | null = null
    private resolvedCamera: THREE.Camera | null = null

    constructor(eventManager: EventManager, forceEnabled: boolean = UrlUtils.isSettingsPanelProjectionForced()) {
        this.eventManager = eventManager
        this.forceEnabled = forceEnabled

        this.eventManager.registerEventHandler(WebXREventTypes.SessionStart, this.handleSessionStart)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionEnd, this.handleSessionEnd)
    }

    init(): void {
        this.cssRenderer = new CSS3DRenderer()
        this.cssRenderer.setSize(window.innerWidth, window.innerHeight)
        Object.assign(this.cssRenderer.domElement.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            pointerEvents: 'none'
        })
        document.body.appendChild(this.cssRenderer.domElement)

        window.addEventListener('resize', this.handleWindowResize)
        RenderLoopRegistry.getInstance().register(this.constructor.name, this.update)

        if (this.forceEnabled) {
            this.activate()
        }
    }

    private readonly handleSessionStart = (): void => {
        this.activate()
    }

    private readonly handleSessionEnd = (): void => {
        // The override is meant to keep the projection visible for flatscreen preview
        // regardless of session state, so a real session ending shouldn't tear it back down.
        if (!this.forceEnabled) {
            this.deactivate()
        }
    }

    private readonly handleWindowResize = (): void => {
        this.cssRenderer?.setSize(window.innerWidth, window.innerHeight)
    }

    private getScene(): THREE.Scene | null {
        this.resolvedScene ??= DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene) ?? null
        return this.resolvedScene
    }

    private getCamera(): THREE.Camera | null {
        this.resolvedCamera ??= DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
        return this.resolvedCamera
    }

    private activate(): void {
        if (this.active) {
            return
        }

        const camera = this.getCamera()
        if (!camera) {
            console.warn('SettingsPanelProjector: no main camera published yet, skipping activation')
            return
        }

        const panel = document.getElementById(PANEL_ELEMENT_ID)
        if (!panel) {
            console.warn('SettingsPanelProjector: pause menu overlay not found yet, skipping activation')
            return
        }

        this.panelElement = panel
        this.panelOriginalParent = panel.parentNode
        this.panelOriginalNextSibling = panel.nextSibling
        this.panelOriginalStyleCssText = panel.style.cssText

        panel.style.width = `${PROJECTED_PANEL_WIDTH_PX}px`
        panel.style.height = `${PROJECTED_PANEL_HEIGHT_PX}px`

        this.cssObject = new CSS3DObject(panel)
        this.cssObject.position.copy(PANEL_LOCAL_OFFSET)
        camera.add(this.cssObject)

        this.active = true
    }

    private deactivate(): void {
        if (!this.active) {
            return
        }

        this.cssObject?.removeFromParent()
        this.cssObject = null

        if (this.panelElement) {
            this.panelElement.style.cssText = this.panelOriginalStyleCssText
            this.panelOriginalParent?.insertBefore(this.panelElement, this.panelOriginalNextSibling)
        }
        this.panelElement = null
        this.panelOriginalParent = null
        this.panelOriginalNextSibling = null

        this.active = false
    }

    private readonly update = (): void => {
        if (!this.active || !this.cssRenderer) {
            return
        }

        const scene = this.getScene()
        const camera = this.getCamera()
        if (!scene || !camera) {
            return
        }

        this.cssRenderer.render(scene, camera)
    }

    dispose(): void {
        this.deactivate()

        window.removeEventListener('resize', this.handleWindowResize)
        RenderLoopRegistry.getInstance().unregister(this.constructor.name)

        this.eventManager.deregisterEventHandler(WebXREventTypes.SessionStart, this.handleSessionStart)
        this.eventManager.deregisterEventHandler(WebXREventTypes.SessionEnd, this.handleSessionEnd)

        this.cssRenderer?.domElement.remove()
        this.cssRenderer = null
    }
}
