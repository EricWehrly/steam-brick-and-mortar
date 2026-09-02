/**
 * SystemUICoordinator.handleMenuOpen/handleMenuClose - regression for a real bug: these were
 * unconditionally calling pauseMenuManager.open()/close() for ANY UIEventTypes.MenuOpen/MenuClose,
 * not just the DOM pause menu's own ('pause'). Once GameBoxFoldCoordinator started emitting the
 * same event with menuType:'game-box' (so world raycasting/camera movement stand down while a box
 * is open), this handler popped the real pause menu open behind it too - direct request
 * (2026-09-02): "why does the settings menu open when I open a game box?"
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventManager } from '../../../../src/core/EventManager'
import { AppSettings } from '../../../../src/core/AppSettings'
import { PauseMenuManager } from '../../../../src/ui/pause/PauseMenuManager'
import { SystemUICoordinator } from '../../../../src/ui/coordinators/SystemUICoordinator'
import { UIEventTypes, type MenuOpenEvent, type MenuCloseEvent } from '../../../../src/types/InteractionEvents'

describe('SystemUICoordinator menu-open gating', () => {
    let coordinator: SystemUICoordinator
    let openSpy: ReturnType<typeof vi.spyOn>
    let closeSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        // vi.spyOn returns the SAME mock across tests for a given prototype method - restore
        // first so each test starts with a clean call history (same pitfall documented in
        // SceneClickGameBoxRaycast-xr-ray.test.ts).
        vi.restoreAllMocks()
        openSpy = vi.spyOn(PauseMenuManager.prototype, 'open').mockImplementation(() => {})
        closeSpy = vi.spyOn(PauseMenuManager.prototype, 'close').mockImplementation(() => {})

        coordinator = new SystemUICoordinator(EventManager.getInstance(), AppSettings.getInstance())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(coordinator as any).registerEventHandlers()
    })

    it('opens the real pause menu when the pause menu itself emits MenuOpen', () => {
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        expect(openSpy).toHaveBeenCalledTimes(1)
    })

    it('does NOT open the pause menu when a game box emits MenuOpen', () => {
        EventManager.getInstance().emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        expect(openSpy).not.toHaveBeenCalled()
    })

    it('does NOT close the pause menu when a game box emits MenuClose', () => {
        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        expect(closeSpy).not.toHaveBeenCalled()
    })

    it('still closes the real pause menu when the pause menu itself emits MenuClose', () => {
        EventManager.getInstance().emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
        expect(closeSpy).toHaveBeenCalledTimes(1)
    })
})
