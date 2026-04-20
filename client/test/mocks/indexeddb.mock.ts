/**
 * IndexedDB Mock for Testing
 * 
 * Provides a simple, synchronous mock of IndexedDB for testing environments
 * where IndexedDB is not available.
 */

import { vi } from 'vitest'

export const createIndexedDBMock = () => {
    const stores = new Map<string, Map<string, any>>()
    const storeKeyPaths = new Map<string, string | undefined>()

    const getStoreKey = (storeName: string, data: Record<string, unknown>): string => {
        const keyPath = storeKeyPaths.get(storeName)
        if (keyPath && keyPath in data) {
            return String(data[keyPath])
        }

        const fallbackKey = data.url ?? data.id ?? data.appid
        return String(fallbackKey)
    }

    const getStoreValuesSortedByCachedAt = (storeName: string, direction: 'next' | 'prev'): any[] => {
        const values = Array.from(stores.get(storeName)?.values() || [])
        values.sort((a, b) => {
            const aCached = typeof a?.cached_at === 'number' ? a.cached_at : 0
            const bCached = typeof b?.cached_at === 'number' ? b.cached_at : 0
            return direction === 'next' ? aCached - bCached : bCached - aCached
        })
        return values
    }
    
    const createMockObjectStore = (storeName: string) => ({
        put: vi.fn((data: any) => {
            const request = {
                onsuccess: null as any,
                onerror: null as any
            }
            // Simulate async success
            setTimeout(() => {
                const key = getStoreKey(storeName, data)
                stores.get(storeName)?.set(key, data)
                request.onsuccess?.()
            }, 0)
            return request
        }),
        
        get: vi.fn((key: string | number) => {
            const request = {
                onsuccess: null as any,
                onerror: null as any,
                result: undefined as any
            }
            // Simulate async success
            setTimeout(() => {
                request.result = stores.get(storeName)?.get(String(key))
                request.onsuccess?.()
            }, 0)
            return request
        }),
        
        delete: vi.fn((key: string | number) => {
            const request = {
                onsuccess: null as any,
                onerror: null as any
            }
            setTimeout(() => {
                stores.get(storeName)?.delete(String(key))
                request.onsuccess?.()
            }, 0)
            return request
        }),
        
        clear: vi.fn(() => {
            const request = {
                onsuccess: null as any,
                onerror: null as any
            }
            setTimeout(() => {
                stores.get(storeName)?.clear()
                request.onsuccess?.()
            }, 0)
            return request
        }),

        count: vi.fn(() => {
            const request = {
                onsuccess: null as any,
                onerror: null as any,
                result: 0
            }
            setTimeout(() => {
                request.result = stores.get(storeName)?.size || 0
                request.onsuccess?.()
            }, 0)
            return request
        }),

        index: vi.fn(() => ({
            openCursor: vi.fn((_: unknown, direction: 'next' | 'prev' = 'next') => {
                const request = {
                    onsuccess: null as any,
                    onerror: null as any,
                    result: null as any
                }

                setTimeout(() => {
                    const sortedValues = getStoreValuesSortedByCachedAt(storeName, direction)
                    request.result = sortedValues.length > 0 ? { value: sortedValues[0] } : null
                    request.onsuccess?.()
                }, 0)

                return request
            })
        })),
        
        getAll: vi.fn(() => {
            const request = {
                onsuccess: null as any,
                onerror: null as any,
                result: []
            }
            setTimeout(() => {
                request.result = Array.from(stores.get(storeName)?.values() || [])
                request.onsuccess?.()
            }, 0)
            return request
        }),
        
        createIndex: vi.fn()
    })
    
    return {
        transaction: vi.fn((storeNames: string[], mode: string) => ({
            objectStore: vi.fn((storeName: string) => createMockObjectStore(storeName))
        })),
        
        createObjectStore: vi.fn((storeName: string, options: any) => {
            stores.set(storeName, new Map())
            storeKeyPaths.set(storeName, options?.keyPath)
            return createMockObjectStore(storeName)
        }),
        
        objectStoreNames: {
            contains: vi.fn((storeName: string) => stores.has(storeName))
        },
        
        close: vi.fn()
    }
}

export const setupIndexedDBMock = () => {
    const mockDatabase = createIndexedDBMock()
    
    ;(globalThis as any).indexedDB = {
        open: vi.fn((dbName: string, version: number) => {
            const request = {
                onsuccess: null as any,
                onerror: null as any,
                onupgradeneeded: null as any,
                result: mockDatabase
            }
            
            // Simulate successful open
            setTimeout(() => {
                // Trigger upgrade if needed
                if (request.onupgradeneeded) {
                    request.onupgradeneeded({ target: request } as any)
                }
                request.onsuccess?.()
            }, 0)
            
            return request
        })
    }
    
    return mockDatabase
}
