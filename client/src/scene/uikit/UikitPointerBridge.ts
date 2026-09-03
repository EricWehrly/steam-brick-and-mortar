/**
 * Everything one uikit root needs to be *interactive*, in one place: real hover/click/scroll from
 * DOM mouse and wheel events on the renderer canvas (flatscreen), and one ray pointer per connected
 * WebXR controller (VR). Both drive the same @pmndrs/pointer-events pipeline, so a uikit tree's own
 * onClick/overflow:'scroll' handling is the only thing either surface talks to - no raycast-to-UV
 * hit-testing, no remembered rectangles, no per-control coordinate math.
 *
 * Controller pointers are reconciled every frame rather than created/destroyed around
 * 'connected'/'disconnected' events, mirroring XRControllerManager.update()'s own self-healing
 * controller-model pruning - correct regardless of controllers appearing or vanishing mid-session.
 *
 * Scoped to one root because that's what pointer-events wants to intersect against. A second
 * interactive uikit surface gets its own bridge.
 */

import * as THREE from 'three'
import { reversePainterSortStable } from '@pmndrs/uikit'
import { forwardHtmlEvents } from '@pmndrs/pointer-events'
import type { ForwardEventsOptions } from '@pmndrs/pointer-events'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import type { XRControllerSource } from '../../webxr/XRControllerManager'
import { VRControllerPointer } from './VRControllerPointer'

/** Matches forwardHtmlEvents' own signature - injectable so tests can avoid it entirely: jsdom's
 *  canvas doesn't implement the Pointer Events capture APIs (setPointerCapture/...) it depends on,
 *  so a real call throws under jsdom however faithfully the renderer stand-in is built. */
export type ForwardEventsFn = (
    fromElement: HTMLElement,
    getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera,
    scene: THREE.Object3D,
    options?: ForwardEventsOptions
) => { destroy: () => void; update: () => void }

export class UikitPointerBridge {
    private readonly controllerPointers = new Map<number, VRControllerPointer>()
    private forwardedEvents: { update: () => void; destroy: () => void } | null = null
    private attached = false
    // TEMPORARY - remove once flatscreen wheel-scroll is confirmed working or its real cause is
    // found (direct request, 2026-09-02: "write some temporary diagnostics for us to get to the
    // bottom of it" - flatscreen mouse-wheel scroll over the debug face's cache-entry viewport
    // produces no visible scroll and no console output at all - round two: still no output, so
    // this is now a plain console.log rather than Logger.debug(), which needed an easy-to-miss
    // setLogLevel(...) console command first).
    private rawWheelListener: ((event: WheelEvent) => void) | null = null
    private wheelListenerElement: HTMLElement | null = null

    constructor(
        private readonly intersectRoot: THREE.Object3D,
        private readonly forwardEvents: ForwardEventsFn = forwardHtmlEvents
    ) {}

    /** Starts routing input at this root. Safe to call repeatedly; a call before the renderer/
     *  scene/camera exist simply doesn't attach, so the caller can retry next frame. */
    attach(): void {
        if (this.attached) {
            return
        }
        const renderer = DataManager.getInstance().get<THREE.WebGLRenderer>(DataKey.Renderer) ?? null
        const scene = this.getScene()
        const camera = this.getCamera()
        if (!renderer || !scene || !camera) {
            return
        }

        // Both required by uikit for correct panel transparency/ordering - see the vanilla usage
        // example in @pmndrs/uikit's own README. Global renderer flags, safe to set repeatedly.
        renderer.localClippingEnabled = true
        renderer.setTransparentSort(reversePainterSortStable)

        this.forwardedEvents = this.forwardEvents(renderer.domElement, () => camera as THREE.PerspectiveCamera, scene)
        this.attached = true
        // eslint-disable-next-line no-console
        console.log('[UikitPointerBridge TEMP DIAGNOSTIC] attached to renderer.domElement', {
            canvasSize: [renderer.domElement.width, renderer.domElement.height]
        })

        // TEMPORARY - see the field's own doc comment. Independent of forwardHtmlEvents entirely:
        // this only tells us whether the raw browser 'wheel' event reaches the canvas at all,
        // ruling in/out anything upstream (focus, another element capturing the event, CSS
        // pointer-events) before even considering uikit/pointer-events' own handling of it.
        this.rawWheelListener = (event: WheelEvent) => {
            // eslint-disable-next-line no-console
            console.log('[UikitPointerBridge TEMP DIAGNOSTIC] raw wheel event reached the canvas', {
                deltaY: event.deltaY,
                clientX: event.clientX,
                clientY: event.clientY
            })
        }
        this.wheelListenerElement = renderer.domElement
        // passive: true - this listener only reads the event, never calls preventDefault(); the
        // violation warning without it was drowning out the one console line this is actually
        // trying to produce.
        this.wheelListenerElement.addEventListener('wheel', this.rawWheelListener, { passive: true })
    }

    /** Call once per frame while attached, before or after the root's own update(). */
    update(): void {
        if (!this.attached) {
            return
        }
        this.forwardedEvents?.update()

        const scene = this.getScene()
        const camera = this.getCamera()
        if (!scene || !camera) {
            return
        }
        for (const pointer of this.syncControllerPointers(scene, camera)) {
            pointer.update()
        }
    }

    detach(): void {
        this.forwardedEvents?.destroy()
        this.forwardedEvents = null

        if (this.rawWheelListener && this.wheelListenerElement) {
            this.wheelListenerElement.removeEventListener('wheel', this.rawWheelListener)
        }
        this.rawWheelListener = null
        this.wheelListenerElement = null

        for (const pointer of this.controllerPointers.values()) {
            pointer.dispose()
        }
        this.controllerPointers.clear()

        this.attached = false
    }

    private syncControllerPointers(scene: THREE.Scene, camera: THREE.Camera): ReadonlyArray<VRControllerPointer> {
        const controllerSource = DataManager.getInstance().get<XRControllerSource>(DataKey.XRControllerSource) ?? null
        const connected = controllerSource?.getConnectedControllers?.() ?? []
        const connectedIndices = new Set(connected.map(entry => entry.index))

        for (const [index, pointer] of this.controllerPointers) {
            if (!connectedIndices.has(index)) {
                pointer.dispose()
                this.controllerPointers.delete(index)
            }
        }

        return connected.map(({ index, targetRaySpace }) => {
            let pointer = this.controllerPointers.get(index)
            if (!pointer) {
                pointer = new VRControllerPointer({
                    raySpace: targetRaySpace,
                    getCamera: () => camera as THREE.PerspectiveCamera,
                    intersectRoot: this.intersectRoot,
                    scene
                })
                this.controllerPointers.set(index, pointer)
            }
            return pointer
        })
    }

    private getScene(): THREE.Scene | null {
        return DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene) ?? null
    }

    private getCamera(): THREE.Camera | null {
        return DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
    }
}
