/**
 * FocusCoordinator
 *
 * Tracks browser tab/window focus state via the Page Visibility API and
 * window focus/blur events. On focus loss: pauses the render loop and
 * optionally shows a blur overlay. On focus gain: resumes. Emits
 * AppEventTypes.VisibilityChanged for any other systems that care.
 *
 * Exposes window.toggleSceneBlur() as a dev-console debug helper.
 */

import { EventManager } from '../../core/EventManager'
import { AppEventTypes } from '../../types/InteractionEvents'
import type { VisibilityChangedEvent } from '../../types/InteractionEvents'
import type { SceneManager } from '../../scene/SceneManager'

const BLUR_OVERLAY_ID = 'scene-blur-overlay'

export class FocusCoordinator {
    private readonly eventManager: EventManager
    private readonly sceneManager: SceneManager
    private isFocused: boolean = !document.hidden
    private blurOverlay: HTMLElement | null = null

    private readonly onVisibilityChange = (): void => {
        const nowFocused = !document.hidden
        if (nowFocused === this.isFocused) return
        this.isFocused = nowFocused
        this.handleFocusChanged(nowFocused, 'visibilitychange')
    }

    private readonly onWindowFocus = (): void => {
        if (this.isFocused) return
        this.isFocused = true
        this.handleFocusChanged(true, 'window-focus')
    }

    private readonly onWindowBlur = (): void => {
        if (!this.isFocused) return
        this.isFocused = false
        this.handleFocusChanged(false, 'window-blur')
    }

    constructor(eventManager: EventManager, sceneManager: SceneManager) {
        this.eventManager = eventManager
        this.sceneManager = sceneManager
    }

    init(): void {
        document.addEventListener('visibilitychange', this.onVisibilityChange)
        window.addEventListener('focus', this.onWindowFocus)
        window.addEventListener('blur', this.onWindowBlur)

        this.registerDebugHelpers()

        console.debug('[FocusCoordinator] Initialized — tab is currently', this.isFocused ? 'focused' : 'blurred')
    }

    dispose(): void {
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
        window.removeEventListener('focus', this.onWindowFocus)
        window.removeEventListener('blur', this.onWindowBlur)

        this.setBlurOverlay(false)
    }

    isAppFocused(): boolean {
        return this.isFocused
    }

    // -------------------------------------------------------------------------
    // Blur overlay — glass/frosted effect over the Three.js canvas
    // -------------------------------------------------------------------------

    setBlurOverlay(enabled: boolean): void {
        if (enabled) {
            if (this.blurOverlay) return
            const overlay = document.createElement('div')
            overlay.id = BLUR_OVERLAY_ID
            overlay.className = 'scene-blur-overlay'
            document.body.appendChild(overlay)
            this.blurOverlay = overlay
        } else {
            this.blurOverlay?.remove()
            this.blurOverlay = null
        }
    }

    toggleBlurOverlay(): boolean {
        const next = !this.blurOverlay
        this.setBlurOverlay(next)
        return next
    }

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    private handleFocusChanged(focused: boolean, source: 'visibilitychange' | 'window-focus' | 'window-blur'): void {
        if (focused) {
            console.debug(`[FocusCoordinator] Focus GAINED — source: ${source}`)
            this.sceneManager.resumeRenderLoop()
            this.setBlurOverlay(false)
        } else {
            console.debug(`[FocusCoordinator] Focus LOST — source: ${source}`)
            this.sceneManager.pauseRenderLoop()
            this.setBlurOverlay(true)
        }

        this.eventManager.emit<VisibilityChangedEvent>(
            AppEventTypes.VisibilityChanged,
            { visible: focused, visibilitySource: source }
        )
    }

    private registerDebugHelpers(): void {
        if (typeof window === 'undefined') return
        const self = this
        ;(window as unknown as Record<string, unknown>).toggleSceneBlur = () => {
            const active = self.toggleBlurOverlay()
            console.debug(`[FocusCoordinator] Blur overlay ${active ? 'ON' : 'OFF'}`)
            return active
        }
    }
}
