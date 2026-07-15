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
import type { ImportChannel, ImportedGame } from '../../../src/steam-integration/Library'
import { SteamApiClient, type SteamGame } from '../../../src/steam/SteamApiClient'
import { StorePropsEventTypes } from '../../../src/scene/props/PropsEvents'
import type { StorePropsLibraryReloadRequestEvent } from '../../../src/scene/props/PropsEvents'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamGamesBatchEvent, SteamImportLibraryEvent } from '../../../src/types/InteractionEvents'

const SAMPLE_GAMES: ImportedGame[] = [
    { appid: 440, name: 'Team Fortress 2', playtime_forever: 100 },
    { appid: 620, name: 'Portal 2', playtime_forever: 50 },
]

function importLibrary(
    integration: SteamIntegration,
    games: ImportedGame[],
    displayName: string | undefined,
    steamId: string | undefined,
    channel: ImportChannel,
    reconcile?: SteamImportLibraryEvent['reconcile']
): Promise<void> {
    return integration['handleImportLibrary'](new CustomEvent<SteamImportLibraryEvent>('noop', {
        detail: { games, displayName, steamId, channel, reconcile }
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

    const FULLY_POPULATED_GAME = {
        appid: 440,
        name: 'Team Fortress 2',
        playtime_forever: 100,
        rtime_last_played: 1700000000,
        playtime_disconnected: 5,
        capsule_filename: 'ac2f074d.../library_600x900.jpg',
        has_dlc: true,
        has_workshop: true,
        has_market: false,
        has_community_visible_stats: true,
        has_leaderboards: false,
        content_descriptorids: [2, 5],
        img_icon_url: 'abc123hash'
    }

    it('carries the optional per-game fields through when present, and tolerates their absence', () => {
        const withFields = validateLibraryExportPayload({ schema: 'sbam-library-export/v1', games: [FULLY_POPULATED_GAME] })
        expect(withFields?.games[0]).toEqual(FULLY_POPULATED_GAME)

        const withoutFields = validateLibraryExportPayload({ schema: 'sbam-library-export/v1', games: SAMPLE_GAMES })
        const game = withoutFields?.games[0]
        expect(game?.rtime_last_played).toBeUndefined()
        expect(game?.playtime_disconnected).toBeUndefined()
        expect(game?.capsule_filename).toBeUndefined()
        expect(game?.has_dlc).toBeUndefined()
        expect(game?.content_descriptorids).toBeUndefined()
        expect(game?.img_icon_url).toBeUndefined()
    })

    it.each([
        ['rtime_last_played', 'yesterday'],
        ['playtime_disconnected', 'a lot'],
        ['capsule_filename', 12345],
        ['has_dlc', 'yes'],
        ['content_descriptorids', ['not', 'numbers']],
        ['content_descriptorids', 'not-an-array'],
        ['img_icon_url', 999],
    ])('rejects a game entry whose %s is present but the wrong type', (field, badValue) => {
        const result = validateLibraryExportPayload({
            schema: 'sbam-library-export/v1',
            games: [{ appid: 440, name: 'Team Fortress 2', playtime_forever: 100, [field]: badValue }]
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

/**
 * Anonymous-store fallback tests need SteamApiClient.getDemoGames() to resolve with
 * something - loadDemoGames() sources the demo store from it, not a hardcoded fixture. See
 * docs/plans/f2p-artwork-bake-plan.md.
 */
function mockDemoGames(count: number): SteamGame[] {
    const games: SteamGame[] = []
    for (let index = 0; index < count; index++) {
        const appid = 200000 + index
        games.push({
            appid,
            name: `Demo Game ${index + 1}`,
            playtime_forever: 0,
            img_icon_url: '',
            img_logo_url: '',
            artwork: { icon: '', logo: '', header: '', library: '' },
            genres: [{ id: '37', description: 'Free to Play' }],
        })
    }
    return games
}

describe('SteamIntegration manual library import', () => {
    beforeEach(() => {
        DataManager.getInstance().clear()
        EventManager.getInstance().removeAllListeners()
        SteamIntegration.dispose()
        localStorage.clear()
        vi.clearAllMocks()
        vi.spyOn(SteamApiClient.getInstance(), 'getDemoGames').mockResolvedValue(mockDemoGames(5))
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

    const RICH_IMPORTED_GAME: ImportedGame = {
        appid: 440,
        name: 'Team Fortress 2',
        playtime_forever: 100,
        rtime_last_played: 1700000000,
        playtime_disconnected: 5,
        capsule_filename: 'ac2f074d.../library_600x900.jpg',
        has_dlc: true,
        has_workshop: true,
        has_market: false,
        has_community_visible_stats: true,
        has_leaderboards: false,
        content_descriptorids: [2, 5],
        img_icon_url: 'abc123hash'
    }

    it('threads the per-user fields through to the emitted game, but not the per-appid ones', async () => {
        const integration = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const batchHandler = vi.fn()
        eventManager.registerEventHandler<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, batchHandler)

        await importLibrary(integration, [RICH_IMPORTED_GAME], 'Test Account', undefined, 'bookmarklet')

        const game = (batchHandler.mock.calls[0][0] as CustomEvent<SteamGamesBatchEvent>).detail.games[0]
        expect(game.rtime_last_played).toBe(1700000000)
        expect(game.playtime_disconnected).toBe(5)
        // Per-appid fields (capsule_filename, has_dlc, etc.) stop at ImportedGame — see
        // library-game-appid-metadata-duplication in docs/tech-debt.md. Not present on SteamGame.
        expect(game.img_icon_url).toBe('')
    })

    it('leaves the per-user fields undefined when the capture channel had none', async () => {
        const integration = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const batchHandler = vi.fn()
        eventManager.registerEventHandler<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, batchHandler)

        await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')

        const game = (batchHandler.mock.calls[0][0] as CustomEvent<SteamGamesBatchEvent>).detail.games[0]
        expect(game.rtime_last_played).toBeUndefined()
        expect(game.playtime_disconnected).toBeUndefined()
    })

    it('persists the per-user fields on the imported library, and only those', async () => {
        const integration = SteamIntegration.getInstance()

        await importLibrary(integration, [RICH_IMPORTED_GAME], 'Test Account', undefined, 'bookmarklet')

        const persisted = JSON.parse(localStorage.getItem('sbam_library_source')!)
        expect(persisted.games[0]).toEqual({
            appid: 440,
            name: 'Team Fortress 2',
            playtimeForever: 100,
            lastPlayed: 1700000000,
            playtimeDisconnected: 5
        })
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

    describe('reconcile plumbing (Tier B)', () => {
        it('threads reconcile.removedGameNames through to the LibraryReloadRequest emitted on a second import', async () => {
            const integration = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'local-scan')

            const reloadHandler = vi.fn()
            eventManager.registerEventHandler<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, reloadHandler)

            await importLibrary(
                integration,
                [SAMPLE_GAMES[1]],
                'Test Account',
                undefined,
                'local-scan',
                { removedGameNames: ['Team Fortress 2'] }
            )

            expect(reloadHandler).toHaveBeenCalledOnce()
            const detail = (reloadHandler.mock.calls[0][0] as CustomEvent<StorePropsLibraryReloadRequestEvent>).detail
            expect(detail.removedGameNames).toEqual(['Team Fortress 2'])
            expect(detail.incomingGameCount).toBe(1)
        })

        it('leaves removedGameNames undefined on the reload event when the caller had no reconcile info', async () => {
            const integration = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')

            const reloadHandler = vi.fn()
            eventManager.registerEventHandler<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, reloadHandler)

            await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'bookmarklet')

            const detail = (reloadHandler.mock.calls[0][0] as CustomEvent<StorePropsLibraryReloadRequestEvent>).detail
            expect(detail.removedGameNames).toBeUndefined()
        })
    })

    describe('Fork A background re-fetch', () => {
        it('does not auto-refresh for the local-scan channel even with a steamId, unlike other channels', async () => {
            const integration = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            const loadLibraryHandler = vi.fn()
            eventManager.registerEventHandler(SteamEventTypes.LoadLibrary, loadLibraryHandler)

            await importLibrary(integration, SAMPLE_GAMES, 'Test Account', '76561198000000000', 'local-scan')

            expect(loadLibraryHandler).not.toHaveBeenCalled()
        })

        it('still auto-refreshes for the bookmarklet/file channels when a steamId is present', async () => {
            const integration = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            const loadLibraryHandler = vi.fn()
            eventManager.registerEventHandler(SteamEventTypes.LoadLibrary, loadLibraryHandler)

            await importLibrary(integration, SAMPLE_GAMES, 'Test Account', '76561198000000000', 'bookmarklet')

            expect(loadLibraryHandler).toHaveBeenCalledOnce()
        })

        it('never auto-refreshes any channel when there is no steamId at all', async () => {
            const integration = SteamIntegration.getInstance()
            const eventManager = EventManager.getInstance()
            const loadLibraryHandler = vi.fn()
            eventManager.registerEventHandler(SteamEventTypes.LoadLibrary, loadLibraryHandler)

            await importLibrary(integration, SAMPLE_GAMES, 'Test Account', undefined, 'file')

            expect(loadLibraryHandler).not.toHaveBeenCalled()
        })
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
