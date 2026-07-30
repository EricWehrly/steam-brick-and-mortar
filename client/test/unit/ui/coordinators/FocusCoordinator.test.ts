import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FocusCoordinator } from '../../../../src/ui/coordinators/FocusCoordinator'
import { EventManager } from '../../../../src/core/EventManager'
import { AppEventTypes } from '../../../../src/types/InteractionEvents'
import type { VisibilityChangedEvent } from '../../../../src/types/InteractionEvents'
import { UrlUtils } from '../../../../src/utils/UrlUtils'

function setDocumentHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('FocusCoordinator', () => {
    let coordinator: FocusCoordinator
    let visibilityEvents: VisibilityChangedEvent[]

    beforeEach(() => {
        EventManager['instance'] = undefined as unknown as EventManager
        setDocumentHidden(false)
        visibilityEvents = []
        EventManager.getInstance().registerEventHandler<VisibilityChangedEvent>(
            AppEventTypes.VisibilityChanged,
            (event) => visibilityEvents.push(event.detail)
        )
    })

    afterEach(() => {
        coordinator?.dispose()
        setDocumentHidden(false)
        vi.restoreAllMocks()
        EventManager['instance'] = undefined as unknown as EventManager
    })

    it('emits VisibilityChanged(visible: false) on visibilitychange to hidden, diagnostics off', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(false)
        coordinator = new FocusCoordinator()
        coordinator.init()

        setDocumentHidden(true)
        document.dispatchEvent(new Event('visibilitychange'))

        expect(visibilityEvents).toHaveLength(1)
        expect(visibilityEvents[0].visible).toBe(false)
    })

    it('does not emit VisibilityChanged(visible: false) on visibilitychange to hidden, diagnostics on', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(true)
        coordinator = new FocusCoordinator()
        coordinator.init()

        setDocumentHidden(true)
        document.dispatchEvent(new Event('visibilitychange'))

        expect(visibilityEvents).toHaveLength(0)
    })

    it('does not emit VisibilityChanged(visible: false) on window blur, diagnostics on', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(true)
        coordinator = new FocusCoordinator()
        coordinator.init()

        window.dispatchEvent(new Event('blur'))

        expect(visibilityEvents).toHaveLength(0)
    })

    it('emits VisibilityChanged(visible: false) on window blur, diagnostics off', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(false)
        coordinator = new FocusCoordinator()
        coordinator.init()

        window.dispatchEvent(new Event('blur'))

        expect(visibilityEvents).toHaveLength(1)
        expect(visibilityEvents[0].visible).toBe(false)
    })
})
