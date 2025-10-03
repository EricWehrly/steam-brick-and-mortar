/**
 * Unit Tests for DataManager - Core Functionality
 * 
 * Tests the basic data storage, retrieval, and type safety features
 * of the centralized data management system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataManager, DataDomain } from '../../../../src/core/data'
import type { DataMetadata } from '../../../../src/core/data'

describe('DataManager Core Functionality', () => {
    let dataManager: DataManager

    beforeEach(() => {
        // Reset singleton for each test
        DataManager.resetInstance()
        dataManager = DataManager.getInstance()
    })

    afterEach(() => {
        dataManager.clear()
        DataManager.resetInstance()
    })

    describe('Singleton Pattern', () => {
        it('should return the same instance on multiple calls', () => {
            const instance1 = DataManager.getInstance()
            const instance2 = DataManager.getInstance()
            
            expect(instance1).toBe(instance2)
        })

        it('should allow resetting the instance for testing', () => {
            const instance1 = DataManager.getInstance()
            DataManager.resetInstance()
            const instance2 = DataManager.getInstance()
            
            expect(instance1).not.toBe(instance2)
        })
    })

    describe('Basic Data Operations', () => {
        const testMetadata: DataMetadata = {
            domain: DataDomain.RoomManager,
            description: 'Test data entry'
        }

        it('should store and retrieve string data', () => {
            const key = 'test.string'
            const value = 'Hello, World!'
            
            dataManager.set(key, value, testMetadata)
            const retrieved = dataManager.get<string>(key)
            
            expect(retrieved).toBe(value)
        })

        it('should store and retrieve number data', () => {
            const key = 'test.number'
            const value = 42
            
            dataManager.set(key, value, testMetadata)
            const retrieved = dataManager.get<number>(key)
            
            expect(retrieved).toBe(value)
        })

        it('should store and retrieve complex object data', () => {
            const key = 'test.object'
            const value = { 
                name: 'Test Object', 
                nested: { count: 5 },
                array: [1, 2, 3]
            }
            
            dataManager.set(key, value, testMetadata)
            const retrieved = dataManager.get<typeof value>(key)
            
            expect(retrieved).toEqual(value)
            expect(retrieved?.nested.count).toBe(5)
            expect(retrieved?.array).toHaveLength(3)
        })

        it('should return undefined for non-existent keys', () => {
            const result = dataManager.get<string>('non.existent.key')
            expect(result).toBeUndefined()
        })

        it('should check key existence correctly', () => {
            const key = 'test.exists'
            
            expect(dataManager.has(key)).toBe(false)
            
            dataManager.set(key, 'value', testMetadata)
            expect(dataManager.has(key)).toBe(true)
        })

        it('should provide fallback values', () => {
            const key = 'test.fallback'
            const fallback = 'default value'
            
            const result = dataManager.getOrDefault(key, fallback)
            expect(result).toBe(fallback)
            
            dataManager.set(key, 'actual value', testMetadata)
            const result2 = dataManager.getOrDefault(key, fallback)
            expect(result2).toBe('actual value')
        })
    })

    describe('Data Deletion', () => {
        const testMetadata: DataMetadata = {
            domain: DataDomain.RoomManager,
            description: 'Test data entry'
        }

        it('should delete existing entries', () => {
            const key = 'test.delete'
            
            dataManager.set(key, 'value', testMetadata)
            expect(dataManager.has(key)).toBe(true)
            
            const deleted = dataManager.delete(key)
            expect(deleted).toBe(true)
            expect(dataManager.has(key)).toBe(false)
        })

        it('should return false when deleting non-existent entries', () => {
            const deleted = dataManager.delete('non.existent.key')
            expect(deleted).toBe(false)
        })

        it('should clear all data', () => {
            dataManager.set('key1', 'value1', testMetadata)
            dataManager.set('key2', 'value2', testMetadata)
            
            expect(dataManager.getAllKeys()).toHaveLength(2)
            
            dataManager.clear()
            expect(dataManager.getAllKeys()).toHaveLength(0)
        })
    })

    describe('Metadata Management', () => {
        it('should store and retrieve metadata', () => {
            const key = 'test.metadata'
            const metadata: DataMetadata = {
                domain: DataDomain.SteamIntegration,
                description: 'Steam game data',
                tags: ['steam', 'games']
            }
            
            dataManager.set(key, 'value', metadata)
            const retrievedMetadata = dataManager.getMetadata(key)
            
            expect(retrievedMetadata).toEqual(metadata)
            expect(retrievedMetadata?.tags).toContain('steam')
        })

        it('should return undefined metadata for non-existent keys', () => {
            const metadata = dataManager.getMetadata('non.existent.key')
            expect(metadata).toBeUndefined()
        })
    })

    describe('Statistics and Monitoring', () => {
        const testMetadata: DataMetadata = {
            domain: DataDomain.RoomManager,
            description: 'Test data entry'
        }

        it('should provide accurate statistics', () => {
            const initialStats = dataManager.getStats()
            expect(initialStats.totalEntries).toBe(0)
            
            dataManager.set('key1', 'value1', testMetadata)
            dataManager.set('key2', 'value2', testMetadata)
            
            const stats = dataManager.getStats()
            expect(stats.totalEntries).toBe(2)
            expect(stats.domains).toBeGreaterThanOrEqual(1)
            expect(stats.memoryUsage).toMatch(/\d+KB/)
        })

        it('should list all keys', () => {
            dataManager.set('key1', 'value1', testMetadata)
            dataManager.set('key2', 'value2', testMetadata)
            
            const keys = dataManager.getAllKeys()
            expect(keys).toHaveLength(2)
            expect(keys).toContain('key1')
            expect(keys).toContain('key2')
        })
    })

    describe('Type Safety', () => {
        const testMetadata: DataMetadata = {
            domain: DataDomain.RoomManager,
            description: 'Type safety test'
        }

        it('should maintain type safety for primitive types', () => {
            dataManager.set('string.key', 'string value', testMetadata)
            dataManager.set('number.key', 123, testMetadata)
            dataManager.set('boolean.key', true, testMetadata)
            
            // TypeScript should catch type mismatches at compile time
            const stringVal = dataManager.get<string>('string.key')
            const numberVal = dataManager.get<number>('number.key')
            const booleanVal = dataManager.get<boolean>('boolean.key')
            
            expect(typeof stringVal).toBe('string')
            expect(typeof numberVal).toBe('number')
            expect(typeof booleanVal).toBe('boolean')
        })

        it('should maintain type safety for complex types', () => {
            interface TestUser {
                id: number
                name: string
                preferences: {
                    theme: string
                    notifications: boolean
                }
            }
            
            const user: TestUser = {
                id: 1,
                name: 'Test User',
                preferences: {
                    theme: 'dark',
                    notifications: true
                }
            }
            
            dataManager.set('user.current', user, testMetadata)
            const retrieved = dataManager.get<TestUser>('user.current')
            
            expect(retrieved?.id).toBe(1)
            expect(retrieved?.preferences.theme).toBe('dark')
        })
    })
})