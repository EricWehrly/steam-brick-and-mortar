/**
 * System UI Coordinator - InteractPressed Wiring
 *
 * Interact from a cursor-less device (keyboard/gamepad) should dispatch a center-screen
 * SceneCanvasClick, simulating a click at the reticle position. A real mouse click never reaches
 * this path at all - it has its own independent dispatch (handleRendererMouseUp). The gamepad/VR
 * aiming reticle should show only while such a device is connected and the pause menu is closed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { SystemUICoordinator } from '../../../src/ui/coordinators/SystemUICoordinator'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
import {
    InputEventTypes,
    AppSettingsEventTypes,
    type SceneCanvasClickEvent,
    type InputDevicesChangedEvent
} from '../../../src/types/InteractionEvents'

let isPauseMenuOpen = false

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
    EventSource: { UI: 'ui', ManagedLight: 'managed-light' }
}))

vi.mock('../../../src/ui/pause/PauseMenuManager', () => ({
    PauseMenuManager: class {
        init() {}
        setSystemDependencies() {}
        registerDefaultPanels() {}
        isOpen() { return isPauseMenuOpen }
        open() {}
        close() {}
        toggle() {}
        dispose() {}
    }
}))

vi.mock('../../../src/ui/PerformanceMonitor', () => ({
    PerformanceMonitorUI: class { start() {}; dispose() {}; updateRenderStats() {} }
}))

vi.mock('../../../src/ui/LightingControlsPanel', () => ({
    LightingControlsPanel: class { show() {}; hide() {}; toggle() {}; dispose() {} }
}))

function makeMockRenderer(): { domElement: HTMLCanvasElement } {
    const domElement = document.createElement('canvas')
    // handleMenuClose now requests pointer lock directly (moved here from a PauseMenuManager
    // callback - PR review request, 2026-09-03) - jsdom's canvas has no real implementation, so
    // this needs a stub the same way system-ui-coordinator-pointer-lock.test.ts already does.
    domElement.requestPointerLock = vi.fn().mockResolvedValue(undefined)
    return { domElement } as unknown as { domElement: HTMLCanvasElement }
}

function emitInteractPressed(): void {
    registeredHandlers.get(InputEventTypes.InteractPressed)?.(new CustomEvent('input:interact-pressed'))
}

describe('SystemUICoordinator InteractPressed wiring', () => {
    let systemCoordinator: SystemUICoordinator
    const eventManagerMock = EventManager.getInstance()

    beforeEach(async () => {
        document.body.innerHTML = ''
        registeredHandlers.clear()
        isPauseMenuOpen = false

        systemCoordinator = new SystemUICoordinator(eventManagerMock, AppSettings.getInstance())
        await systemCoordinator.init(makeMockRenderer() as unknown as THREE.WebGLRenderer)
        vi.mocked(eventManagerMock.emit).mockClear()
    })

    afterEach(() => {
        systemCoordinator?.dispose()
        document.body.innerHTML = ''
        AppSettings.getInstance().setSetting('inputGamepadReticleEnabled', true)
    })

    it('emits a center-screen SceneCanvasClick when InteractPressed fires', () => {
        emitInteractPressed()

        expect(eventManagerMock.emit).toHaveBeenCalledWith(
            InputEventTypes.SceneCanvasClick,
            expect.objectContaining({ ndcX: 0, ndcY: 0 } satisfies Partial<SceneCanvasClickEvent>)
        )
    })

    it('shows the reticle only while a gamepad/VR device is connected and the menu is closed', () => {
        const reticle = document.getElementById('gamepad-reticle')
        expect(reticle).not.toBeNull()
        expect(reticle?.style.display).toBe('none')

        const devicesChanged = registeredHandlers.get(InputEventTypes.DevicesChanged)
        const menuOpen = registeredHandlers.get('ui:menu-open')
        const menuClose = registeredHandlers.get('ui:menu-close')

        function emitDevices(devices: InputDevicesChangedEvent['devices']): void {
            devicesChanged?.(new CustomEvent('devices', { detail: { devices } }))
        }

        emitDevices([{ id: 'gamepad-0', name: 'Test Pad', kind: 'gamepad', connected: true, profileId: 'gamepad-standard' }])
        expect(reticle?.style.display).toBe('block')

        isPauseMenuOpen = true
        menuOpen?.(new CustomEvent('menu-open', { detail: { menuType: 'pause' } }))
        expect(reticle?.style.display).toBe('none')

        isPauseMenuOpen = false
        menuClose?.(new CustomEvent('menu-close', { detail: { menuType: 'pause' } }))
        expect(reticle?.style.display).toBe('block')

        emitDevices([{ id: 'mouse-keyboard', name: 'Mouse + Keyboard', kind: 'mouse-keyboard', connected: true, profileId: 'mouse-keyboard' }])
        expect(reticle?.style.display).toBe('none')
    })

    it('hides the reticle when the gamepad reticle setting is disabled, and reacts live to it changing', () => {
        const reticle = document.getElementById('gamepad-reticle')
        const devicesChanged = registeredHandlers.get(InputEventTypes.DevicesChanged)
        const settingChanged = registeredHandlers.get(AppSettingsEventTypes.Changed)
        const appSettings = AppSettings.getInstance()

        devicesChanged?.(new CustomEvent('devices', {
            detail: { devices: [{ id: 'gamepad-0', name: 'Test Pad', kind: 'gamepad', connected: true, profileId: 'gamepad-standard' }] }
        }))
        expect(reticle?.style.display).toBe('block')

        appSettings.setSetting('inputGamepadReticleEnabled', false)
        settingChanged?.(new CustomEvent('setting-changed', {
            detail: { settingName: 'inputGamepadReticleEnabled', value: false, previousValue: true }
        }))
        expect(reticle?.style.display).toBe('none')

        appSettings.setSetting('inputGamepadReticleEnabled', true)
        settingChanged?.(new CustomEvent('setting-changed', {
            detail: { settingName: 'inputGamepadReticleEnabled', value: true, previousValue: false }
        }))
        expect(reticle?.style.display).toBe('block')
    })
})
