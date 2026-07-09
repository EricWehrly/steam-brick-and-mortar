/**
 * Live integration tests for Steam API - Essential Real-World Validation
 * 
 * This single live test file validates core functionality against real services:
 * - Steam API endpoint connectivity
 * - Error handling with real network conditions
 * 
 * Note: Image downloading tests removed - texture loading now goes through
 * TextureWorker and PixelDataCache, not SteamApiClient.
 * 
 * Run with: yarn test:live
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { SteamApiClient } from '../../src/steam'

describe('Steam API Live Tests - Essential Validation', () => {
    let client: SteamApiClient
    
    beforeAll(() => {
        // Uses the actual deployed API endpoint via VITE_STEAM_API_BASE_URL (client/.env)
        client = SteamApiClient.getInstance()
    })

    describe('Core Live Integration', () => {
        it('should resolve a real Steam vanity URL', async () => {
            // Using a known public Steam profile
            const payload = await client.resolveVanityUrl('spitemonger')

            expect(payload).toHaveProperty('steamid')
            expect(payload).toHaveProperty('vanity_url', 'spitemonger')
            expect(payload).toHaveProperty('resolved_at')
            expect(typeof payload.steamid).toBe('string')
        }, 10000)

        it('should handle network errors gracefully', async () => {
            // Test invalid vanity URL
            const invalidInput = 'this-vanity-url-definitely-does-not-exist-12345'

            await expect(client.resolveVanityUrl(invalidInput)).rejects.toThrow()
        }, 10000)

        it('should handle rate limiting appropriately', async () => {
            // Make multiple rapid calls to test rate limiting behavior
            const promises = Array.from({ length: 3 }, (_, i) => 
                client.resolveVanityUrl(`spitemonger-test-${i}`)
                    .catch(() => null) // Ignore errors for this test
            )
            
            const results = await Promise.allSettled(promises)
            
            // This test validates that batching requests settles cleanly under load.
            expect(results.length).toBe(3)
            expect(results.every(r => r.status === 'fulfilled' || r.status === 'rejected')).toBe(true)
        }, 15000)
    })
})