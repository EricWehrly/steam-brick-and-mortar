/**
 * System UI Coordinator - Pointer Lock Wiring
 *
 * Pointer lock should engage when the pause menu closes (if enabled in
 * settings and no XR session is active) and release when it opens - the
 * cursor must be free to use the menu itself, and a gamepad-bound OpenMenu
 * press doesn't touch Escape at all so the browser won't auto-unlock it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { SystemUICoordinator } from '../../../src/ui/coordinators/SystemUICoordinator'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
import { WebXREventTypes } from '../../../src/types/InteractionEvents'

interface CapturedPauseMenuCallbacks {
    onMenuOpen?: () => void
    onMenuClose?: () => void
}

let lastPauseMenuManager: { callbacks: CapturedPauseMenuCallbacks } | undefined

// vi.hoisted keeps this Map alive before vi.mock factories run - a plain module-scope
// `let` here hits a TDZ ReferenceError, because SceneClickGameBoxRaycast's real (unmocked)
// GameFinder dependency calls EventManager.getInstance().registerEventHandler() as an
// import-time side effect, before this file's own body would otherwise initialize it.
const { registeredHandlers } = vi.hoisted(() => ({
    registeredHandlers: new Map<string, (event: unknown) => void>()
}))

vi.mock('../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            emit: vi.fn(),
            registerEventHandler: vi.fn((eventType: string, handler: (event: unknown) => void) => {
                registeredHandlers.set(eventType, handler)
            }),
            deregisterEventHandler: vi.fn()
        })
    },
    EventSource: {
        UI: 'ui',
        ManagedLight: 'managed-light'
    }
}))

vi.mock('../../../src/ui/pause/PauseMenuManager', () => ({
    PauseMenuManager: class {
        callbacks: CapturedPauseMenuCallbacks

        constructor(_config: unknown, callbacks: CapturedPauseMenuCallbacks) {
            this.callbacks = callbacks
            lastPauseMenuManager = this
        }

        init() {}
        setSystemDependencies() {}
        registerDefaultPanels() {}
        dispose() {}
    }
}))

vi.mock('../../../src/ui/PerformanceMonitor', () => ({
    PerformanceMonitorUI: class {
        start() {}
        dispose() {}
        updateRenderStats() {}
    }
}))

vi.mock('../../../src/ui/LightingControlsPanel', () => ({
    LightingControlsPanel: class {
        show() {}
        hide() {}
        toggle() {}
        dispose() {}
    }
}))

function makeMockRenderer(
    requestPointerLock: ReturnType<typeof vi.fn<(options?: PointerLockOptions) => Promise<void>>>
): { domElement: HTMLCanvasElement } {
    const domElement = document.createElement('canvas')
    domElement.requestPointerLock = requestPointerLock
    return { domElement } as unknown as { domElement: HTMLCanvasElement }
}

describe('SystemUICoordinator pointer lock wiring', () => {
    let systemCoordinator: SystemUICoordinator
    let appSettings: AppSettings
    let requestPointerLock: ReturnType<typeof vi.fn<(options?: PointerLockOptions) => Promise<void>>>
    let exitPointerLock: ReturnType<typeof vi.fn<() => void>>

    beforeEach(async () => {
        document.body.innerHTML = ''
        registeredHandlers.clear()
        lastPauseMenuManager = undefined

        appSettings = AppSettings.getInstance()
        appSettings.setSetting('inputMouseLockEnabled', true)

        requestPointerLock = vi.fn<(options?: PointerLockOptions) => Promise<void>>().mockResolvedValue(undefined)
        // jsdom doesn't implement Pointer Lock at all - document.exitPointerLock doesn't
        // exist as a real property, so it must be assigned directly rather than spied on.
        exitPointerLock = vi.fn<() => void>()
        document.exitPointerLock = exitPointerLock

        systemCoordinator = new SystemUICoordinator(EventManager.getInstance(), appSettings)
        await systemCoordinator.init(makeMockRenderer(requestPointerLock) as unknown as THREE.WebGLRenderer)
    })

    afterEach(() => {
        systemCoordinator?.dispose()
        document.body.innerHTML = ''
    })

    it('requests pointer lock on the canvas when the menu closes and the setting is enabled', () => {
        lastPauseMenuManager!.callbacks.onMenuClose?.()

        expect(requestPointerLock).toHaveBeenCalledTimes(1)
    })

    it('does not request pointer lock when the setting is disabled', () => {
        appSettings.setSetting('inputMouseLockEnabled', false)

        lastPauseMenuManager!.callbacks.onMenuClose?.()

        expect(requestPointerLock).not.toHaveBeenCalled()
    })

    it('does not request pointer lock while an XR session is active', () => {
        registeredHandlers.get(WebXREventTypes.SessionStart)?.({})

        lastPauseMenuManager!.callbacks.onMenuClose?.()

        expect(requestPointerLock).not.toHaveBeenCalled()
    })

    it('resumes requesting pointer lock after the XR session ends', () => {
        registeredHandlers.get(WebXREventTypes.SessionStart)?.({})
        registeredHandlers.get(WebXREventTypes.SessionEnd)?.({})

        lastPauseMenuManager!.callbacks.onMenuClose?.()

        expect(requestPointerLock).toHaveBeenCalledTimes(1)
    })

    it('releases pointer lock when the menu opens', () => {
        lastPauseMenuManager!.callbacks.onMenuOpen?.()

        expect(exitPointerLock).toHaveBeenCalledTimes(1)
    })
})
