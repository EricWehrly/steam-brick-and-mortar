/**
 * Unit Tests for GameArtworkProvider
 * 
 * Tests:
 * - URL strategy building (preferred, cached, fallbacks)
 * - Failure/success caching
 * - GameArtwork handle behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataDomain } from '../../../../src/core/data/DataTypes'
import { SteamDataManager } from '../../../../src/core/data/SteamDataManager'
import { 
    GameArtworkProvider, 
    ARTWORK_DIMENSIONS,
    type GameArtwork,
    type ArtworkFormat
} from '../../../../src/scene/game-box/instancing/GameArtworkProvider'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

// Mock TextureWorker
vi.mock('../../../../src/scene/game-box/instancing/TextureWorker', () => ({
    TextureWorker: vi.fn().mockImplementation(function() { return {
        fetchAndProcessWithOptions: vi.fn().mockResolvedValue({
            imageData: new Uint8ClampedArray(300 * 450 * 4).fill(128)
        }),
        dispose: vi.fn()
    } })
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
        it('should include preferred URL first when provided', () => {
            const preferredUrl = 'https://example.com/custom-artwork.jpg'
            const strategy = provider.buildUrlStrategy(12345, 'library', preferredUrl)
            
            expect(strategy[0].url).toBe(preferredUrl)
            expect(strategy[0].type).toBe('preferred')
        })

        it('should include CDN fallback URLs for library format', () => {
            const strategy = provider.buildUrlStrategy(12345, 'library')
            
            const cdnUrl = strategy.find(s => s.url.includes('cdn.akamai.steamstatic.com'))
            expect(cdnUrl).toBeDefined()
            expect(cdnUrl?.url).toContain('library_600x900.jpg')
        })

        it('should keep preferred new CDN URL first', () => {
            const newCdnUrl = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/12345/header.jpg'
            const strategy = provider.buildUrlStrategy(12345, 'library', newCdnUrl)

            expect(strategy[0].url).toBe(newCdnUrl)
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

        it('should return URL from strategy', () => {
            const artwork = provider.getArtwork(12345, 'Test Game', 'library', 'https://preferred.com/art.jpg')
            
            const url = artwork.getUrl()
            expect(url).toBe('https://preferred.com/art.jpg')
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
        it('should check if cached', async () => {
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            const isCached = await artwork.isCached()
            
            // Our mock returns null for cache, so should be false
            expect(isCached).toBe(false)
        })

        it('should throw immediately for known permanent failures', async () => {
            provider.recordFailure(12345, 'library', 'CORS', [
                'https://cdn.akamai.steamstatic.com/steam/apps/12345/library_600x900.jpg',
                'https://cdn.akamai.steamstatic.com/steam/apps/12345/capsule_616x353.jpg',
                'https://cdn.akamai.steamstatic.com/steam/apps/12345/header.jpg',
            ])
            
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            await expect(artwork.getPixels()).rejects.toThrow('Permanent failure (CORS) - skipping retry')
        })

        it('should retry for known non-permanent failures', async () => {
            provider.recordFailure(12345, 'library', 'UNKNOWN', ['url1'])

            const artwork = provider.getArtwork(12345, 'Test Game', 'library', 'https://example.com/art.jpg')
            const result = await artwork.getPixels()

            expect(result.width).toBe(300)
            expect(result.height).toBe(450)
            expect(result.pixels).toBeInstanceOf(Uint8ClampedArray)
        })

        it('should fetch pixels at native size', async () => {
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            const result = await artwork.getPixels()
            
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
    })
})
