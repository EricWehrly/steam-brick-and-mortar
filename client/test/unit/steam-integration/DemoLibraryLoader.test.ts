import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/core/EventManager', () => ({
    EventManager: { getInstance: vi.fn(() => ({ emit: vi.fn(), registerEventHandler: vi.fn(), deregisterEventHandler: vi.fn() })) }
}))

import { loadDemoLibrary, type DemoLibraryLoaderDeps } from '../../../src/steam-integration/DemoLibraryLoader'
import { GameLibraryManager } from '../../../src/steam-integration/GameLibraryManager'
import type { SteamGame } from '../../../src/steam'

function makeGame(appid: number, name: string): SteamGame {
    return { appid, name, playtime_forever: 0, img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: '', library: '' } }
}

describe('loadDemoLibrary', () => {
    let gameLibrary: GameLibraryManager
    let getDemoGames: ReturnType<typeof vi.fn>
    let onLoaded: ReturnType<typeof vi.fn>
    let emitGamesInBatches: ReturnType<typeof vi.fn>
    let deps: DemoLibraryLoaderDeps

    beforeEach(() => {
        gameLibrary = new GameLibraryManager()
        getDemoGames = vi.fn()
        onLoaded = vi.fn()
        emitGamesInBatches = vi.fn().mockResolvedValue(undefined)
        deps = {
            steamClient: { getDemoGames } as any,
            gameLibrary,
            onLoaded,
            emitGamesInBatches,
        } as any
    })

    it('registers the demo games in gameLibrary with an anonymous (empty) identity', async () => {
        getDemoGames.mockResolvedValue([makeGame(1, 'Demo Game 1'), makeGame(2, 'Demo Game 2')])

        await loadDemoLibrary(deps)

        const userData = gameLibrary.getState().userData
        expect(userData?.steamid).toBe('')
        expect(userData?.vanity_url).toBe('')
        expect(userData?.games).toHaveLength(2)
    })

    it('calls onLoaded and emitGamesInBatches with the resolved demo games', async () => {
        const games = [makeGame(1, 'Demo Game 1')]
        getDemoGames.mockResolvedValue(games)

        await loadDemoLibrary(deps)

        expect(onLoaded).toHaveBeenCalledOnce()
        expect(emitGamesInBatches).toHaveBeenCalledWith(games)
    })

    it('does not throw when getDemoGames fails - just logs and leaves gameLibrary untouched', async () => {
        getDemoGames.mockRejectedValue(new Error('bundle unavailable'))

        await expect(loadDemoLibrary(deps)).resolves.toBeUndefined()

        expect(gameLibrary.getState().userData).toBeNull()
        expect(onLoaded).not.toHaveBeenCalled()
    })
})
