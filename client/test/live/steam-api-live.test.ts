/**
 * Live integration tests for Steam API Client
 * These tests make actual network calls to verify real API integration
 * 
 * Run with: yarn test:live
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { SteamApiClient } from '../../src/steam/SteamApiClientSimple'

describe('Steam API Live Tests', () => {
    let client: SteamApiClient
    
    beforeAll(() => {
        // Use the actual deployed API endpoint
        client = new SteamApiClient('https://steam-api-dev.wehrly.com')
    })

    describe('Live API Integration', () => {
        it('should resolve a real Steam vanity URL', async () => {
            // Using a known public Steam profile
            const result = await client.resolveVanityUrl('spitemonger')
            
            expect(result).toHaveProperty('steamid')
            expect(result).toHaveProperty('vanity_url', 'spitemonger')
            expect(result).toHaveProperty('resolved_at')
            expect(typeof result.steamid).toBe('string')
        }, 10000) // 10 second timeout for network call

        it('should download a real Steam game image', async () => {
            // Use a well-known game icon URL
            const iconUrl = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/half_life_2.jpg'
            
            const result = await client.downloadGameImage(iconUrl)
            
            expect(result).toBeInstanceOf(Blob)
            expect(result?.type).toMatch(/^image\//)
            expect(result?.size).toBeGreaterThan(0)
        }, 15000) // 15 second timeout for image download

        it('should handle invalid vanity URL gracefully', async () => {
            await expect(client.resolveVanityUrl('this-vanity-url-definitely-does-not-exist-12345'))
                .rejects.toThrow()
        }, 10000)

        it('should handle invalid image URL gracefully', async () => {
            const result = await client.downloadGameImage('https://example.com/nonexistent-image.jpg')
            
            expect(result).toBeNull()
        }, 10000)
    })

    describe('Cache Behavior with Live Data', () => {
        it('should cache live API responses', async () => {
            const startTime = Date.now()
            
            // First call (should hit API)
            await client.resolveVanityUrl('spitemonger')
            const firstCallTime = Date.now() - startTime
            
            const secondStartTime = Date.now()
            
            // Second call (should use cache)
            await client.resolveVanityUrl('spitemonger')
            const secondCallTime = Date.now() - secondStartTime
            
            // Cache should be significantly faster
            expect(secondCallTime).toBeLessThan(firstCallTime / 2)
        }, 15000)
    })
})
