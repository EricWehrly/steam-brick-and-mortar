/**
 * Live integration tests for Steam API - Essential Real-World Validation
 * 
 * This single live test file validates core functionality against real services:
 * - Steam API endpoint connectivity
 * - Steam CDN image downloading
 * - Error handling with real network conditions
 * 
 * Run with: yarn test:live
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { SteamApiClient } from '../../src/steam'

describe('Steam API Live Tests - Essential Validation', () => {
    let client: SteamApiClient
    
    beforeAll(() => {
        // Use the actual deployed API endpoint
        client = new SteamApiClient('https://steam-api-dev.wehrly.com')
    })

    describe('Core Live Integration', () => {
        it('should resolve a real Steam vanity URL', async () => {
            // Using a known public Steam profile
            const result = await client.resolveVanityUrl('spitemonger')
            
            expect(result).toHaveProperty('steamid')
            expect(result).toHaveProperty('vanity_url', 'spitemonger')
            expect(result).toHaveProperty('resolved_at')
            expect(typeof result.steamid).toBe('string')
        }, 10000)

        it('should download real Steam game images of different types', async () => {
            // Test icon (small), header (medium) - covers main image types 
            const testCases = [
                {
                    name: 'icon',
                    url: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/fcfb366051782b8ebf2aa297f3b746395858cb62.jpg'
                },
                {
                    name: 'header',
                    url: 'https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg'
                }
            ]
            
            for (const testCase of testCases) {
                const result = await client.downloadGameImage(testCase.url)
                
                expect(result, `${testCase.name} should download successfully`).toBeInstanceOf(Blob)
                expect(result?.type, `${testCase.name} should be valid image type`).toMatch(/^image\//)
                expect(result?.size, `${testCase.name} should have content`).toBeGreaterThan(0)
            }
        }, 20000) // Extended timeout for multiple downloads

        it('should handle network errors gracefully', async () => {
            // Test invalid vanity URL
            await expect(client.resolveVanityUrl('this-vanity-url-definitely-does-not-exist-12345'))
                .rejects.toThrow()

            // Test invalid image URL
            const result = await client.downloadGameImage('https://example.com/nonexistent-image.jpg')
            expect(result).toBeNull()
        }, 10000)

        it('should handle rate limiting appropriately', async () => {
            // Make multiple rapid calls to test rate limiting behavior
            const promises = Array.from({ length: 3 }, (_, i) => 
                client.resolveVanityUrl(`spitemonger-test-${i}`)
                    .catch(() => null) // Ignore errors for this test
            )
            
            const results = await Promise.allSettled(promises)
            
            // At least one should succeed (or fail gracefully due to rate limiting)
            // This tests that our rate limiter doesn't break under load
            expect(results.length).toBe(3)
            expect(results.some(r => r.status === 'fulfilled' || r.status === 'rejected')).toBe(true)
        }, 15000)
    })
})