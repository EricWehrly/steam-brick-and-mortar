import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEventManagerInstance } = vi.hoisted(() => ({
    mockEventManagerInstance: {
        emit: vi.fn(),
        registerEventHandler: vi.fn(),
        deregisterEventHandler: vi.fn()
    }
}))

vi.mock('../../../src/core/EventManager', () => ({
    EventManager: { getInstance: vi.fn(() => mockEventManagerInstance) }
}))

vi.mock('../../../src/utils', () => ({
    ValidationUtils: {
        parseSteamUserInput: vi.fn((input: string) =>
            /^\d+$/.test(input) ? { type: 'steamid', value: input } : { type: 'customurl', value: input.toLowerCase() }
        )
    }
}))

import { loadOnlineLibrary, type OnlineLibraryLoaderDeps } from '../../../src/steam-integration/OnlineLibraryLoader'
import { GameLibraryManager } from '../../../src/steam-integration/GameLibraryManager'
import type { SteamGame, SteamUser } from '../../../src/steam'

function makeGame(appid: number, name: string): SteamGame {
    return { appid, name, playtime_forever: 0, img_icon_url: '', img_logo_url: '', artwork: { icon: '', logo: '', header: '', library: '' } }
}

describe('loadOnlineLibrary', () => {
    let gameLibrary: GameLibraryManager
    let steamClient: { getUserGames: ReturnType<typeof vi.fn>, resolveVanityUrl: ReturnType<typeof vi.fn>, loadGamesProgressively: ReturnType<typeof vi.fn> }
    let onLoaded: ReturnType<typeof vi.fn>
    let onFailureFallback: ReturnType<typeof vi.fn>
    let deps: OnlineLibraryLoaderDeps

    beforeEach(() => {
        vi.clearAllMocks()
        gameLibrary = new GameLibraryManager()
        steamClient = {
            getUserGames: vi.fn(),
            resolveVanityUrl: vi.fn(),
            loadGamesProgressively: vi.fn().mockResolvedValue([]),
        }
        onLoaded = vi.fn()
        onFailureFallback = vi.fn().mockResolvedValue(undefined)
        deps = {
            steamClient: steamClient as any,
            gameLibrary,
            onLoaded,
            onFailureFallback,
            isAnonymous: () => true,
        } as any
    })

    it('resolves a bare steamId without calling resolveVanityUrl', async () => {
        steamClient.getUserGames.mockResolvedValue({
            steamid: '', vanity_url: undefined, game_count: 1, games: [makeGame(1, 'Game 1')], retrieved_at: '2026-01-01T00:00:00Z'
        } as SteamUser)

        await loadOnlineLibrary('76561198000000000', undefined, deps)

        expect(steamClient.resolveVanityUrl).not.toHaveBeenCalled()
        expect(steamClient.getUserGames).toHaveBeenCalledWith('76561198000000000', false)
        expect(onLoaded).toHaveBeenCalledWith('76561198000000000')
    })

    it('resolves a vanity URL to a steamId before fetching games', async () => {
        steamClient.resolveVanityUrl.mockResolvedValue({ steamid: '123', vanity_url: 'testuser', resolved_at: '2026-01-01T00:00:00Z' })
        steamClient.getUserGames.mockResolvedValue({
            steamid: '', vanity_url: undefined, game_count: 0, games: [], retrieved_at: '2026-01-01T00:00:00Z'
        } as SteamUser)

        await loadOnlineLibrary('testuser', undefined, deps)

        expect(steamClient.resolveVanityUrl).toHaveBeenCalledWith('testuser', false)
        expect(steamClient.getUserGames).toHaveBeenCalledWith('123', false)
    })

    it('falls back to the demo store on failure when anonymous', async () => {
        steamClient.getUserGames.mockRejectedValue(new Error('network down'))

        await loadOnlineLibrary('76561198000000000', undefined, deps)

        expect(onFailureFallback).toHaveBeenCalledOnce()
        expect(onLoaded).not.toHaveBeenCalled()
    })

    it('does not fall back to demo on failure when a real session already exists', async () => {
        deps = { ...deps, isAnonymous: () => false }
        steamClient.getUserGames.mockRejectedValue(new Error('network down'))

        await loadOnlineLibrary('76561198000000000', undefined, deps)

        expect(onFailureFallback).not.toHaveBeenCalled()
    })

    it('preserves an already-rendered vanity URL for the same steamId instead of the bare-steamId placeholder', async () => {
        gameLibrary.setUserData({
            steamid: '76561198000000000', vanity_url: 'realname', game_count: 1, games: [makeGame(1, 'Game 1')], retrieved_at: '2026-01-01T00:00:00Z'
        })
        steamClient.getUserGames.mockResolvedValue({
            steamid: '', vanity_url: undefined, game_count: 1, games: [makeGame(1, 'Game 1')], retrieved_at: '2026-01-01T00:00:00Z'
        } as SteamUser)

        await loadOnlineLibrary('76561198000000000', undefined, deps)

        expect(gameLibrary.getState().userData?.vanity_url).toBe('realname')
    })
})
