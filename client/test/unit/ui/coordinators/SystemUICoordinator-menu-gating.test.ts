/**
 * SystemUICoordinator.handleMenuOpen/handleMenuClose - regression for a real bug: these were
 * unconditionally calling pauseMenuManager.open()/close() for ANY UIEventTypes.MenuOpen/MenuClose,
 * not just the DOM pause menu's own ('pause'). Once GameBoxFoldCoordinator started emitting the
 * same event with menuType:'game-box' (so world raycasting/camera movement stand down while a box
 * is open), this handler popped the real pause menu open behind it too - direct request
 * (2026-09-02): "why does the settings menu open when I open a game box?"
 *
 * PauseMenuManager now owns opening/closing itself and emits this event directly (PR review
 * request, 2026-09-03) - handleMenuOpen/handleMenuClose no longer call .open()/.close() at all
 * (that would just be redundant), only pointer-lock and reticle-visibility side effects, still
 * filtered to 'pause' - so the observable regression check here is pointer-lock, not a spy on
 * PauseMenuManager's own methods.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { SystemUICoordinator } from '../../../../src/ui/coordinators/SystemUICoordinator'
import { EventManager } from '../../../../src/core/EventManager'
import { AppSettings } from '../../../../src/core/AppSettings'
import { UIEventTypes, type MenuOpenEvent, type MenuCloseEvent } from '../../../../src/types/InteractionEvents'

vi.mock('../../../../src/ui/pause/PauseMenuManager', () => ({
    PauseMenuManager: class {
        init() {}
        setSystemDependencies() {}
        registerDefaultPanels() {}
        isOpen() { return false }
        dispose() {}
    }
}))

vi.mock('../../../../src/ui/PerformanceMonitor', () => ({
    PerformanceMonitorUI: class { start() {}; dispose() {}; updateRenderStats() {} }
}))

vi.mock('../../../../src/ui/LightingControlsPanel', () => ({
    LightingControlsPanel: class { show() {}; hide() {}; toggle() {}; dispose() {} }
}))

function makeMockRenderer(
    requestPointerLock: ReturnType<typeof vi.fn<(options?: PointerLockOptions) => Promise<void>>>
): { domElement: HTMLCanvasElement } {
    const domElement = document.createElement('canvas')
    domElement.requestPointerLock = requestPointerLock
    return { domElement } as unknown as { domElement: HTMLCanvasElement }
}

describe('SystemUICoordinator menu-open gating', () => {
    let coordinator: SystemUICoordinator
    let requestPointerLock: ReturnType<typeof vi.fn<(options?: PointerLockOptions) => Promise<void>>>
    let exitPointerLock: ReturnType<typeof vi.fn<() => void>>

    beforeEach(async () => {
        document.body.innerHTML = ''
        EventManager.getInstance().removeAllListeners()
        AppSettings.getInstance().setSetting('inputMouseLockEnabled', true)

        requestPointerLock = vi.fn<(options?: PointerLockOptions) => Promise<void>>().mockResolvedValue(undefined)
        exitPointerLock = vi.fn<() => void>()
        document.exitPointerLock = exitPointerLock

        coordinator = new SystemUICoordinator(EventManager.getInstance(), AppSettings.getInstance())
        await coordinator.init(makeMockRenderer(requestPointerLock) as unknown as THREE.WebGLRenderer)
    })

    afterEach(() => {
        coordinator?.dispose()
        document.body.innerHTML = ''
    })

    it('releases pointer lock when the pause menu itself emits MenuOpen', () => {
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        expect(exitPointerLock).toHaveBeenCalledTimes(1)
    })

    it('does NOT release pointer lock when a game box emits MenuOpen', () => {
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        expect(exitPointerLock).not.toHaveBeenCalled()
    })

    it('does NOT request pointer lock when a game box emits MenuClose', () => {
        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        expect(requestPointerLock).not.toHaveBeenCalled()
    })

    it('still requests pointer lock when the pause menu itself emits MenuClose', () => {
        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
        expect(requestPointerLock).toHaveBeenCalledTimes(1)
    })
})
