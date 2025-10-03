/**
 * Unit Tests for DataManager - TTL and Data Expiration
 * 
 * Tests the time-to-live functionality and automatic cleanup
 * of expired data entries.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataManager, DataDomain } from '../../../../src/core/data'
import type { DataMetadata } from '../../../../src/core/data'

describe('DataManager TTL and Expiration', () => {
    let dataManager: DataManager

    beforeEach(() => {
        DataManager.resetInstance()
        dataManager = DataManager.getInstance()
        vi.useFakeTimers()
    })

    afterEach(() => {
        dataManager.clear()
        DataManager.resetInstance()
        vi.useRealTimers()
    })

    describe('Time-To-Live (TTL)', () => {
        it('should store data with TTL', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                description: 'Temporary cache data',
                ttl: 5000 // 5 seconds
            }

            dataManager.set('cache.temp', 'temporary value', metadata)
            
            expect(dataManager.has('cache.temp')).toBe(true)
            expect(dataManager.get('cache.temp')).toBe('temporary value')
        })

        it('should expire data after TTL', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                description: 'Temporary cache data',
                ttl: 5000 // 5 seconds
            }

            dataManager.set('cache.temp', 'temporary value', metadata)
            
            // Data should exist immediately
            expect(dataManager.has('cache.temp')).toBe(true)
            
            // Advance time by 6 seconds (past TTL)
            vi.advanceTimersByTime(6000)
            
            // Data should be expired
            expect(dataManager.has('cache.temp')).toBe(false)
            expect(dataManager.get('cache.temp')).toBeUndefined()
        })

        it('should handle data without TTL as permanent', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.UserPreferences,
                description: 'Permanent user data'
                // No TTL specified
            }

            dataManager.set('user.permanent', 'permanent value', metadata)
            
            // Advance time significantly
            vi.advanceTimersByTime(24 * 60 * 60 * 1000) // 24 hours
            
            // Data should still exist
            expect(dataManager.has('user.permanent')).toBe(true)
            expect(dataManager.get('user.permanent')).toBe('permanent value')
        })

        it('should handle multiple items with different TTLs', () => {
            const shortMetadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 1000 // 1 second
            }
            const longMetadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 10000 // 10 seconds
            }

            dataManager.set('cache.short', 'short-lived', shortMetadata)
            dataManager.set('cache.long', 'long-lived', longMetadata)

            // Both should exist initially
            expect(dataManager.has('cache.short')).toBe(true)
            expect(dataManager.has('cache.long')).toBe(true)

            // Advance time by 2 seconds
            vi.advanceTimersByTime(2000)

            // Short-lived should be expired, long-lived should remain
            expect(dataManager.has('cache.short')).toBe(false)
            expect(dataManager.has('cache.long')).toBe(true)

            // Advance time by 10 more seconds
            vi.advanceTimersByTime(10000)

            // Both should be expired now
            expect(dataManager.has('cache.short')).toBe(false)
            expect(dataManager.has('cache.long')).toBe(false)
        })
    })

    describe('Automatic Cleanup', () => {
        it('should clean up expired entries', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 1000 // 1 second
            }

            dataManager.set('cache.item1', 'value1', metadata)
            dataManager.set('cache.item2', 'value2', metadata)
            dataManager.set('cache.item3', 'value3', metadata)

            expect(dataManager.getStats().totalEntries).toBe(3)

            // Advance time past TTL
            vi.advanceTimersByTime(2000)

            // Run cleanup
            const cleanedCount = dataManager.cleanup()

            expect(cleanedCount).toBe(3)
            expect(dataManager.getStats().totalEntries).toBe(0)
        })

        it('should only clean up expired entries', () => {
            const expiredMetadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 1000 // 1 second
            }
            const validMetadata: DataMetadata = {
                domain: DataDomain.UserPreferences,
                // No TTL - permanent
            }

            dataManager.set('cache.expired', 'will expire', expiredMetadata)
            dataManager.set('user.permanent', 'will remain', validMetadata)

            expect(dataManager.getStats().totalEntries).toBe(2)

            // Advance time past the cache TTL
            vi.advanceTimersByTime(2000)

            // Run cleanup
            const cleanedCount = dataManager.cleanup()

            expect(cleanedCount).toBe(1)
            expect(dataManager.getStats().totalEntries).toBe(1)
            expect(dataManager.has('user.permanent')).toBe(true)
            expect(dataManager.has('cache.expired')).toBe(false)
        })

        it('should handle cleanup with no expired entries', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.UserPreferences,
                description: 'Non-expiring data'
            }

            dataManager.set('user.data', 'permanent', metadata)

            const cleanedCount = dataManager.cleanup()
            expect(cleanedCount).toBe(0)
            expect(dataManager.has('user.data')).toBe(true)
        })
    })

    describe('Expiration Edge Cases', () => {
        it('should handle exactly expired entries', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 5000 // 5 seconds exactly
            }

            dataManager.set('cache.exact', 'value', metadata)

            // Advance time to exactly the TTL - should still be valid
            vi.advanceTimersByTime(5000)
            expect(dataManager.has('cache.exact')).toBe(true)

            // Advance time beyond TTL - now should be expired
            vi.advanceTimersByTime(1)
            expect(dataManager.has('cache.exact')).toBe(false)
        })

        it('should handle very short TTL', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 1 // 1 millisecond
            }

            dataManager.set('cache.veryShort', 'value', metadata)

            // Should exist immediately
            expect(dataManager.has('cache.veryShort')).toBe(true)

            // Advance by 2ms
            vi.advanceTimersByTime(2)

            // Should be expired
            expect(dataManager.has('cache.veryShort')).toBe(false)
        })

        it('should update TTL when overwriting data', () => {
            const shortMetadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 1000 // 1 second
            }
            const longMetadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 10000 // 10 seconds
            }

            dataManager.set('cache.updateTTL', 'original', shortMetadata)

            // Advance time past original TTL but before new TTL
            vi.advanceTimersByTime(2000)

            // Update with longer TTL
            dataManager.set('cache.updateTTL', 'updated', longMetadata)

            // Should still exist because of new TTL
            expect(dataManager.has('cache.updateTTL')).toBe(true)
            expect(dataManager.get('cache.updateTTL')).toBe('updated')

            // Advance time past new TTL (need 1ms more than TTL)
            vi.advanceTimersByTime(10001)

            // Should now be expired
            expect(dataManager.has('cache.updateTTL')).toBe(false)
        })
    })

    describe('Domain Cleanup with TTL', () => {
        it('should clean up expired entries from meta-store', () => {
            const metadata: DataMetadata = {
                domain: DataDomain.Cache,
                ttl: 1000
            }

            dataManager.set('cache.item1', 'value1', metadata)
            dataManager.set('cache.item2', 'value2', metadata)

            // Verify domain tracking
            expect(dataManager.getKeysByDomain(DataDomain.Cache)).toHaveLength(2)
            expect(dataManager.getDomains()).toContain(DataDomain.Cache)

            // Expire the data
            vi.advanceTimersByTime(2000)

            // Access one item to trigger expiration cleanup
            dataManager.has('cache.item1')
            dataManager.has('cache.item2')

            // Domain should be cleaned up
            expect(dataManager.getKeysByDomain(DataDomain.Cache)).toHaveLength(0)
            expect(dataManager.getDomains()).not.toContain(DataDomain.Cache)
        })
    })
})