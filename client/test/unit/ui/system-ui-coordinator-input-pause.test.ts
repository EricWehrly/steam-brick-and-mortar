/**
 * System UI Coordinator - Pause Menu Input Wiring
 *
 * Regression test for the pause-menu input-leak bug: opening/closing the pause
 * menu must actually pause/resume input, not just toggle menu visibility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SystemUICoordinator } from '../../../src/ui/coordinators/SystemUICoordinator'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
import { InputEventTypes } from '../../../src/types/InteractionEvents'

interface CapturedPauseMenuCallbacks {
    onPauseInput?: () => void
    onResumeInput?: () => void
}

let lastPauseMenuManager: { callbacks: CapturedPauseMenuCallbacks } | undefined

vi.mock('../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            emit: vi.fn(),
            registerEventHandler: vi.fn(),
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

describe('SystemUICoordinator pause/resume input wiring', () => {
    let mockEventManager: ReturnType<typeof EventManager.getInstance>

    beforeEach(() => {
        document.body.innerHTML = ''
        lastPauseMenuManager = undefined
        mockEventManager = EventManager.getInstance()
        const mockAppSettings = AppSettings.getInstance()
        // This test's subject is "does onPauseInput/onResumeInput really emit Pause/Resume",
        // independent of lockMovementWhileMenuOpen's own dev/prod default - see AppSettings.ts.
        mockAppSettings.setSetting('lockMovementWhileMenuOpen', true)

        new SystemUICoordinator(mockEventManager, mockAppSettings)
    })

    it('emits InputEventTypes.Pause when the pause menu reports onPauseInput', () => {
        lastPauseMenuManager!.callbacks.onPauseInput?.()

        expect(mockEventManager.emit).toHaveBeenCalledWith(InputEventTypes.Pause, { reason: 'menu' })
    })

    it('emits InputEventTypes.Resume when the pause menu reports onResumeInput', () => {
        lastPauseMenuManager!.callbacks.onResumeInput?.()

        expect(mockEventManager.emit).toHaveBeenCalledWith(InputEventTypes.Resume, { reason: 'menu' })
    })

    it('does not emit Pause/Resume when lockMovementWhileMenuOpen is off', () => {
        const mockAppSettings = AppSettings.getInstance()
        mockAppSettings.setSetting('lockMovementWhileMenuOpen', false)
        new SystemUICoordinator(mockEventManager, mockAppSettings)
        vi.mocked(mockEventManager.emit).mockClear()

        lastPauseMenuManager!.callbacks.onPauseInput?.()
        lastPauseMenuManager!.callbacks.onResumeInput?.()

        expect(mockEventManager.emit).not.toHaveBeenCalledWith(InputEventTypes.Pause, expect.anything())
        expect(mockEventManager.emit).not.toHaveBeenCalledWith(InputEventTypes.Resume, expect.anything())
    })
})
