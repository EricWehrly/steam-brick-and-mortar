/**
 * The bookmarklet postMessage wire protocol — origin/type gating, validation, and translating
 * a valid message into an ImportLibrary event. Split out of SteamIntegration specifically
 * because it has no dependency on library state, so it's testable with a constructed
 * MessageEvent and nothing else (no gameLibrary, no DataManager, no localStorage).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventManager } from '../../../src/core/EventManager'
import { ManualLibraryImportGateway } from '../../../src/steam-integration/ManualLibraryImportGateway'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamImportLibraryEvent } from '../../../src/types/InteractionEvents'

const STEAM_ORIGIN = 'https://steamcommunity.com'
const SAMPLE_GAMES = [
    { appid: 440, name: 'Team Fortress 2', playtime_forever: 100 },
    { appid: 620, name: 'Portal 2', playtime_forever: 50 },
]
const validPayload = {
    schema: 'sbam-library-export/v1',
    display_name: 'Test Account',
    games: SAMPLE_GAMES
}

describe('ManualLibraryImportGateway', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('ignores a message from any origin other than steamcommunity.com', () => {
        const gateway = new ManualLibraryImportGateway()
        const eventManager = EventManager.getInstance()
        const importHandler = vi.fn()
        eventManager.registerEventHandler(SteamEventTypes.ImportLibrary, importHandler)

        gateway['handleWindowMessage']({
            origin: 'https://evil.example.com',
            data: { type: 'sbam-library-export', payload: validPayload }
        } as MessageEvent)

        expect(importHandler).not.toHaveBeenCalled()
    })

    it('ignores a message whose type is not sbam-library-export', () => {
        const gateway = new ManualLibraryImportGateway()
        const eventManager = EventManager.getInstance()
        const importHandler = vi.fn()
        eventManager.registerEventHandler(SteamEventTypes.ImportLibrary, importHandler)

        gateway['handleWindowMessage']({
            origin: STEAM_ORIGIN,
            data: { type: 'some-other-message', payload: validPayload }
        } as MessageEvent)

        expect(importHandler).not.toHaveBeenCalled()
    })

    it('emits ImportLibrary tagged with the bookmarklet channel on a valid message', () => {
        const gateway = new ManualLibraryImportGateway()
        const eventManager = EventManager.getInstance()
        const importHandler = vi.fn()
        eventManager.registerEventHandler<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, importHandler)

        gateway['handleWindowMessage']({
            origin: STEAM_ORIGIN,
            data: { type: 'sbam-library-export', payload: validPayload }
        } as MessageEvent)

        expect(importHandler).toHaveBeenCalledOnce()
        const detail = (importHandler.mock.calls[0][0] as CustomEvent<SteamImportLibraryEvent>).detail
        expect(detail.channel).toBe('bookmarklet')
        expect(detail.games).toHaveLength(2)
        expect(detail.displayName).toBe('Test Account')
    })

    it('does not emit on a malformed payload from a trusted origin', () => {
        const gateway = new ManualLibraryImportGateway()
        const eventManager = EventManager.getInstance()
        const importHandler = vi.fn()
        eventManager.registerEventHandler(SteamEventTypes.ImportLibrary, importHandler)

        gateway['handleWindowMessage']({
            origin: STEAM_ORIGIN,
            data: { type: 'sbam-library-export', payload: { schema: 'wrong' } }
        } as MessageEvent)

        expect(importHandler).not.toHaveBeenCalled()
    })

    it('announces readiness to window.opener when opened by the export bookmarklet', () => {
        const postMessage = vi.fn()
        const originalOpener = window.opener
        Object.defineProperty(window, 'opener', { value: { closed: false, postMessage }, configurable: true })

        new ManualLibraryImportGateway()

        expect(postMessage).toHaveBeenCalledWith({ type: 'sbam-ready' }, '*')

        Object.defineProperty(window, 'opener', { value: originalOpener, configurable: true })
    })

    it('does not attempt to announce readiness when there is no opener', () => {
        const originalOpener = window.opener
        Object.defineProperty(window, 'opener', { value: null, configurable: true })

        expect(() => new ManualLibraryImportGateway()).not.toThrow()

        Object.defineProperty(window, 'opener', { value: originalOpener, configurable: true })
    })
})
