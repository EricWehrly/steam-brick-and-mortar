/**
 * Integration Tests for DataManager - Real-World Usage Examples
 * 
 * Tests showing how DataManager can replace global access patterns
 * and integrate with existing systems like RoomManager and SteamIntegration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataManager, DataDomain } from '../../../../src/core/data'
import type { DataMetadata } from '../../../../src/core/data'

// Mock types for integration examples
interface RoomDimensions {
    width: number
    depth: number
    height: number
}

interface GameLibrary {
    games: Array<{ appid: number; name: string }>
    getGameCount(): number
}

interface SteamIntegration {
    getGameLibrary(): GameLibrary
    getGamesForScene(): Array<{ appid: number; name: string }>
}

describe('DataManager Integration Examples', () => {
    let dataManager: DataManager

    beforeEach(() => {
        DataManager.resetInstance()
        dataManager = DataManager.getInstance()
    })

    afterEach(() => {
        dataManager.clear()
        DataManager.resetInstance()
    })

    describe('RoomManager Integration', () => {
        it('should replace global access pattern for game count', () => {
            // Setup: Mock Steam data in DataManager
            const steamMetadata: DataMetadata = {
                domain: DataDomain.SteamIntegration,
                description: 'Steam game library data',
                ttl: 30000 // 30 seconds cache
            }

            const mockGameLibrary: GameLibrary = {
                games: [
                    { appid: 1, name: 'Game 1' },
                    { appid: 2, name: 'Game 2' },
                    { appid: 3, name: 'Game 3' }
                ],
                getGameCount: () => 3
            }

            dataManager.set('steam.gameLibrary', mockGameLibrary, steamMetadata)
            dataManager.set('steam.gameCount', mockGameLibrary.getGameCount(), steamMetadata)

            // Current pattern (what we want to replace):
            // const globalApp = (window as any).steamBrickAndMortarApp
            // if (globalApp?.steamIntegration) {
            //     const gameLibrary = globalApp.steamIntegration.getGameLibrary()
            //     gameCount = gameLibrary.getGameCount()
            // }

            // New pattern using DataManager:
            const gameCount = dataManager.get<number>('steam.gameCount')

            expect(gameCount).toBe(3)
            expect(gameCount).not.toBeUndefined()
        })

        it('should provide fallback mechanism when data is not available', () => {
            // Test fallback when no data exists
            const gameCount = dataManager.getOrDefault('steam.gameCount', 0)
            expect(gameCount).toBe(0)

            // Test fallback when data is expired
            const expiredMetadata: DataMetadata = {
                domain: DataDomain.SteamIntegration,
                ttl: 1000
            }

            dataManager.set('steam.gameCount', 25, expiredMetadata)
            
            // Advance time to expire the data
            vi.useFakeTimers()
            vi.advanceTimersByTime(2000)

            const fallbackCount = dataManager.getOrDefault('steam.gameCount', 0)
            expect(fallbackCount).toBe(0)

            vi.useRealTimers()
        })

        it('should store and retrieve room dimensions', () => {
            const roomMetadata: DataMetadata = {
                domain: DataDomain.RoomManager,
                description: 'Current room dimensions'
            }

            const dimensions: RoomDimensions = {
                width: 22,
                depth: 16,
                height: 3.2
            }

            dataManager.set('room.currentDimensions', dimensions, roomMetadata)

            const retrieved = dataManager.get<RoomDimensions>('room.currentDimensions')
            expect(retrieved).toEqual(dimensions)
            expect(retrieved?.width).toBe(22)
        })
    })

    describe('Event-Driven Data Updates', () => {
        it('should handle data updates via DOM events', async () => {
            const roomMetadata: DataMetadata = {
                domain: DataDomain.RoomManager,
                description: 'Room dimensions updated via event'
            }

            // Create promise to wait for event
            const eventPromise = new Promise<CustomEvent>((resolve) => {
                const handleDataChange = (event: CustomEvent) => {
                    window.removeEventListener('data:changed', handleDataChange as EventListener)
                    resolve(event)
                }
                window.addEventListener('data:changed', handleDataChange as EventListener)
            })

            // Trigger data change
            dataManager.set('room.currentDimensions', { width: 24, depth: 18, height: 3.5 }, roomMetadata)

            // Wait for event and verify
            const event = await eventPromise
            expect(event.detail.key).toBe('room.currentDimensions')
            expect(event.detail.domain).toBe(DataDomain.RoomManager)
            expect(event.detail.newValue.width).toBe(24)
        })

        it('should emit deletion events', async () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                description: 'Temporary data for deletion test'
            }

            dataManager.set('test.deletion', 'value', metadata)

            // Create promise to wait for deletion event
            const eventPromise = new Promise<CustomEvent>((resolve) => {
                const handleDataDelete = (event: CustomEvent) => {
                    window.removeEventListener('data:deleted', handleDataDelete as EventListener)
                    resolve(event)
                }
                window.addEventListener('data:deleted', handleDataDelete as EventListener)
            })

            // Trigger deletion
            dataManager.delete('test.deletion')

            // Wait for event and verify
            const event = await eventPromise
            expect(event.detail.key).toBe('test.deletion')
            expect(event.detail.domain).toBe(DataDomain.Cache)
        })
    })

    describe('Multi-Domain Data Management', () => {
        it('should manage data across different system domains', () => {
            // Room management data
            const roomMetadata: DataMetadata = {
                domain: DataDomain.RoomManager,
                description: 'Room configuration'
            }

            // Steam integration data
            const steamMetadata: DataMetadata = {
                domain: DataDomain.SteamIntegration,
                description: 'Steam API data',
                ttl: 60000 // 1 minute cache
            }

            // User preferences
            const userMetadata: DataMetadata = {
                domain: DataDomain.UserPreferences,
                description: 'User settings'
            }

            // System configuration
            const systemMetadata: DataMetadata = {
                domain: DataDomain.SystemConfig,
                description: 'Application settings'
            }

            // Store data across domains
            dataManager.set('room.dimensions', { width: 22, depth: 16, height: 3.2 }, roomMetadata)
            dataManager.set('steam.gameCount', 50, steamMetadata)
            dataManager.set('steam.userId', 'user123', steamMetadata)
            dataManager.set('user.theme', 'dark', userMetadata)
            dataManager.set('user.language', 'en', userMetadata)
            dataManager.set('system.version', '1.0.0', systemMetadata)
            dataManager.set('system.debugMode', false, systemMetadata)

            // Verify data integrity across domains
            expect(dataManager.get('room.dimensions')).toEqual({ width: 22, depth: 16, height: 3.2 })
            expect(dataManager.get('steam.gameCount')).toBe(50)
            expect(dataManager.get('user.theme')).toBe('dark')
            expect(dataManager.get('system.version')).toBe('1.0.0')

            // Verify domain organization
            expect(dataManager.getKeysByDomain(DataDomain.RoomManager)).toHaveLength(1)
            expect(dataManager.getKeysByDomain(DataDomain.SteamIntegration)).toHaveLength(2)
            expect(dataManager.getKeysByDomain(DataDomain.UserPreferences)).toHaveLength(2)
            expect(dataManager.getKeysByDomain(DataDomain.SystemConfig)).toHaveLength(2)

            // Test bulk operations
            const steamData = dataManager.getDataByDomain(DataDomain.SteamIntegration)
            expect(Object.keys(steamData)).toHaveLength(2)
            expect(steamData['steam.gameCount']).toBe(50)
            expect(steamData['steam.userId']).toBe('user123')
        })

        it('should handle domain-specific cleanup', () => {
            const cacheMetadata: DataMetadata = { domain: DataDomain.Cache }
            const userMetadata: DataMetadata = { domain: DataDomain.UserPreferences }

            // Add data to both domains
            dataManager.set('cache.temp1', 'temp1', cacheMetadata)
            dataManager.set('cache.temp2', 'temp2', cacheMetadata)
            dataManager.set('user.setting1', 'setting1', userMetadata)
            dataManager.set('user.setting2', 'setting2', userMetadata)

            expect(dataManager.getStats().totalEntries).toBe(4)

            // Clear only cache domain
            const deletedCount = dataManager.clearDomain(DataDomain.Cache)

            expect(deletedCount).toBe(2)
            expect(dataManager.getStats().totalEntries).toBe(2)
            expect(dataManager.getKeysByDomain(DataDomain.Cache)).toHaveLength(0)
            expect(dataManager.getKeysByDomain(DataDomain.UserPreferences)).toHaveLength(2)
        })
    })

    describe('Performance and Memory Management', () => {
        it('should handle large datasets efficiently', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                description: 'Large dataset test'
            }

            // Add a significant amount of data
            for (let i = 0; i < 1000; i++) {
                dataManager.set(`cache.item${i}`, `value${i}`, metadata)
            }

            const stats = dataManager.getStats()
            expect(stats.totalEntries).toBe(1000)
            expect(stats.domains).toBe(1)

            // Verify random access performance
            const randomKey = `cache.item${Math.floor(Math.random() * 1000)}`
            const value = dataManager.get(randomKey)
            expect(value).toBeDefined()
        })

        it('should provide memory usage insights', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                description: 'Memory usage test'
            }

            const initialStats = dataManager.getStats()
            expect(initialStats.memoryUsage).toMatch(/\d+KB/)

            // Add some data
            dataManager.set('cache.largeObject', {
                data: new Array(100).fill('large string value for memory test'),
                metadata: { created: Date.now(), size: 'large' }
            }, metadata)

            const afterStats = dataManager.getStats()
            expect(afterStats.memoryUsage).toMatch(/\d+KB/)

            // Memory usage should increase (though this is approximate)
            const initialSize = parseInt(initialStats.memoryUsage.replace('~', '').replace('KB', '')) || 0
            const afterSize = parseInt(afterStats.memoryUsage.replace('~', '').replace('KB', '')) || 0
            expect(afterSize).toBeGreaterThanOrEqual(initialSize)
        })
    })
})