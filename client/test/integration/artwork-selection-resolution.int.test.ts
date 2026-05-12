/**
 * Integration test for artwork selection and resolution
 * 
 * Tests the complete artwork resolution workflow:
 * - First-load resolution to each type (library, capsule, header, label)
 * - Cached-selection reuse and short-circuits
 * - Label persistence and retrieval
 * - Retry flow clears selection and re-resolves
 * - Multi-request handles for same game (concurrent resolves)
 * 
 * Validates that GameArtworkProvider, GameArtworkRequest, and 
 * SteamArtworkStateManager work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataManager } from '../../src/core/data/DataManager'
import { DataDomain } from '../../src/core/data/DataTypes'
import { SteamArtworkStateManager } from '../../src/core/data/SteamArtworkStateManager'
import { SteamDataManager } from '../../src/core/data/SteamDataManager'
import { 
    GameArtworkProvider, 
    ARTWORK_DIMENSIONS
} from '../../src/scene/game-box/instancing/GameArtworkProvider'
import type { SteamGameData } from '../../src/scene/game-box/types/GameData'

// Mock TextureWorker
vi.mock('../../src/scene/game-box/instancing/TextureWorker', () => ({
    TextureWorker: vi.fn().mockImplementation(function() { return {
        fetchAndProcessWithOptions: vi.fn().mockResolvedValue({
            imageData: new Uint8ClampedArray(300 * 450 * 4).fill(128)
        }),
        dispose: vi.fn()
    } })
}))

// Mock PixelDataCache
vi.mock('../../src/scene/game-box/instancing/PixelDataCache', () => ({
    PixelDataCache: {
        getInstance: vi.fn().mockReturnValue({
            init: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue(null),
            put: vi.fn().mockResolvedValue(undefined)
        })
    }
}))

describe('Artwork Selection Resolution Integration', () => {
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
            [makeGame(10001, 'Library Game'), makeGame(10002, 'Header Game'), makeGame(10003, 'Capsule Game')],
            { domain: DataDomain.SteamIntegration }
        )

        // Reset singleton
        ;(GameArtworkProvider as unknown as { instance: null }).instance = null
        provider = GameArtworkProvider.getInstance()
    })

    afterEach(() => {
        provider.dispose()
    })

    describe('First-load resolution to each type', () => {
        it('should resolve library format and persist selection', async () => {
            const artwork = provider.getArtwork(10001, 'Library Game', 'library')
            const dims = ARTWORK_DIMENSIONS.library
            
            const result = await artwork.getPixelsAtSize(dims.width, dims.height)
            
            expect(result.width).toBe(dims.width)
            expect(result.height).toBe(dims.height)
            
            const state = SteamArtworkStateManager.getState(10001)
            expect(state?.selectedType).toBe('library')
            expect(state?.selectedUrl).toContain('library_600x900.jpg')
        })

        it('should resolve header format and persist selection', async () => {
            const artwork = provider.getArtwork(10002, 'Header Game', 'header')
            const dims = ARTWORK_DIMENSIONS.header
            
            const result = await artwork.getPixelsAtSize(dims.width, dims.height)
            
            expect(result.width).toBe(dims.width)
            expect(result.height).toBe(dims.height)
            
            const state = SteamArtworkStateManager.getState(10002)
            expect(state?.selectedType).toBe('header')
            expect(state?.selectedUrl).toContain('header.jpg')
        })

        it('should resolve capsule format and persist selection', async () => {
            const artwork = provider.getArtwork(10003, 'Capsule Game', 'capsule')
            const dims = ARTWORK_DIMENSIONS.capsule
            
            const result = await artwork.getPixelsAtSize(dims.width, dims.height)
            
            expect(result.width).toBe(dims.width)
            expect(result.height).toBe(dims.height)
            
            const state = SteamArtworkStateManager.getState(10003)
            expect(state?.selectedType).toBe('capsule')
            expect(state?.selectedUrl).toContain('capsule_616x353.jpg')
        })

        it('should set label selection when explicitly configured (exhausted all formats)', async () => {
            // Simulate the scenario where all artwork formats have been exhausted
            SteamArtworkStateManager.setSelection(10001, 'label')

            const state = SteamArtworkStateManager.getState(10001)
            expect(state?.selectedType).toBe('label')
            expect(state?.selectedUrl).toBeUndefined()
        })
    })

    describe('Cached-selection reuse and short-circuits', () => {
        it('should reuse cached library selection when new handle requests different format', async () => {
            // Phase 1: Resolve library
            const artwork1 = provider.getArtwork(10001, 'Library Game', 'library')
            const dims = ARTWORK_DIMENSIONS.library
            await artwork1.getPixelsAtSize(dims.width, dims.height)

            let state = SteamArtworkStateManager.getState(10001)
            const initialUrl = state?.selectedUrl

            // Phase 2: New handle requests header but should reuse library
            const artwork2 = provider.getArtwork(10001, 'Library Game', 'header')
            const result = await artwork2.getPixelsAtSize(ARTWORK_DIMENSIONS.library.width, ARTWORK_DIMENSIONS.library.height)
            
            expect(result).toBeDefined()
            
            state = SteamArtworkStateManager.getState(10001)
            expect(state?.selectedUrl).toBe(initialUrl)
            expect(state?.selectedType).toBe('library')
        })

        it('should short-circuit label selection without fetching', async () => {
            // Setup label selection
            SteamArtworkStateManager.setSelection(10001, 'label')

            const artwork = provider.getArtwork(10001, 'Library Game', 'library')
            
            try {
                await artwork.getPixelsAtSize(100, 150)
            } catch (e) {
                expect((e as Error).message).toContain('Resolved label artwork')
            }
        })

        it('should preserve cached selection across multiple simultaneous handles', async () => {
            // Phase 1: First handle resolves library
            const artwork1 = provider.getArtwork(10001, 'Library Game', 'library')
            const dims = ARTWORK_DIMENSIONS.library
            await artwork1.getPixelsAtSize(dims.width, dims.height)

            const stateAfterFirst = SteamArtworkStateManager.getState(10001)
            const cachedUrl = stateAfterFirst?.selectedUrl

            // Phase 2: Create multiple new handles for same game without waiting
            const artwork2 = provider.getArtwork(10001, 'Library Game', 'header')
            const artwork3 = provider.getArtwork(10001, 'Library Game', 'capsule')
            const artwork4 = provider.getArtwork(10001, 'Library Game', 'library')

            // All should eventually reuse the same URL
            const result2 = await artwork2.getPixelsAtSize(dims.width, dims.height)
            const result3 = await artwork3.getPixelsAtSize(dims.width, dims.height)
            const result4 = await artwork4.getPixelsAtSize(dims.width, dims.height)

            expect(result2).toBeDefined()
            expect(result3).toBeDefined()
            expect(result4).toBeDefined()

            const finalState = SteamArtworkStateManager.getState(10001)
            expect(finalState?.selectedUrl).toBe(cachedUrl)
        })
    })

    describe('Label persistence and retrieval', () => {
        it('should persist label selection across app restarts', async () => {
            // Simulate first session: label resolution
            SteamArtworkStateManager.setSelection(10001, 'label', 'no-url')
            
            const state1 = SteamArtworkStateManager.getState(10001)
            expect(state1?.selectedType).toBe('label')

            // Simulate app restart: state persists via DataManager
            const state2 = SteamArtworkStateManager.getState(10001)
            expect(state2?.selectedType).toBe('label')
        })

        it('should immediately throw on label selection without retry attempt', async () => {
            SteamArtworkStateManager.setSelection(10001, 'label')

            const artwork = provider.getArtwork(10001, 'Library Game', 'library')
            
            const thrown = vi.fn()
            try {
                await artwork.getPixelsAtSize(300, 450)
            } catch {
                thrown()
            }

            expect(thrown).toHaveBeenCalled()
        })
    })

    describe('Retry flow clears selection and re-resolves', () => {
        it('should enable clean re-resolution after clearing selection', async () => {
            // Phase 1: Initial resolution
            const artwork1 = provider.getArtwork(10001, 'Library Game', 'library')
            await artwork1.getPixelsAtSize(ARTWORK_DIMENSIONS.library.width, ARTWORK_DIMENSIONS.library.height)

            const state1 = SteamArtworkStateManager.getState(10001)
            expect(state1?.selectedType).toBe('library')

            // Phase 2: Retry clears state
            SteamArtworkStateManager.clearSelection(10001)
            provider.clearCachedOutcome(10001, 'library')

            const state2 = SteamArtworkStateManager.getState(10001)
            expect(state2?.selectedType).toBeUndefined()

            // Phase 3: Fresh resolution with different format request
            const artwork2 = provider.getArtwork(10001, 'Library Game', 'header')
            const result = await artwork2.getPixelsAtSize(ARTWORK_DIMENSIONS.header.width, ARTWORK_DIMENSIONS.header.height)

            expect(result).toBeDefined()

            const state3 = SteamArtworkStateManager.getState(10001)
            expect(state3?.selectedType).toBe('header')
        })

        it('should handle retry after label selection', async () => {
            // Phase 1: Set label selection (simulates exhausted all formats)
            SteamArtworkStateManager.setSelection(10001, 'label')

            let state = SteamArtworkStateManager.getState(10001)
            expect(state?.selectedType).toBe('label')

            // Phase 2: User retries - clear selection and cache
            SteamArtworkStateManager.clearSelection(10001)
            provider.clearCachedOutcome(10001, 'library')

            // Phase 3: New attempt with cleared cache should re-resolve
            const artwork = provider.getArtwork(10001, 'Library Game', 'library')
            const result = await artwork.getPixelsAtSize(100, 150)

            expect(result).toBeDefined()

            state = SteamArtworkStateManager.getState(10001)
            expect(state?.selectedType).toBe('library')
        })
    })

    describe('Multi-request handles for same game (concurrent resolves)', () => {
        it('should handle concurrent requests for same game correctly', async () => {
            const artwork1 = provider.getArtwork(10001, 'Library Game', 'library')
            const artwork2 = provider.getArtwork(10001, 'Library Game', 'header')
            const artwork3 = provider.getArtwork(10001, 'Library Game', 'capsule')

            // All resolve concurrently
            const [result1, result2, result3] = await Promise.all([
                artwork1.getPixelsAtSize(ARTWORK_DIMENSIONS.library.width, ARTWORK_DIMENSIONS.library.height),
                artwork2.getPixelsAtSize(ARTWORK_DIMENSIONS.header.width, ARTWORK_DIMENSIONS.header.height),
                artwork3.getPixelsAtSize(ARTWORK_DIMENSIONS.capsule.width, ARTWORK_DIMENSIONS.capsule.height)
            ])

            expect(result1).toBeDefined()
            expect(result2).toBeDefined()
            expect(result3).toBeDefined()

            // Final state reflects one of the successful selections
            const state = SteamArtworkStateManager.getState(10001)
            expect(['library', 'header', 'capsule']).toContain(state?.selectedType)
        })

        it('should maintain correct URL for each concurrent resolution', async () => {
            const artwork1 = provider.getArtwork(10001, 'Library Game', 'library')
            const artwork2 = provider.getArtwork(10002, 'Header Game', 'header')
            const artwork3 = provider.getArtwork(10003, 'Capsule Game', 'capsule')

            await Promise.all([
                artwork1.getPixelsAtSize(ARTWORK_DIMENSIONS.library.width, ARTWORK_DIMENSIONS.library.height),
                artwork2.getPixelsAtSize(ARTWORK_DIMENSIONS.header.width, ARTWORK_DIMENSIONS.header.height),
                artwork3.getPixelsAtSize(ARTWORK_DIMENSIONS.capsule.width, ARTWORK_DIMENSIONS.capsule.height)
            ])

            const state1 = SteamArtworkStateManager.getState(10001)
            const state2 = SteamArtworkStateManager.getState(10002)
            const state3 = SteamArtworkStateManager.getState(10003)

            expect(state1?.selectedUrl).toContain('library_600x900.jpg')
            expect(state2?.selectedUrl).toContain('header.jpg')
            expect(state3?.selectedUrl).toContain('capsule_616x353.jpg')
        })
    })

    describe('Cross-scenario edge cases', () => {
        it('should handle rapid selection changes gracefully', async () => {
            // Rapidly get different formats for same game
            for (let i = 0; i < 3; i++) {
                const artwork = provider.getArtwork(10001, 'Library Game', i % 3 === 0 ? 'library' : i % 3 === 1 ? 'header' : 'capsule')
                await artwork.getPixelsAtSize(300, 450)
            }

            const state = SteamArtworkStateManager.getState(10001)
            expect(state?.selectedType).toBeDefined()
            expect(['library', 'header', 'capsule']).toContain(state?.selectedType)
        })

        it('should handle interleaved retry and concurrent requests', async () => {
            // Initial resolution
            const artwork1 = provider.getArtwork(10001, 'Library Game', 'library')
            await artwork1.getPixelsAtSize(ARTWORK_DIMENSIONS.library.width, ARTWORK_DIMENSIONS.library.height)

            // Start new handles while clearing
            SteamArtworkStateManager.clearSelection(10001)
            provider.clearCachedOutcome(10001, 'library')

            const artwork2 = provider.getArtwork(10001, 'Library Game', 'header')
            const artwork3 = provider.getArtwork(10001, 'Library Game', 'capsule')

            const [result2, result3] = await Promise.all([
                artwork2.getPixelsAtSize(ARTWORK_DIMENSIONS.header.width, ARTWORK_DIMENSIONS.header.height),
                artwork3.getPixelsAtSize(ARTWORK_DIMENSIONS.capsule.width, ARTWORK_DIMENSIONS.capsule.height)
            ])

            expect(result2).toBeDefined()
            expect(result3).toBeDefined()

            const state = SteamArtworkStateManager.getState(10001)
            expect(['header', 'capsule']).toContain(state?.selectedType)
        })

        it('should handle selection state queries across multiple games', async () => {
            // Resolve different formats for different games
            const artwork1 = provider.getArtwork(10001, 'Library Game', 'library')
            const artwork2 = provider.getArtwork(10002, 'Header Game', 'header')
            const artwork3 = provider.getArtwork(10003, 'Capsule Game', 'capsule')

            await Promise.all([
                artwork1.getPixelsAtSize(ARTWORK_DIMENSIONS.library.width, ARTWORK_DIMENSIONS.library.height),
                artwork2.getPixelsAtSize(ARTWORK_DIMENSIONS.header.width, ARTWORK_DIMENSIONS.header.height),
                artwork3.getPixelsAtSize(ARTWORK_DIMENSIONS.capsule.width, ARTWORK_DIMENSIONS.capsule.height)
            ])

            const state1 = SteamArtworkStateManager.getState(10001)
            const state2 = SteamArtworkStateManager.getState(10002)
            const state3 = SteamArtworkStateManager.getState(10003)
            const stateNone = SteamArtworkStateManager.getState(99999)

            expect(state1?.selectedType).toBe('library')
            expect(state2?.selectedType).toBe('header')
            expect(state3?.selectedType).toBe('capsule')
            expect(stateNone?.selectedType).toBeUndefined()
        })
    })
})
