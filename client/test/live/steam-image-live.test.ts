/**
 * Live tests for Steam Image downloading
 * 
 * These tests make real network calls and should be run sparingly.
 * They test actual Steam CDN image downloading to ensure our implementation works with real data.
 * 
 * Run with: yarn test:live
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ImageManager } from '../../src/steam/images/ImageManager'
import type { SteamGame } from '../../src/steam/SteamApiClientSimple'

// Real Steam game data for testing
const realGame: SteamGame = {
    appid: 220, // Half-Life 2
    name: 'Half-Life 2',
    playtime_forever: 1200,
    img_icon_url: 'fcfb366051782b8ebf2aa297f3b746395858cb62',
    img_logo_url: 'e8175d87e6df18ff32b5f15b6e2eeaac5fabec23',
    artwork: {
        icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/fcfb366051782b8ebf2aa297f3b746395858cb62.jpg',
        logo: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/e8175d87e6df18ff32b5f15b6e2eeaac5fabec23.jpg',
        header: 'https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg',
        library: 'https://cdn.akamai.steamstatic.com/steam/apps/220/library_600x900.jpg'
    }
}

describe('Steam Image Live Tests', () => {
    let imageManager: ImageManager

    beforeEach(() => {
        imageManager = new ImageManager()
    })

    describe('Real Network Downloads', () => {
        it('should download a real Steam game icon', async () => {
            const result = await imageManager.downloadImage(realGame.artwork.icon, {
                timeout: 10000,
                enableFallback: true
            })

            expect(result).not.toBeNull()
            expect(result).toBeInstanceOf(Blob)
            if (result) {
                expect(result.size).toBeGreaterThan(0)
                expect(result.type).toMatch(/image\/(jpeg|png|webp)/)
            }
        }, 15000) // Extended timeout for network calls

        it('should download all artwork types for a real game', async () => {
            const result = await imageManager.downloadGameArtwork(realGame.artwork, {
                timeout: 10000,
                enableFallback: true
            })

            // Should have all artwork types
            expect(result).toHaveProperty('icon')
            expect(result).toHaveProperty('logo') 
            expect(result).toHaveProperty('header')
            expect(result).toHaveProperty('library')

            // Icon and header should always be available
            expect(result.icon).not.toBeNull()
            expect(result.header).not.toBeNull()

            // Verify they're valid images
            if (result.icon) {
                expect(result.icon.size).toBeGreaterThan(0)
                expect(result.icon.type).toMatch(/image\/(jpeg|png|webp)/)
            }

            if (result.header) {
                expect(result.header.size).toBeGreaterThan(0)
                expect(result.header.type).toMatch(/image\/(jpeg|png|webp)/)
            }
        }, 30000) // Extended timeout for multiple downloads

        it('should handle non-existent images gracefully', async () => {
            const badUrl = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/999999/nonexistent.jpg'
            
            const result = await imageManager.downloadImage(badUrl, {
                timeout: 5000,
                enableFallback: true
            })

            expect(result).toBeNull()
        }, 10000)

        it('should respect timeout settings', async () => {
            const start = Date.now()
            
            const result = await imageManager.downloadImage(realGame.artwork.icon, {
                timeout: 1, // Very short timeout
                enableFallback: true
            })

            const elapsed = Date.now() - start
            
            // Should timeout quickly and return null
            expect(result).toBeNull()
            expect(elapsed).toBeLessThan(2000) // Should fail fast
        }, 5000)
    })

    describe('Error Handling', () => {
        it('should handle CORS errors gracefully', async () => {
            // Try to download from a URL that might have CORS issues
            const corsUrl = 'https://example.com/image.jpg'
            
            const result = await imageManager.downloadImage(corsUrl, {
                timeout: 5000,
                enableFallback: true
            })

            // Should handle gracefully and return null
            expect(result).toBeNull()
        }, 10000)

        it('should validate content types', async () => {
            // Try to download a non-image URL
            const textUrl = 'https://httpbin.org/json'
            
            const result = await imageManager.downloadImage(textUrl, {
                timeout: 5000,
                enableFallback: true
            })

            // Should reject non-image content
            expect(result).toBeNull()
        }, 10000)
    })
})
