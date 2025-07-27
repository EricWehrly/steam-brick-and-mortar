/**
 * Mock for CacheManagementUI
 * Provides a lightweight test double for cache management functionality
 */

import { vi } from 'vitest'

export class CacheManagementUIMock {
    private options: any

    constructor(options: any = {}) {
        this.options = options
    }

    init = vi.fn().mockResolvedValue(undefined)
    dispose = vi.fn()
    updateStats = vi.fn()
    refresh = vi.fn()
}

export function cacheManagementUIMockFactory() {
    return {
        CacheManagementUI: CacheManagementUIMock
    }
}
