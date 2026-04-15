/**
 * VisibilityCoordinator
 *
 * Tracks browser tab/window focus state via the Page Visibility API and
 * window focus/blur events. Emits AppEventTypes visibility events and logs
 * focus changes. Exposes a window.toggleSceneBlur() debug helper that
 * applies a CSS glass/blur overlay over the Three.js canvas.
 *
 * This is the foundation for background resource reduction (render throttle,
 * LOD drop on blur). The throttle/LOD logic lives in separate coordinators
 * that subscribe to the events this class fires.
 */

import { EventManager } from '../../core/EventManager'
import { AppEventTypes } from '../../types/InteractionEvents'
import type { VisibilityChangedEvent } from '../../types/InteractionEvents'

const BLUR_OVERLAY_ID = 'scene-blur-overlay'

export class VisibilityCoordinator {
    private readonly eventManager: EventManager
    private isVisible: boolean = !document.hidden
    private blurOverlay: HTMLElement | null = null

    private readonly onVisibilityChange = (): void => {
        const nowVisible = !document.hidden
        if (nowVisible === this.isVisible) return
        this.isVisible = nowVisible
        this.handleVisibilityChanged(nowVisible, 'visibilitychange')
    }

    private readonly onWindowFocus = (): void => {
        if (this.isVisible) return  // already tracked as visible
        this.isVisible = true
        this.handleVisibilityChanged(true, 'window-focus')
    }

    private readonly onWindowBlur = (): void => {
        if (!this.isVisible) return  // already tracked as hidden
        this.isVisible = false
        this.handleVisibilityChanged(false, 'window-blur')
    }

    constructor(eventManager: EventManager) {
        this.eventManager = eventManager
    }

    init(): void {
        document.addEventListener('visibilitychange', this.onVisibilityChange)
        window.addEventListener('focus', this.onWindowFocus)
        window.addEventListener('blur', this.onWindowBlur)

        this.registerDebugHelpers()

        console.debug('[VisibilityCoordinator] Initialized — tab is currently', this.isVisible ? 'visible' : 'hidden')
    }

    dispose(): void {
        document.removeEventListener('visibilitychange', this.onVisibilityChange)
        window.removeEventListener('focus', this.onWindowFocus)
        window.removeEventListener('blur', this.onWindowBlur)

        this.setBlurOverlay(false)
    }

    isTabVisible(): boolean {
        return this.isVisible
    }

    // -------------------------------------------------------------------------
    // Blur overlay — glass/frosted effect over the Three.js canvas
    // -------------------------------------------------------------------------

    setBlurOverlay(enabled: boolean): void {
        if (enabled) {
            if (this.blurOverlay) return  // already shown
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

    private handleVisibilityChanged(visible: boolean, source: 'visibilitychange' | 'window-focus' | 'window-blur'): void {
        const label = visible ? 'VISIBLE (focus)' : 'HIDDEN (blur)'
        console.debug(`[VisibilityCoordinator] Tab ${label} — source: ${source}`)

        this.eventManager.emit<VisibilityChangedEvent>(
            AppEventTypes.VisibilityChanged,
            { visible, visibilitySource: source }
        )
    }

    private registerDebugHelpers(): void {
        if (typeof window === 'undefined') return
        const self = this
        ;(window as unknown as Record<string, unknown>).toggleSceneBlur = () => {
            const active = self.toggleBlurOverlay()
            console.debug(`[VisibilityCoordinator] Blur overlay ${active ? 'ON' : 'OFF'}`)
            return active
        }
    }
}
