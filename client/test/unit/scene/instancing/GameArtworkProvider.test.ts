/**
 * Unit Tests for GameArtworkProvider
 * 
 * Tests:
 * - URL strategy building (preferred, cached, fallbacks)
 * - Failure/success caching
 * - GameArtwork handle behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupIndexedDBMock } from '../../../mocks/indexeddb.mock'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain } from '../../../../src/core/data/DataTypes'
import { SteamArtworkStateManager } from '../../../../src/core/data/SteamArtworkStateManager'
import { SteamDataManager } from '../../../../src/core/data/SteamDataManager'
import {
    GameArtworkProvider,
    ARTWORK_DIMENSIONS,
    type GameArtwork,
    type ArtworkFormat
} from '../../../../src/scene/game-box/instancing/GameArtworkProvider'
import { AppDetailsCache } from '../../../../src/steam/cache/AppDetailsCache'
import type { AppDetailsData } from '../../../../src/steam/batch/BatchAppDetailsClient'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

const NO_ARTWORK: AppDetailsData['artwork'] = {
    header: null, capsule: null, capsule_v5: null, background: null, background_raw: null,
}

/** URL marker any mocked fetch call rejects on - lets a test force one specific candidate to fail
 *  while every other candidate in the same strategy still resolves via the default success path. */
const FAILING_URL_MARKER = 'DOOMED'

// Mock TextureWorker
vi.mock('../../../../src/scene/game-box/instancing/TextureWorker', () => ({
    TextureWorker: vi.fn().mockImplementation(function() { return {
        fetchAndProcessWithOptions: vi.fn((url: string) =>
            url.includes(FAILING_URL_MARKER)
                ? Promise.reject(new Error('HTTP 404: Not Found'))
                : Promise.resolve({ imageData: new Uint8ClampedArray(300 * 450 * 4).fill(128) })
        ),
        processLocalBytes: vi.fn(() =>
            Promise.resolve({ imageData: new Uint8ClampedArray(300 * 450 * 4).fill(64), processingTime: 1, width: 300, height: 450 })
        ),
        dispose: vi.fn()
    } })
}))

const { readArtBytesMock } = vi.hoisted(() => ({
    readArtBytesMock: vi.fn(),
}))

vi.mock('../../../../src/steam/LocalLibraryArtReader', () => ({
    LocalLibraryArtReader: {
        readArtBytes: readArtBytesMock,
    },
}))

// Mock PixelDataCache
vi.mock('../../../../src/scene/game-box/instancing/PixelDataCache', () => ({
    PixelDataCache: {
        getInstance: vi.fn().mockReturnValue({
            init: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue(null),
            put: vi.fn().mockResolvedValue(undefined)
        })
    }
}))

describe('GameArtworkProvider', () => {
    let provider: GameArtworkProvider

    function makeGame(appid: number, name = `Game ${appid}`): SteamGameData {
        return {
            appid,
            name,
            playtime_forever: 0,
            artwork: {
                icon: '',
                logo: '',
                header: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
                library: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
            }
        }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        readArtBytesMock.mockReset().mockResolvedValue(null)
        setupIndexedDBMock()
        AppDetailsCache.resetForTesting()
        DataManager.resetInstance()
        ;(SteamDataManager as unknown as { _instance: null })._instance = null

        DataManager.getInstance().set<SteamGameData[]>(
            'steam.games',
            [makeGame(12345, 'Test Game'), makeGame(67890, 'Header Game')],
            { domain: DataDomain.SteamIntegration }
        )

        // Reset singleton
        ;(GameArtworkProvider as unknown as { instance: null }).instance = null
        provider = GameArtworkProvider.getInstance()
    })

    afterEach(() => {
        provider.dispose()
    })

    describe('Singleton', () => {
        it('should return same instance on multiple calls', () => {
            const instance1 = GameArtworkProvider.getInstance()
            const instance2 = GameArtworkProvider.getInstance()
            
            expect(instance1).toBe(instance2)
        })
    })

    describe('ARTWORK_DIMENSIONS', () => {
        it('should have correct library dimensions (portrait)', () => {
            expect(ARTWORK_DIMENSIONS.library).toEqual({ width: 300, height: 450 })
        })

        it('should have correct header dimensions (landscape)', () => {
            expect(ARTWORK_DIMENSIONS.header).toEqual({ width: 460, height: 215 })
        })

        it('should have correct capsule dimensions (landscape)', () => {
            expect(ARTWORK_DIMENSIONS.capsule).toEqual({ width: 616, height: 353 })
        })
    })

    describe('buildUrlStrategy', () => {
        it('should include metadata library URL first when provided', () => {
            const preferredUrl = 'https://example.com/custom-artwork.jpg'
            const strategy = provider.buildUrlStrategy(12345, 'library', { library: preferredUrl })
            
            expect(strategy[0].url).toBe(preferredUrl)
            expect(strategy[0].type).toBe('metadata-library')
        })

        it('should include CDN fallback URLs for library format', () => {
            const strategy = provider.buildUrlStrategy(12345, 'library')
            
            const cdnUrl = strategy.find(s => s.url.includes('cdn.akamai.steamstatic.com'))
            expect(cdnUrl).toBeDefined()
            expect(cdnUrl?.url).toContain('library_600x900.jpg')
        })

        it('should use metadata header when library hint is missing', () => {
            const newCdnUrl = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/12345/header.jpg'
            const strategy = provider.buildUrlStrategy(12345, 'library', { header: newCdnUrl })

            expect(strategy[0].url).toBe(newCdnUrl)
            expect(strategy[0].type).toBe('metadata-header')
            expect(strategy.some((entry) => entry.url.includes('library_600x900.jpg'))).toBe(true)
        })

        it('should include cached success URL as a candidate', () => {
            // Record a success
            provider.recordSuccess(12345, 'library', 'https://cached-success.com/art.jpg', 'cached-test')
            
            const strategy = provider.buildUrlStrategy(12345, 'library')

            const cachedEntry = strategy.find((entry) => entry.url === 'https://cached-success.com/art.jpg')
            expect(cachedEntry?.type).toBe('cached-cached-test')
        })
    })

    describe('getArtwork', () => {
        it('should return GameArtwork handle', () => {
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            expect(artwork).toBeDefined()
            expect(artwork.appId).toBe(12345)
            expect(artwork.gameName).toBe('Test Game')
            expect(artwork.format).toBe('library')
        })

        it('should return known failure reason', () => {
            provider.recordFailure(12345, 'library', 'CORS', ['url1', 'url2'])
            
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            expect(artwork.getFailureReason()).toBe('CORS')
        })
    })

    describe('Failure/Success Caching', () => {
        it('should track known failures', () => {
            provider.recordFailure(12345, 'library', '404', ['url1'])
            
            expect(provider.isKnownFailure(12345, 'library')).toBe(true)
            expect(provider.isKnownFailure(12345, 'header')).toBe(false)
            expect(provider.isKnownFailure(99999, 'library')).toBe(false)
        })

        it('should get failure reason', () => {
            provider.recordFailure(12345, 'library', 'TIMEOUT', ['url1', 'url2'])
            
            expect(provider.getFailureReason(12345, 'library')).toBe('TIMEOUT')
            expect(provider.getFailureReason(99999, 'library')).toBeNull()
        })

        it('should clear all caches', () => {
            provider.recordFailure(12345, 'library', '404', ['url1'])
            provider.recordSuccess(67890, 'header', 'https://fallback.com', 'test')
            
            provider.clearCaches()
            
            expect(provider.isKnownFailure(12345, 'library')).toBe(false)
        })
    })

    describe('GameArtwork Handle', () => {
        it('should continue through strategy even with known permanent failures', async () => {
            provider.recordFailure(12345, 'library', 'CORS', [
                'https://cdn.akamai.steamstatic.com/steam/apps/12345/library_600x900.jpg',
                'https://cdn.akamai.steamstatic.com/steam/apps/12345/capsule_616x353.jpg',
                'https://cdn.akamai.steamstatic.com/steam/apps/12345/header.jpg',
            ])
            
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            const dims = ARTWORK_DIMENSIONS.library
            const result = await artwork.getPixelsAtSize(dims.width, dims.height)

            expect(result.width).toBe(300)
            expect(result.height).toBe(450)
            expect(result.pixels).toBeInstanceOf(Uint8ClampedArray)
        })

        it('should short-circuit to label when cached selection is label', async () => {
            SteamArtworkStateManager.setSelection(12345, 'label')

            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            const dims = ARTWORK_DIMENSIONS.library

            await expect(artwork.getPixelsAtSize(dims.width, dims.height)).rejects.toThrow('Resolved label artwork for Test Game')
        })

        it('should retry for known non-permanent failures', async () => {
            provider.recordFailure(12345, 'library', 'UNKNOWN', ['url1'])

            const artwork = provider.getArtwork(12345, 'Test Game', 'library', { library: 'https://example.com/art.jpg' })
            const dims = ARTWORK_DIMENSIONS.library
            const result = await artwork.getPixelsAtSize(dims.width, dims.height)

            expect(result.width).toBe(300)
            expect(result.height).toBe(450)
            expect(result.pixels).toBeInstanceOf(Uint8ClampedArray)
        })

        it('should fetch pixels at native size', async () => {
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            const dims = ARTWORK_DIMENSIONS.library
            
            const result = await artwork.getPixelsAtSize(dims.width, dims.height)
            
            expect(result.width).toBe(300)
            expect(result.height).toBe(450)
            expect(result.pixels).toBeInstanceOf(Uint8ClampedArray)
        })

        it('should fetch pixels at custom size', async () => {
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            const result = await artwork.getPixelsAtSize(150, 225)
            
            expect(result.width).toBe(150)
            expect(result.height).toBe(225)
        })

        it('should support full retry cycle: cache → clear → re-resolve', async () => {
            // Phase 1: Initial resolution stores selection in sidecar
            const artwork1 = provider.getArtwork(12345, 'Test Game', 'library', { library: 'https://example.com/library_600x900.jpg' })
            const dims = ARTWORK_DIMENSIONS.library
            await artwork1.getPixelsAtSize(dims.width, dims.height)

            // Verify selection was persisted
            let state = SteamArtworkStateManager.getState(12345)
            expect(state?.selectedType).toBe('library')
            expect(state?.selectedUrl).toBe('https://example.com/library_600x900.jpg')

            // Phase 2: New handle for same game reuses cached selection
            const artwork2 = provider.getArtwork(12345, 'Test Game', 'header')
            // This should reuse the library URL from cache, not use the header URL provided
            const result2 = await artwork2.getPixelsAtSize(dims.width, dims.height)
            expect(result2.width).toBe(dims.width)
            expect(result2.height).toBe(dims.height)

            // Phase 3: Retry clears selection and provider cache
            SteamArtworkStateManager.clearSelection(12345)
            provider.clearCachedOutcome(12345, 'library')

            // Verify selection was cleared
            state = SteamArtworkStateManager.getState(12345)
            expect(state?.selectedType).toBeUndefined()
            expect(state?.selectedUrl).toBeUndefined()

            // Phase 4: New handle after clear enters fresh resolution
            const artwork3 = provider.getArtwork(12345, 'Test Game', 'header', { header: 'https://example.com/header.jpg' })
            const result3 = await artwork3.getPixelsAtSize(ARTWORK_DIMENSIONS.header.width, ARTWORK_DIMENSIONS.header.height)
            expect(result3.width).toBe(ARTWORK_DIMENSIONS.header.width)
            expect(result3.height).toBe(ARTWORK_DIMENSIONS.header.height)

            // New selection should reflect the clean re-resolution
            state = SteamArtworkStateManager.getState(12345)
            expect(state?.selectedType).toBe('header')
            expect(state?.selectedUrl).toBe('https://example.com/header.jpg')
        })
    })

    describe('Persistent dead-path cache (AppDetailsCache.artwork_dead_paths)', () => {
        it('skips a known-dead CDN guess without attempting it, resolving via the next candidate', async () => {
            const deadGuess = 'https://cdn.akamai.steamstatic.com/steam/apps/2062430/library_600x900.jpg'
            // Matches how a real dead mark gets there - AppDetailsCache.markArtworkPathDead requires
            // an existing entry (see its own doc comment), so seed one directly here too.
            await AppDetailsCache.set(2062430, {
                type: 'game', name: 'BALL x PIT', artwork: NO_ARTWORK, artwork_dead_paths: [deadGuess],
            })

            // No hints supplied - strategy is CDN guesses only: library (dead), capsule, header.
            // The mocked worker succeeds for any URL, so a resolved selection of anything other
            // than the dead guess proves it was skipped rather than attempted-and-succeeded.
            const artwork = provider.getArtwork(2062430, 'BALL x PIT', 'library')
            const dims = ARTWORK_DIMENSIONS.library
            await artwork.getPixelsAtSize(dims.width, dims.height)

            const state = SteamArtworkStateManager.getState(2062430)
            expect(state?.selectedUrl).not.toBe(deadGuess)
        })

        it('persists a URL as dead once it fails, so a future strategy build can skip it', async () => {
            const doomedUrl = `https://example.com/${FAILING_URL_MARKER}.jpg`
            // markArtworkPathDead no-ops with nothing to merge into - a real appid reaching artwork
            // resolution always has some AppDetailsCache entry by then (see
            // docs/plans/startup-artwork-resolution-plan.md, Root Cause A).
            await AppDetailsCache.set(2062430, { type: 'game', name: 'BALL x PIT', artwork: NO_ARTWORK })

            expect(await AppDetailsCache.getDeadArtworkPaths(2062430)).not.toContain(doomedUrl)

            const artwork = provider.getArtwork(2062430, 'BALL x PIT', 'header', { header: doomedUrl })
            const dims = ARTWORK_DIMENSIONS.header
            await artwork.getPixelsAtSize(dims.width, dims.height)

            expect(await AppDetailsCache.getDeadArtworkPaths(2062430)).toContain(doomedUrl)
        })

        it('does not create a shell entry to record a dead path when the appid has no cache entry at all', async () => {
            const doomedUrl = `https://example.com/${FAILING_URL_MARKER}.jpg`

            const artwork = provider.getArtwork(999999, 'Unknown Game', 'header', { header: doomedUrl })
            const dims = ARTWORK_DIMENSIONS.header
            await artwork.getPixelsAtSize(dims.width, dims.height)

            expect(await AppDetailsCache.get(999999)).toBeNull()
        })
    })

    describe('Local disk art (registerLocalArtIndex / fetchPixelsFromLocalDisk)', () => {
        it('returns null when nothing is registered for the appId', async () => {
            const dims = ARTWORK_DIMENSIONS.library
            const result = await provider.fetchPixelsFromLocalDisk(12345, 'library', dims.width, dims.height)
            expect(result).toBeNull()
            expect(readArtBytesMock).not.toHaveBeenCalled()
        })

        it('returns null for capsule format - no local slot exists for it', async () => {
            provider.registerLocalArtIndex([
                { appid: 12345, library: { relative_path: 'library_600x900.jpg' } },
            ])
            const dims = ARTWORK_DIMENSIONS.capsule
            const result = await provider.fetchPixelsFromLocalDisk(12345, 'capsule', dims.width, dims.height)
            expect(result).toBeNull()
        })

        it('reads bytes and decodes via the worker when a matching slot is registered', async () => {
            provider.registerLocalArtIndex([
                { appid: 12345, library: { relative_path: 'library_600x900.jpg' } },
            ])
            readArtBytesMock.mockResolvedValue(new Uint8Array([1, 2, 3]))

            const dims = ARTWORK_DIMENSIONS.library
            const result = await provider.fetchPixelsFromLocalDisk(12345, 'library', dims.width, dims.height)

            expect(readArtBytesMock).toHaveBeenCalledWith(12345, 'library_600x900.jpg')
            expect(result?.fromCache).toBe(false)
            expect(result?.width).toBe(dims.width)
            expect(result?.height).toBe(dims.height)
        })

        it('falls through to null (not a thrown error) when the disk read fails', async () => {
            provider.registerLocalArtIndex([
                { appid: 12345, header: { relative_path: 'header.jpg' } },
            ])
            readArtBytesMock.mockRejectedValue(new Error('file moved'))

            const dims = ARTWORK_DIMENSIONS.header
            const result = await provider.fetchPixelsFromLocalDisk(12345, 'header', dims.width, dims.height)

            expect(result).toBeNull()
        })

        it('GameArtworkRequest prefers local disk over the network URL strategy', async () => {
            provider.registerLocalArtIndex([
                { appid: 12345, library: { relative_path: 'library_600x900.jpg', hash: 'abc123' } },
            ])
            readArtBytesMock.mockResolvedValue(new Uint8Array([1, 2, 3]))

            const artwork = provider.getArtwork(12345, 'Test Game', 'library', { library: 'https://example.com/art.jpg' })
            const dims = ARTWORK_DIMENSIONS.library
            const result = await artwork.getPixelsAtSize(dims.width, dims.height)

            expect(result.fromCache).toBe(false)
            expect(readArtBytesMock).toHaveBeenCalled()
            // Local disk resolution never pins SteamArtworkStateManager's selectedUrl (no real URL
            // to pin) - unaffected either way, just confirms the network strategy was never reached.
            const state = SteamArtworkStateManager.getState(12345)
            expect(state?.selectedUrl).toBeUndefined()
        })
    })
})
