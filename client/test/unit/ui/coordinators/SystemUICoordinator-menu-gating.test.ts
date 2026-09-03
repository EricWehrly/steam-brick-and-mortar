/**
 * SystemUICoordinator.handleMenuOpen/handleMenuClose - regression for a real bug: these were
 * unconditionally calling pauseMenuManager.open()/close() for ANY UIEventTypes.MenuOpen/MenuClose,
 * not just the DOM pause menu's own ('pause'). Once GameBoxFoldCoordinator started emitting the
 * same event with menuType:'game-box' (so world raycasting/camera movement stand down while a box
 * is open), this handler popped the real pause menu open behind it too.
 *
 * PauseMenuManager now owns opening/closing itself and emits this event directly, so
 * handleMenuOpen/handleMenuClose no longer call .open()/.close() at all (that would be redundant) -
 * only pointer-lock and reticle-visibility side effects, still filtered to 'pause'. So the
 * observable regression check here is pointer-lock, not a spy on PauseMenuManager's own methods.
 *
 * These same handlers also count EVERY open menuType (unfiltered) into a plain
 * InputEventTypes.Pause/Resume, covered below alongside the pointer-lock behavior.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { SystemUICoordinator } from '../../../../src/ui/coordinators/SystemUICoordinator'
import { EventManager } from '../../../../src/core/EventManager'
import { AppSettings } from '../../../../src/core/AppSettings'
import {
    UIEventTypes, InputEventTypes,
    type MenuOpenEvent, type MenuCloseEvent
} from '../../../../src/types/InteractionEvents'

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

    it('emits InputEventTypes.Pause on the first open menu of any type, and Resume once the '
        + 'last one closes - not per menuType, so InputManager only ever hears one pause/resume '
        + 'pair for however many menus are actually up at once', () => {
        const eventManager = EventManager.getInstance()
        const pauseHandler = vi.fn()
        const resumeHandler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.Pause, pauseHandler)
        eventManager.registerEventHandler(InputEventTypes.Resume, resumeHandler)

        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        expect(pauseHandler).toHaveBeenCalledTimes(1)

        // A second, different menuType opening on top shouldn't emit a second Pause - InputManager
        // only needs to hear about the 0->1 transition.
        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        expect(pauseHandler).toHaveBeenCalledTimes(1)

        // Closing just the game box (one of two open menus) shouldn't resume yet - the pause menu
        // is still up.
        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        expect(resumeHandler).not.toHaveBeenCalled()

        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
        expect(resumeHandler).toHaveBeenCalledTimes(1)

        eventManager.deregisterEventHandler(InputEventTypes.Pause, pauseHandler)
        eventManager.deregisterEventHandler(InputEventTypes.Resume, resumeHandler)
    })
})
