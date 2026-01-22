/**
 * Unit Tests for GameArtworkProvider
 * 
 * Tests:
 * - URL strategy building (preferred, cached, fallbacks)
 * - Failure/success caching
 * - GameArtwork handle behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
    GameArtworkProvider, 
    ARTWORK_DIMENSIONS,
    type GameArtwork,
    type ArtworkFormat
} from '../../../../src/scene/game-box/instancing/GameArtworkProvider'

// Cache key constants for testing
const { FAILURE_CACHE_KEY, SUCCESS_CACHE_KEY } = GameArtworkProvider

// Mock TextureWorker
vi.mock('../../../../src/scene/game-box/instancing/TextureWorker', () => ({
    TextureWorker: vi.fn().mockImplementation(() => ({
        fetchAndProcessWithOptions: vi.fn().mockResolvedValue({
            imageData: new Uint8ClampedArray(300 * 450 * 4).fill(128)
        }),
        dispose: vi.fn()
    }))
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

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value }),
        removeItem: vi.fn((key: string) => { delete store[key] }),
        clear: vi.fn(() => { store = {} })
    }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('GameArtworkProvider', () => {
    let provider: GameArtworkProvider

    beforeEach(() => {
        vi.clearAllMocks()
        localStorageMock.clear()
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

        it('should not add CDN fallbacks for new CDN URLs', () => {
            const newCdnUrl = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/12345/header.jpg'
            const strategy = provider.buildUrlStrategy(12345, 'library', newCdnUrl)
            
            // Should have preferred URL but no cdn.akamai fallbacks
            expect(strategy.length).toBe(1)
            expect(strategy[0].url).toBe(newCdnUrl)
        })

        it('should use cached success URL first when available', () => {
            // Record a success
            provider.recordSuccess(12345, 'library', 'https://cached-success.com/art.jpg', 'cached-test')
            
            const strategy = provider.buildUrlStrategy(12345, 'library')
            
            expect(strategy[0].url).toBe('https://cached-success.com/art.jpg')
            expect(strategy[0].type).toBe('cached-cached-test')
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

        it('should persist failures to localStorage', () => {
            provider.recordFailure(12345, 'library', 'NETWORK', ['url1'])
            
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                FAILURE_CACHE_KEY,
                expect.any(String)
            )
        })

        it('should persist successes to localStorage', () => {
            provider.recordSuccess(12345, 'library', 'https://fallback.com/art.jpg', 'cdn-library')
            
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                SUCCESS_CACHE_KEY,
                expect.any(String)
            )
        })

        it('should clear all caches', () => {
            provider.recordFailure(12345, 'library', '404', ['url1'])
            provider.recordSuccess(67890, 'header', 'https://fallback.com', 'test')
            
            provider.clearCaches()
            
            expect(provider.isKnownFailure(12345, 'library')).toBe(false)
            expect(localStorageMock.removeItem).toHaveBeenCalledWith(FAILURE_CACHE_KEY)
            expect(localStorageMock.removeItem).toHaveBeenCalledWith(SUCCESS_CACHE_KEY)
        })
    })

    describe('GameArtwork Handle', () => {
        it('should check if cached', async () => {
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            const isCached = await artwork.isCached()
            
            // Our mock returns null for cache, so should be false
            expect(isCached).toBe(false)
        })

        it('should throw immediately for known failures', async () => {
            provider.recordFailure(12345, 'library', 'CORS', ['url1'])
            
            const artwork = provider.getArtwork(12345, 'Test Game', 'library')
            
            await expect(artwork.getPixels()).rejects.toThrow('Permanent failure (CORS) - skipping retry')
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
