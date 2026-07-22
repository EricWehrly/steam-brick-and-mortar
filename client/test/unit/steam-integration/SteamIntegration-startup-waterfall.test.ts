/**
 * Coverage for SteamIntegration.handleGameStart()'s startup waterfall: exactly one source
 * (cache -> local disk -> online -> demo) is chosen per launch, and the others are never
 * touched alongside it. This is the seam the Fork A removal rewrote this session - these
 * tests exist so a future change that reintroduces a second, parallel source shows up as a
 * failing assertion here instead of only surfacing during real desktop playtesting.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'
import type { Library } from '../../../src/steam-integration/Library'

const { mockEventManagerInstance } = vi.hoisted(() => ({
    mockEventManagerInstance: {
        emit: vi.fn(),
        registerEventHandler: vi.fn(),
        deregisterEventHandler: vi.fn()
    }
}))

vi.mock('../../../src/core/EventManager', () => ({
    EventManager: { getInstance: vi.fn(() => mockEventManagerInstance) },
    EventSource: { System: 'system' }
}))

vi.mock('../../../src/steam', () => ({
    SteamApiClient: {
        getInstance: vi.fn(() => ({
            enrichFromCache: vi.fn(async (games: unknown[]) => games),
        }))
    }
}))

vi.mock('../../../src/steam-integration/LibraryStore', () => ({
    loadPersistedLibrary: vi.fn(),
    persistLibrary: vi.fn(),
    clearPersistedLibrary: vi.fn(),
}))

vi.mock('../../../src/steam/LocalSteamLibraryLoader', () => ({
    loadLocalSteamLibrary: vi.fn(),
}))

vi.mock('../../../src/steam-integration/OnlineLibraryLoader', () => ({
    loadOnlineLibrary: vi.fn(),
    resolveDisplayName: vi.fn((v: string | undefined) => v),
}))

vi.mock('../../../src/steam-integration/DemoLibraryLoader', () => ({
    loadDemoLibrary: vi.fn(),
}))

import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'
import { loadPersistedLibrary, persistLibrary } from '../../../src/steam-integration/LibraryStore'
import { loadLocalSteamLibrary } from '../../../src/steam/LocalSteamLibraryLoader'
import { loadOnlineLibrary } from '../../../src/steam-integration/OnlineLibraryLoader'
import { loadDemoLibrary } from '../../../src/steam-integration/DemoLibraryLoader'

function makeLibrary(overrides: Partial<Library> = {}): Library {
    return {
        owner: { steamId: '76561198000000000', displayName: 'Test Account' },
        games: [{ appid: 440, name: 'Team Fortress 2', playtimeForever: 100 }],
        provenance: { channel: 'local-scan', capturedAt: '2026-01-01T00:00:00Z' },
        ...overrides,
    }
}

describe('SteamIntegration startup waterfall', () => {
    let steamIntegration: SteamIntegration

    beforeEach(() => {
        vi.clearAllMocks()
        SteamIntegration.dispose()
        steamIntegration = SteamIntegration.getInstance()
    })

    test('uses the persisted cache when present, without touching local scan, online, or demo', async () => {
        vi.mocked(loadPersistedLibrary).mockReturnValue(makeLibrary())

        await steamIntegration['handleGameStart']()

        expect(loadLocalSteamLibrary).not.toHaveBeenCalled()
        expect(loadOnlineLibrary).not.toHaveBeenCalled()
        expect(loadDemoLibrary).not.toHaveBeenCalled()
    })

    test('falls to local disk scan when no cache, persists the resolved library, and skips online/demo', async () => {
        vi.mocked(loadPersistedLibrary).mockReturnValue(null)
        const scannedLibrary = makeLibrary()
        vi.mocked(loadLocalSteamLibrary).mockResolvedValue({ library: scannedLibrary, steamId: '76561198000000000' })

        await steamIntegration['handleGameStart']()

        expect(persistLibrary).toHaveBeenCalledWith(scannedLibrary)
        expect(loadOnlineLibrary).not.toHaveBeenCalled()
        expect(loadDemoLibrary).not.toHaveBeenCalled()
    })

    test('falls to an online fetch when local scan resolves an identity but no games, without calling demo directly', async () => {
        vi.mocked(loadPersistedLibrary).mockReturnValue(null)
        vi.mocked(loadLocalSteamLibrary).mockResolvedValue({ library: null, steamId: '76561198000000000' })

        await steamIntegration['handleGameStart']()

        expect(loadOnlineLibrary).toHaveBeenCalledWith('76561198000000000', undefined, expect.anything())
        expect(loadDemoLibrary).not.toHaveBeenCalled()
        expect(persistLibrary).not.toHaveBeenCalled()
    })

    test('falls to the demo store when nothing else resolves', async () => {
        vi.mocked(loadPersistedLibrary).mockReturnValue(null)
        vi.mocked(loadLocalSteamLibrary).mockResolvedValue({ library: null })

        await steamIntegration['handleGameStart']()

        expect(loadDemoLibrary).toHaveBeenCalledOnce()
        expect(loadOnlineLibrary).not.toHaveBeenCalled()
    })
})
