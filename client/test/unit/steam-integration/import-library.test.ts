/**
 * Manual library import: the offline-sourced path (bookmarklet/file), as opposed to the online
 * resolve+fetch path covered elsewhere. What this file exists to pin down:
 * - validateLibraryExportPayload's actual behavior (pure, DOM-free — no fixtures needed)
 * - handleImportLibrary/applyLibrary's actual behavior (artwork derivation, display-name handling)
 * - the reload-survival bug: an imported library must persist across a page reload the same
 *   way an online cached profile does, or it silently reverts to the anonymous demo store
 * - the "Clear cached profile & reload" bug: that button only ever knew about the online
 *   profile cache — an imported Library survived it untouched
 *
 * The bookmarklet postMessage protocol itself (handleWindowMessage) lives on
 * ManualLibraryImportGateway now, not here — see manual-library-import-gateway.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DataManager } from '../../../src/core/data'
import { EventManager } from '../../../src/core/EventManager'
import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'
import { validateLibraryExportPayload } from '../../../src/steam-integration/Library'
import type { ImportChannel } from '../../../src/steam-integration/Library'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamGamesBatchEvent, SteamImportLibraryEvent } from '../../../src/types/InteractionEvents'

const SAMPLE_GAMES = [
    { appid: 440, name: 'Team Fortress 2', playtime_forever: 100 },
    { appid: 620, name: 'Portal 2', playtime_forever: 50 },
]

function importLibrary(
    integration: SteamIntegration,
    games: typeof SAMPLE_GAMES,
    displayName: string | undefined,
    steamId: string | undefined,
    channel: ImportChannel
): Promise<void> {
    return integration['handleImportLibrary'](new CustomEvent<SteamImportLibraryEvent>('noop', {
        detail: { games, displayName, steamId, channel }
    }))
}

describe('validateLibraryExportPayload', () => {
    it('accepts a well-formed sbam-library-export/v1 payload', () => {
        const result = validateLibraryExportPayload({
            schema: 'sbam-library-export/v1',
            display_name: 'Test Account',
            steam_id: '76561198000000000',
            games: SAMPLE_GAMES
        })
        expect(result).toEqual({ games: SAMPLE_GAMES, displayName: 'Test Account', steamId: '76561198000000000' })
    })

    it('rejects a payload with the wrong (or missing) schema string', () => {
        expect(validateLibraryExportPayload({ schema: 'something-else', games: SAMPLE_GAMES })).toBeNull()
        expect(validateLibraryExportPayload({ games: SAMPLE_GAMES })).toBeNull()
    })

    it('rejects a payload whose games array is missing or not an array', () => {
        expect(validateLibraryExportPayload({ schema: 'sbam-library-export/v1' })).toBeNull()
        expect(validateLibraryExportPayload({ schema: 'sbam-library-export/v1', games: 'not-an-array' })).toBeNull()
    })

    it('rejects non-object payloads', () => {
        expect(validateLibraryExportPayload(null)).toBeNull()
        expect(validateLibraryExportPayload('a string')).toBeNull()
        expect(validateLibraryExportPayload(42)).toBeNull()
    })

    it('filters out malformed individual game entries rather than rejecting the whole payload', () => {
        const result = validateLibraryExportPayload({
            schema: 'sbam-library-export/v1',
            games: [
                { appid: 440, name: 'Team Fortress 2', playtime_forever: 100 },
                { appid: 'not-a-number', name: 'Bad Entry' },
                { name: 'Missing appid' },
                null
            ]
        })
        expect(result?.games).toHaveLength(1)
        expect(result?.games[0].appid).toBe(440)
    })

    it('rejects the payload entirely when every game entry is malformed', () => {
        const result = validateLibraryExportPayload({
            schema: 'sbam-library-export/v1',
            games: [{ appid: 'nope' }]
        })
        expect(result).toBeNull()
    })

    it('treats a missing display_name as no name, distinct from a blank one', () => {
        const noName = validateLibraryExportPayload({ schema: 'sbam-library-export/v1', games: SAMPLE_GAMES })
        expect(noName?.displayName).toBeNull()

        const blankName = validateLibraryExportPayload({ schema: 'sbam-library-export/v1', games: SAMPLE_GAMES, display_name: '   ' })
        expect(blankName?.displayName).toBeNull()
    })
})

describe('SteamIntegration manual library import', () => {
    beforeEach(() => {
        DataManager.getInstance().clear()
        EventManager.getInstance().removeAllListeners()
        SteamIntegration.dispose()
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('emits GamesBatchReady with appid-derived artwork and no network call', async () => {
        const integration = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const batchHandler = vi.fn()
        eventManager.registerEventHandler<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, batchHandler)

        await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')

        expect(batchHandler).toHaveBeenCalledOnce()
        const games = (batchHandler.mock.calls[0][0] as CustomEvent<SteamGamesBatchEvent>).detail.games
        expect(games).toHaveLength(2)
        expect(games[0].appid).toBe(440)
        expect(games[0].artwork.library).toContain('440')
        expect(games[0].artwork.header).toContain('440')
    })

    it('marks the session as non-anonymous whether or not a display name is known', async () => {
        const integration = SteamIntegration.getInstance()

        await importLibrary(integration, SAMPLE_GAMES, undefined, undefined, 'file')
        expect(integration.isAnonymous()).toBe(false)
    })

    it('uses the real display name for the sign title when known', async () => {
        const integration = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const dataLoadedHandler = vi.fn()
        eventManager.registerEventHandler(SteamEventTypes.DataLoaded, dataLoadedHandler)

        await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')

        const detail = dataLoadedHandler.mock.calls[0][0].detail
        expect(detail.userInput).toBe('Test Account')
    })

    it('omits a placeholder name when no real display name is known (falls through to the generic sign title)', async () => {
        const integration = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const dataLoadedHandler = vi.fn()
        eventManager.registerEventHandler(SteamEventTypes.DataLoaded, dataLoadedHandler)

        await importLibrary(integration, SAMPLE_GAMES, undefined, undefined, 'file')

        const detail = dataLoadedHandler.mock.calls[0][0].detail
        expect(detail.userInput).toBeUndefined()
    })

    it('ignores an empty games array without emitting anything', async () => {
        const integration = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const batchHandler = vi.fn()
        eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, batchHandler)

        await importLibrary(integration, [], 'Test Account', undefined, 'bookmarklet')

        expect(batchHandler).not.toHaveBeenCalled()
        expect(integration.isAnonymous()).toBe(true)
    })

    it('records which channel captured the library, for future diagnosability', async () => {
        const integration = SteamIntegration.getInstance()

        await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'file')

        const persisted = JSON.parse(localStorage.getItem('sbam_library_source')!)
        expect(persisted.provenance.channel).toBe('file')
        expect(persisted.provenance.capturedAt).toEqual(expect.any(String))
    })

    it('persists a captured steamid so a future re-fetch is possible', async () => {
        const integration = SteamIntegration.getInstance()

        await importLibrary(integration, SAMPLE_GAMES, 'Test Account', '76561198000000000', 'bookmarklet')

        const persisted = JSON.parse(localStorage.getItem('sbam_library_source')!)
        expect(persisted.owner.steamId).toBe('76561198000000000')
    })

    it('persists ownership fields plus name — never categories/artwork (Fork B2)', async () => {
        const integration = SteamIntegration.getInstance()

        await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'file')

        const persisted = JSON.parse(localStorage.getItem('sbam_library_source')!)
        expect(persisted.games).toEqual([
            { appid: 440, name: 'Team Fortress 2', playtimeForever: 100 },
            { appid: 620, name: 'Portal 2', playtimeForever: 50 },
        ])
    })

    it('shows the real name immediately even with a cold entity cache, and it survives a reload', async () => {
        const first = SteamIntegration.getInstance()
        await importLibrary(first, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')

        SteamIntegration.dispose()
        const second = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const batchHandler = vi.fn()
        eventManager.registerEventHandler<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, batchHandler)

        await second['handleGameStart']()

        const games = (batchHandler.mock.calls[0][0] as CustomEvent<SteamGamesBatchEvent>).detail.games
        expect(games.map(g => g.name)).toEqual(['Team Fortress 2', 'Portal 2'])
    })

    describe('surviving a reload', () => {
        it('re-loads a previously imported library on startup instead of falling back to the anonymous store', async () => {
            const first = SteamIntegration.getInstance()
            await importLibrary(first, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')

            // Simulate a fresh page load: new instance, no in-memory state carried over,
            // but localStorage (where persistLibrary wrote) survives a reload.
            SteamIntegration.dispose()
            const second = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            const batchHandler = vi.fn()
            eventManager.registerEventHandler<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, batchHandler)

            await second['handleGameStart']()

            expect(batchHandler).toHaveBeenCalledOnce()
            const games = (batchHandler.mock.calls[0][0] as CustomEvent<SteamGamesBatchEvent>).detail.games
            expect(games).toHaveLength(2)
            expect(second.isAnonymous()).toBe(false)
        })

        it('falls back to the anonymous store on startup once the persisted import has been cleared', async () => {
            const first = SteamIntegration.getInstance()
            await importLibrary(first, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')
            first['handleClearCache'](new CustomEvent('noop', { detail: { scope: 'all' } }))

            SteamIntegration.dispose()
            const second = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            const batchHandler = vi.fn()
            eventManager.registerEventHandler<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, batchHandler)

            await second['handleGameStart']()

            expect(batchHandler).toHaveBeenCalledOnce()
            const games = (batchHandler.mock.calls[0][0] as CustomEvent<SteamGamesBatchEvent>).detail.games
            // Anonymous demo fixture, not the 2-game imported library.
            expect(games.length).not.toBe(2)
            expect(second.isAnonymous()).toBe(true)
        })

        it('clears the persisted import on CacheClear scope "identity" ("Clear cached profile & reload"), unlike before this fix', async () => {
            const first = SteamIntegration.getInstance()
            await importLibrary(first, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')
            expect(localStorage.getItem('sbam_library_source')).not.toBeNull()

            first['handleClearCache'](new CustomEvent('noop', { detail: { scope: 'identity' } }))
            expect(localStorage.getItem('sbam_library_source')).toBeNull()

            SteamIntegration.dispose()
            const second = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            const batchHandler = vi.fn()
            eventManager.registerEventHandler<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, batchHandler)

            await second['handleGameStart']()

            const games = (batchHandler.mock.calls[0][0] as CustomEvent<SteamGamesBatchEvent>).detail.games
            expect(games.length).not.toBe(2)
            expect(second.isAnonymous()).toBe(true)
        })

        it.todo('a successful online profile load (handleLoadLibrary) also persists a Library, and a subsequent handleGameStart re-loads it via applyLibrary — needs the SteamApiClient network mocking pattern from steam-integration.test.ts, not yet wired into this file')
    })
})

/**
 * SteamUIPanel's remaining scope in this feature is now genuinely thin — the postMessage
 * protocol, validation, and readiness handshake all moved to SteamIntegration above (the
 * "hinge point" for library loading of any kind). What's left is real DOM wiring, which needs
 * DOM fixtures/File simulation this file otherwise avoids. Manually verified live (see
 * docs/plans/bookmarklet-capture-spike.md); not yet automated.
 */
describe.todo('SteamUIPanel manual import (remaining DOM-bound scope)', () => {
    it.todo('handleImportFileSelected reads a picked .json file, validates it via validateLibraryExportPayload, and emits ImportLibrary tagged with channel "file"')
    it.todo('the panel shows on DataLoaded when isAnonymous() is true, and hides when false — covers the anonymous-store-first visibility ordering')
})
