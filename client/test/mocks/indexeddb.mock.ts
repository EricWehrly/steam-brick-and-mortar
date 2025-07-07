/**
 * IndexedDB Mock for Testing
 * 
 * Provides a simple, synchronous mock of IndexedDB for testing environments
 * where IndexedDB is not available.
 */

import { vi } from 'vitest'

export const createIndexedDBMock = () => {
    const stores = new Map<string, Map<string, any>>()
    
    const createMockObjectStore = (storeName: string) => ({
        put: vi.fn((data: any) => {
            const request = {
                onsuccess: null as any,
                onerror: null as any
            }
            // Simulate async success
            setTimeout(() => {
                stores.get(storeName)?.set(data.url || data.id, data)
                request.onsuccess?.()
            }, 0)
            return request
        }),
        
        get: vi.fn((key: string) => {
            const request = {
                onsuccess: null as any,
                onerror: null as any,
                result: undefined as any
            }
            // Simulate async success
            setTimeout(() => {
                request.result = stores.get(storeName)?.get(key)
                request.onsuccess?.()
            }, 0)
            return request
        }),
        
        delete: vi.fn((key: string) => {
            const request = {
                onsuccess: null as any,
                onerror: null as any
            }
            setTimeout(() => {
                stores.get(storeName)?.delete(key)
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
            return createMockObjectStore(storeName)
        }),
        
        objectStoreNames: {
            contains: vi.fn((storeName: string) => false)
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
