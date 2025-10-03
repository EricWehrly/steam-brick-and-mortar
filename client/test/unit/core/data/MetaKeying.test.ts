/**
 * Unit Tests for DataManager - Meta-Keying System
 * 
 * Tests the domain-based organization and bulk operations
 * for grouping related data keys together.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataManager, DataDomain } from '../../../../src/core/data'
import type { DataMetadata } from '../../../../src/core/data'

describe('DataManager Meta-Keying System', () => {
    let dataManager: DataManager

    beforeEach(() => {
        DataManager.resetInstance()
        dataManager = DataManager.getInstance()
    })

    afterEach(() => {
        dataManager.clear()
        DataManager.resetInstance()
    })

    describe('Domain-Based Organization', () => {
        it('should organize keys by domain', () => {
            const roomMetadata: DataMetadata = { 
                domain: DataDomain.RoomManager,
                description: 'Room-related data' 
            }
            const steamMetadata: DataMetadata = { 
                domain: DataDomain.SteamIntegration,
                description: 'Steam-related data' 
            }

            dataManager.set('room.width', 22, roomMetadata)
            dataManager.set('room.height', 16, roomMetadata)
            dataManager.set('steam.gameCount', 50, steamMetadata)
            dataManager.set('steam.userId', 'user123', steamMetadata)

            const roomKeys = dataManager.getKeysByDomain(DataDomain.RoomManager)
            const steamKeys = dataManager.getKeysByDomain(DataDomain.SteamIntegration)

            expect(roomKeys).toHaveLength(2)
            expect(roomKeys).toContain('room.width')
            expect(roomKeys).toContain('room.height')

            expect(steamKeys).toHaveLength(2)
            expect(steamKeys).toContain('steam.gameCount')
            expect(steamKeys).toContain('steam.userId')
        })

        it('should return empty array for domains with no keys', () => {
            const keys = dataManager.getKeysByDomain(DataDomain.UserPreferences)
            expect(keys).toEqual([])
        })

        it('should list all active domains', () => {
            const roomMetadata: DataMetadata = { domain: DataDomain.RoomManager }
            const steamMetadata: DataMetadata = { domain: DataDomain.SteamIntegration }

            dataManager.set('room.data', 'value', roomMetadata)
            dataManager.set('steam.data', 'value', steamMetadata)

            const domains = dataManager.getDomains()
            expect(domains).toHaveLength(2)
            expect(domains).toContain(DataDomain.RoomManager)
            expect(domains).toContain(DataDomain.SteamIntegration)
        })
    })

    describe('Bulk Domain Operations', () => {
        beforeEach(() => {
            // Set up test data across multiple domains
            const roomMetadata: DataMetadata = { domain: DataDomain.RoomManager }
            const steamMetadata: DataMetadata = { domain: DataDomain.SteamIntegration }
            const userMetadata: DataMetadata = { domain: DataDomain.UserPreferences }

            dataManager.set('room.width', 22, roomMetadata)
            dataManager.set('room.height', 16, roomMetadata)
            dataManager.set('room.gameCount', 25, roomMetadata)

            dataManager.set('steam.userId', 'user123', steamMetadata)
            dataManager.set('steam.apiKey', 'secret', steamMetadata)

            dataManager.set('user.theme', 'dark', userMetadata)
            dataManager.set('user.language', 'en', userMetadata)
        })

        it('should retrieve all data for a domain', () => {
            const roomData = dataManager.getDataByDomain<number>(DataDomain.RoomManager)

            expect(Object.keys(roomData)).toHaveLength(3)
            expect(roomData['room.width']).toBe(22)
            expect(roomData['room.height']).toBe(16)
            expect(roomData['room.gameCount']).toBe(25)
        })

        it('should clear all data for a specific domain', () => {
            expect(dataManager.getKeysByDomain(DataDomain.RoomManager)).toHaveLength(3)
            expect(dataManager.getKeysByDomain(DataDomain.SteamIntegration)).toHaveLength(2)

            const deletedCount = dataManager.clearDomain(DataDomain.RoomManager)

            expect(deletedCount).toBe(3)
            expect(dataManager.getKeysByDomain(DataDomain.RoomManager)).toHaveLength(0)
            expect(dataManager.getKeysByDomain(DataDomain.SteamIntegration)).toHaveLength(2) // Unchanged
        })

        it('should handle clearing empty domains gracefully', () => {
            const deletedCount = dataManager.clearDomain(DataDomain.Cache)
            expect(deletedCount).toBe(0)
        })

        it('should clean up domain metadata when all keys are deleted', () => {
            const initialDomains = dataManager.getDomains()
            expect(initialDomains).toContain(DataDomain.RoomManager)

            dataManager.clearDomain(DataDomain.RoomManager)

            const finalDomains = dataManager.getDomains()
            expect(finalDomains).not.toContain(DataDomain.RoomManager)
        })
    })

    describe('Domain Filtering', () => {
        beforeEach(() => {
            const roomMetadata: DataMetadata = { domain: DataDomain.RoomManager }
            const steamMetadata: DataMetadata = { domain: DataDomain.SteamIntegration }

            dataManager.set('room.width', 22, roomMetadata)
            dataManager.set('room.height', 16, roomMetadata)
            dataManager.set('steam.gameCount', 50, steamMetadata)
            dataManager.set('steam.userId', 'user123', steamMetadata)
        })

        it('should filter keys by domain', () => {
            const allKeys = dataManager.getAllKeys()
            const roomKeys = dataManager.getAllKeys(DataDomain.RoomManager)

            expect(allKeys).toHaveLength(4)
            expect(roomKeys).toHaveLength(2)
            expect(roomKeys).toContain('room.width')
            expect(roomKeys).toContain('room.height')
        })

        it('should maintain domain association after updates', () => {
            const roomMetadata: DataMetadata = { domain: DataDomain.RoomManager }
            
            // Update existing key
            dataManager.set('room.width', 24, roomMetadata)
            
            const roomKeys = dataManager.getKeysByDomain(DataDomain.RoomManager)
            expect(roomKeys).toContain('room.width')
            expect(dataManager.get('room.width')).toBe(24)
        })
    })

    describe('Cross-Domain Operations', () => {
        it('should handle multiple domains simultaneously', () => {
            const roomMetadata: DataMetadata = { domain: DataDomain.RoomManager }
            const steamMetadata: DataMetadata = { domain: DataDomain.SteamIntegration }
            const userMetadata: DataMetadata = { domain: DataDomain.UserPreferences }
            const systemMetadata: DataMetadata = { domain: DataDomain.SystemConfig }

            // Add data to multiple domains
            dataManager.set('room.dimensions', { width: 22, height: 16 }, roomMetadata)
            dataManager.set('steam.gameLibrary', ['game1', 'game2'], steamMetadata)
            dataManager.set('user.preferences', { theme: 'dark' }, userMetadata)
            dataManager.set('system.version', '1.0.0', systemMetadata)

            // Verify all domains are tracked
            const domains = dataManager.getDomains()
            expect(domains).toHaveLength(4)
            expect(domains).toContain(DataDomain.RoomManager)
            expect(domains).toContain(DataDomain.SteamIntegration)
            expect(domains).toContain(DataDomain.UserPreferences)
            expect(domains).toContain(DataDomain.SystemConfig)

            // Verify data integrity across domains
            expect(dataManager.get('room.dimensions')).toEqual({ width: 22, height: 16 })
            expect(dataManager.get('steam.gameLibrary')).toEqual(['game1', 'game2'])
            expect(dataManager.get('user.preferences')).toEqual({ theme: 'dark' })
            expect(dataManager.get('system.version')).toBe('1.0.0')
        })

        it('should maintain domain separation during bulk operations', () => {
            const roomMetadata: DataMetadata = { domain: DataDomain.RoomManager }
            const steamMetadata: DataMetadata = { domain: DataDomain.SteamIntegration }

            // Add data to both domains with unique keys
            dataManager.set('room.config', 'room-value', roomMetadata)
            dataManager.set('steam.config', 'steam-value', steamMetadata)

            // Clear one domain
            dataManager.clearDomain(DataDomain.RoomManager)

            // Verify the other domain is unaffected
            expect(dataManager.get('steam.config')).toBe('steam-value')
            expect(dataManager.get('room.config')).toBeUndefined()
            expect(dataManager.getKeysByDomain(DataDomain.SteamIntegration)).toContain('steam.config')
            expect(dataManager.getKeysByDomain(DataDomain.RoomManager)).not.toContain('room.config')
        })
    })
})