import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
import { AppDetailsCache } from '../../src/steam/cache/AppDetailsCache'
import type { AppDetailsData } from '../../src/steam/batch/BatchAppDetailsClient'
import { setupIndexedDBMock } from '../mocks/indexeddb.mock'

describe('AppDetailsCache', () => {
    let cache: AppDetailsCache
    
    // Test data
    const mockAppDetails: AppDetailsData = {
        type: 'game',
        appid: 10,
        name: 'Test Game',
        is_free: false,
        artwork: { header: '', capsule: '', capsule_v5: '', background: '', background_raw: '' },
        categories: [{ id: 1, description: 'Multi-player' }],
        genres: [{ id: '1', description: 'Action' }],
        developers: ['Dev'],
        publishers: ['Pub'],
        release_date: { coming_soon: false, date: '2000-11-01' },
        metacritic: { score: 88, url: '' },
        positive: 100,
        negative: 10,
        userscore: 0,
        owners: '100,000 .. 200,000'
    }

    beforeEach(async () => {
        // Setup mock IndexedDB before each test
        setupIndexedDBMock()
        cache = new AppDetailsCache()
    })

    describe('initialization', () => {
        it('should initialize successfully', async () => {
            await expect(cache.init()).resolves.toBeUndefined()
        })
    })

    describe('get / set', () => {
        it('should return null for non-existent appid', async () => {
            const result = await cache.get(999)
            expect(result).toBeNull()
        })

        it('should return cached data with isStale=false when schema versions match', async () => {
            await cache.set(10, mockAppDetails)
            const result = await cache.get(10)
            
            expect(result).not.toBeNull()
            expect(result?.appid).toBe(10)
            expect(result?.isStale).toBe(false)
        })

        it('should return data with isStale=true when schema versions mismatch', async () => {
            // Manually inject a stale record (version 1)
            await cache.init()
            await new Promise<void>((resolve) => {
                const tx = (cache as any).db.transaction('appdetails', 'readwrite')
                const store = tx.objectStore('appdetails')
                const req = store.put({
                    appid: 10,
                    data: mockAppDetails,
                    cached_at: Date.now(),
                    schema_version: AppDetailsCache.CURRENT_SCHEMA_VERSION - 1
                })
                req.onsuccess = () => resolve()
            })

            const result = await cache.get(10)
            expect(result).not.toBeNull()
            expect(result?.appid).toBe(10)
            expect(result?.isStale).toBe(true)
        })
        
        it('should return data with isStale=true when schema_version is missing', async () => {
            // Manually inject a legacy record (no schema version)
            await cache.init()
            await new Promise<void>((resolve) => {
                const tx = (cache as any).db.transaction('appdetails', 'readwrite')
                const store = tx.objectStore('appdetails')
                const req = store.put({
                    appid: 10,
                    data: mockAppDetails,
                    cached_at: Date.now()
                })
                req.onsuccess = () => resolve()
            })

            const result = await cache.get(10)
            expect(result).not.toBeNull()
            expect(result?.appid).toBe(10)
            expect(result?.isStale).toBe(true)
        })
    })

    describe('getMany / setMany', () => {
        it('should return empty map when requested array is empty', async () => {
            const results = await cache.getMany([])
            expect(results.size).toBe(0)
        })

        it('should cache and return multiple appids correctly', async () => {
            const dataMap = new Map<number, AppDetailsData>([
                [10, { ...mockAppDetails, appid: 10 }],
                [20, { ...mockAppDetails, appid: 20 }]
            ])

            await cache.setMany(dataMap)
            
            const results = await cache.getMany([10, 20, 30])
            
            expect(results.size).toBe(2)
            expect(results.get(10)?.isStale).toBe(false)
            expect(results.get(20)?.isStale).toBe(false)
            expect(results.has(30)).toBe(false)
        })
        
        it('should correctly flag mixed stale and fresh results', async () => {
            // Inject fresh 10
            await cache.set(10, { ...mockAppDetails, appid: 10 })
            
            // Inject stale 20
            await new Promise<void>((resolve) => {
                const tx = (cache as any).db.transaction('appdetails', 'readwrite')
                const store = tx.objectStore('appdetails')
                const req = store.put({
                    appid: 20,
                    data: { ...mockAppDetails, appid: 20 },
                    cached_at: Date.now(),
                    schema_version: AppDetailsCache.CURRENT_SCHEMA_VERSION - 1
                })
                req.onsuccess = () => resolve()
            })
            
            const results = await cache.getMany([10, 20])
            
            expect(results.size).toBe(2)
            expect(results.get(10)?.isStale).toBe(false)
            expect(results.get(20)?.isStale).toBe(true)
        })
    })

    describe('clear', () => {
        it('should remove all cached entries', async () => {
            await cache.set(10, mockAppDetails)
            await cache.clear()
            const result = await cache.get(10)
            expect(result).toBeNull()
        })
    })
    
    describe('getStats', () => {
        it('should return 0 count for empty cache', async () => {
            const stats = await cache.getStats()
            expect(stats.count).toBe(0)
            expect(stats.oldestEntry).toBeNull()
            expect(stats.newestEntry).toBeNull()
        })

        it('should accurately reflect populated cache stats', async () => {
            const mockDate = Date.now()
            
            // Inject with specific timestamps
            await cache.init()
            await new Promise<void>((resolve) => {
                const tx = (cache as any).db.transaction('appdetails', 'readwrite')
                const store = tx.objectStore('appdetails')
                const req1 = store.put({ appid: 1, data: mockAppDetails, cached_at: mockDate - 1000, schema_version: 2 })
                const req2 = store.put({ appid: 2, data: mockAppDetails, cached_at: mockDate, schema_version: 2 })
                
                let completed = 0
                req1.onsuccess = () => { if (++completed === 2) resolve() }
                req2.onsuccess = () => { if (++completed === 2) resolve() }
            })

            const stats = await cache.getStats()
            expect(stats.count).toBe(2)
            expect(stats.oldestEntry).toBe(mockDate - 1000)
            expect(stats.newestEntry).toBe(mockDate)
        })
    })
})