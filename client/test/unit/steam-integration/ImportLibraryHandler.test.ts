import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/steam-integration/LibraryStore', () => ({
    persistLibrary: vi.fn(),
}))

import { handleImportLibrary, type ImportLibraryHandlerDeps } from '../../../src/steam-integration/ImportLibraryHandler'
import { persistLibrary } from '../../../src/steam-integration/LibraryStore'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamImportLibraryEvent } from '../../../src/types/InteractionEvents'
import type { SteamGame } from '../../../src/steam'

function makeGame(appid: number, name: string): SteamGame {
    return { appid, name, playtime_forever: 100, img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: '', library: '' } }
}

function makeImportEvent(games: SteamGame[], overrides: Partial<SteamImportLibraryEvent> = {}): CustomEvent<SteamImportLibraryEvent> {
    return new CustomEvent(SteamEventTypes.ImportLibrary, {
        detail: { games, displayName: 'Test Account', steamId: '76561198000000000', channel: 'bookmarklet', ...overrides }
    })
}

describe('handleImportLibrary', () => {
    let applyLibrary: ReturnType<typeof vi.fn>
    let deps: ImportLibraryHandlerDeps

    beforeEach(() => {
        vi.clearAllMocks()
        applyLibrary = vi.fn().mockResolvedValue(true)
        deps = { applyLibrary } as any
    })

    it('ignores an event with no games rather than calling applyLibrary', async () => {
        await handleImportLibrary(makeImportEvent([]), deps)

        expect(applyLibrary).not.toHaveBeenCalled()
        expect(persistLibrary).not.toHaveBeenCalled()
    })

    it('builds a Library from the event payload and applies it', async () => {
        const games = [makeGame(440, 'Team Fortress 2')]

        await handleImportLibrary(makeImportEvent(games), deps)

        expect(applyLibrary).toHaveBeenCalledOnce()
        const library = applyLibrary.mock.calls[0][0]
        expect(library.owner).toEqual({ steamId: '76561198000000000', displayName: 'Test Account' })
        expect(library.provenance.channel).toBe('bookmarklet')
        expect(library.games).toEqual([{ appid: 440, name: 'Team Fortress 2', playtimeForever: 100, lastPlayed: undefined, playtimeDisconnected: undefined }])
    })

    it('persists the library only when applyLibrary reports a successful render', async () => {
        applyLibrary.mockResolvedValue(false)

        await handleImportLibrary(makeImportEvent([makeGame(440, 'Team Fortress 2')]), deps)

        expect(persistLibrary).not.toHaveBeenCalled()
    })

    it('persists the library when applyLibrary succeeds', async () => {
        await handleImportLibrary(makeImportEvent([makeGame(440, 'Team Fortress 2')]), deps)

        expect(persistLibrary).toHaveBeenCalledOnce()
    })
})
