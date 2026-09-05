/**
 * System UI Coordinator - wheel wiring
 *
 * Mirrors system-ui-coordinator-interact-pressed.test.ts's mocking pattern. A real 'wheel' event
 * on the renderer canvas should become a SceneCanvasWheel event in the same NDC space
 * handleRendererMouseUp already uses for SceneCanvasClick - GameBoxFoldCoordinator raycasts off it
 * to scroll the held box's debug panel.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { SystemUICoordinator } from '../../../src/ui/coordinators/SystemUICoordinator'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
import { InputEventTypes, type SceneCanvasWheelEvent } from '../../../src/types/InteractionEvents'

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
        isOpen() { return false }
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
    const canvas = document.createElement('canvas')
    canvas.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({})
    }))
    return { domElement: canvas, setTransparentSort: vi.fn() } as unknown as { domElement: HTMLCanvasElement }
}

describe('SystemUICoordinator wheel wiring', () => {
    let systemCoordinator: SystemUICoordinator
    let canvas: HTMLCanvasElement
    const eventManagerMock = EventManager.getInstance()

    beforeEach(async () => {
        document.body.innerHTML = ''
        registeredHandlers.clear()

        systemCoordinator = new SystemUICoordinator(eventManagerMock, AppSettings.getInstance())
        const renderer = makeMockRenderer()
        canvas = renderer.domElement
        await systemCoordinator.init(renderer as unknown as THREE.WebGLRenderer)
        vi.mocked(eventManagerMock.emit).mockClear()
    })

    afterEach(() => {
        systemCoordinator?.dispose()
        document.body.innerHTML = ''
    })

    it('emits SceneCanvasWheel with NDC coordinates and deltaY on a real wheel event', () => {
        // Center of the 800x600 canvas -> NDC (0, 0); deltaY carries scroll direction/magnitude through untouched.
        canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 400, clientY: 300, deltaY: 120 }))

        expect(eventManagerMock.emit).toHaveBeenCalledWith(
            InputEventTypes.SceneCanvasWheel,
            expect.objectContaining({ ndcX: 0, ndcY: 0, deltaY: 120 } satisfies Partial<SceneCanvasWheelEvent>)
        )
    })

    it('converts an off-center wheel position to the matching NDC coordinates', () => {
        // Top-left corner -> NDC (-1, 1)
        canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 0, clientY: 0, deltaY: -50 }))

        expect(eventManagerMock.emit).toHaveBeenCalledWith(
            InputEventTypes.SceneCanvasWheel,
            expect.objectContaining({ ndcX: -1, ndcY: 1, deltaY: -50 } satisfies Partial<SceneCanvasWheelEvent>)
        )
    })

    it('does nothing after dispose() removes the listener', () => {
        systemCoordinator.dispose()
        canvas.dispatchEvent(new WheelEvent('wheel', { clientX: 400, clientY: 300, deltaY: 10 }))

        expect(eventManagerMock.emit).not.toHaveBeenCalledWith(InputEventTypes.SceneCanvasWheel, expect.anything())
    })
})
