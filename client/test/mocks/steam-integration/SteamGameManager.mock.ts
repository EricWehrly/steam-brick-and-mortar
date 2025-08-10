/**
 * Mock for SteamGameManager
 */

import { vi } from 'vitest'

export const SteamGameManagerMock = vi.fn().mockImplementation(() => ({
    setImageBlobs: vi.fn(),
    currentGame: { index: 0 },
    currentGameIndex: 0,
    gameCount: 5,
    totalGames: 10,
    vanityUrl: 'testuser',
    setGames: vi.fn(),
    nextGame: vi.fn(),
    previousGame: vi.fn(),
    getCurrentGame: vi.fn().mockReturnValue({
        appid: '123',
        name: 'Test Game',
        playtime_forever: 100
    }),
    dispose: vi.fn()
}))

export async function steamGameManagerMockFactory() {
    return {
        SteamGameManager: SteamGameManagerMock
    }
}
