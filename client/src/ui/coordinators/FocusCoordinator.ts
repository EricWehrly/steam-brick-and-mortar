/**
 * FocusCoordinator
 *
 * Tracks browser tab/window focus state via the Page Visibility API and
 * window focus/blur events. On focus loss: pauses the render loop. On focus
 * gain: resumes. Emits AppEventTypes.VisibilityChanged for any other systems
 * that need to respond (e.g. PerformanceMonitorUI pausing its own RAF loop).
 *
 * Visual feedback on blur:
 * A frosted-glass / VHS-scanline overlay over the Three.js canvas could go here.
 * The CSS hook point is setBlurOverlay(true/false); window.toggleSceneBlur()
 * toggles it from the console. Currently no overlay is shown on focus loss —
 * add the visual treatment to .scene-blur-overlay in scene-blur-overlay.css,
 * or hook a Three.js post-processing pass off isAppFocused() for a VHS look.
 */

import { EventManager } from '../../core/EventManager'
import { AppEventTypes } from '../../types/InteractionEvents'
import type { VisibilityChangedEvent } from '../../types/InteractionEvents'

const BLUR_CLASS = 'scene-blurred'
const BLUR_OVERLAY_ID = 'scene-blur-overlay'

export class FocusCoordinator {
    private readonly eventManager = EventManager.getInstance()
    private isFocused: boolean = !document.hidden
    private readonly blurOverlay: HTMLElement

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

    constructor() {
        const overlay = document.createElement('div')
        overlay.id = BLUR_OVERLAY_ID
        overlay.className = 'scene-blur-overlay'
        document.body.appendChild(overlay)
        this.blurOverlay = overlay
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

        this.blurOverlay.classList.remove(BLUR_CLASS)
    }

    private handleFocusChanged(focused: boolean, source: 'visibilitychange' | 'window-focus' | 'window-blur'): void {
        console.debug(`[FocusCoordinator] Focus ${focused ? 'GAINED' : 'LOST'} — source: ${source}`)
        this.blurOverlay.classList.toggle(BLUR_CLASS, !focused)
        this.eventManager.emit<VisibilityChangedEvent>(
            AppEventTypes.VisibilityChanged,
            { visible: focused, visibilitySource: source }
        )
    }

    private registerDebugHelpers(): void {
        if (typeof window === 'undefined') return
        const self = this
        ;(window as unknown as Record<string, unknown>).toggleSceneBlur = () => {
            const active = self.blurOverlay.classList.toggle(BLUR_CLASS)
            console.debug(`[FocusCoordinator] Blur overlay ${active ? 'ON' : 'OFF'}`)
            return active
        }
    }
}
