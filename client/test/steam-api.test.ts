/**
 * Steam API Client Tests
 * 
 * Tests the Steam API integration with our deployed infrastructure
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SteamApiClient } from '../src/steam/SteamApiClient'

describe('SteamApiClient', () => {
    let client: SteamApiClient

    beforeEach(() => {
        client = new SteamApiClient('https://steam-api-dev.wehrly.com')
    })

    describe('validation', () => {
        it('should reject empty vanity URL', async () => {
            await expect(client.resolveVanityUrl('')).rejects.toThrow('Vanity URL cannot be empty')
            await expect(client.resolveVanityUrl('   ')).rejects.toThrow('Vanity URL cannot be empty')
        })

        it('should reject empty Steam ID', async () => {
            await expect(client.getUserGames('')).rejects.toThrow('Steam ID cannot be empty')
            await expect(client.getUserGames('   ')).rejects.toThrow('Steam ID cannot be empty')
        })

        it('should reject invalid Steam ID format', async () => {
            await expect(client.getUserGames('invalid')).rejects.toThrow('Invalid Steam ID format')
            await expect(client.getUserGames('12345')).rejects.toThrow('Invalid Steam ID format')
            await expect(client.getUserGames('1234567890123456789')).rejects.toThrow('Invalid Steam ID format')
        })
    })

    describe('API integration', () => {
        it('should handle health check', async () => {
            // Note: This will actually call the API in integration tests
            // For unit tests, we'd mock the fetch call
            const health = await client.checkHealth()
            expect(health).toBeDefined()
            expect(health.status).toBe('healthy')
        }, 15000) // 15 second timeout for network calls

        it('should resolve SpiteMonger vanity URL', async () => {
            const result = await client.resolveVanityUrl('SpiteMonger')
            expect(result.vanity_url).toBe('spitemonger') // API normalizes to lowercase
            expect(result.steamid).toBe('76561197984589530')
            expect(result.resolved_at).toBeDefined()
        }, 15000)

        it('should fetch SpiteMonger games', async () => {
            const steamId = '76561197984589530'
            const result = await client.getUserGames(steamId)
            expect(result.steamid).toBe(steamId)
            expect(result.game_count).toBeGreaterThan(0)
            expect(result.games).toBeInstanceOf(Array)
            expect(result.games.length).toBeGreaterThan(0)
            
            // Check first game has required properties
            const firstGame = result.games[0]
            expect(firstGame.appid).toBeDefined()
            expect(firstGame.name).toBeDefined()
            expect(firstGame.artwork).toBeDefined()
            expect(firstGame.artwork.icon).toBeDefined()
            expect(firstGame.artwork.header).toBeDefined()
        }, 15000)

        it('should complete full workflow for SpiteMonger', async () => {
            const result = await client.getUserGamesByVanityUrl('SpiteMonger')
            expect(result.vanity_url).toBe('spitemonger') // API normalizes to lowercase
            expect(result.steamid).toBe('76561197984589530')
            expect(result.game_count).toBeGreaterThan(0)
            expect(result.games).toBeInstanceOf(Array)
        }, 20000)

        it('should handle invalid vanity URL gracefully', async () => {
            await expect(
                client.resolveVanityUrl('this-vanity-url-should-not-exist-12345')
            ).rejects.toThrow()
        }, 15000)
    })
})
