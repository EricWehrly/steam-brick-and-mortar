/**
 * Test utilities for Steam API testing
 * Provides common mocks, fixtures, and test helpers
 */

import { vi } from 'vitest'
import type { SteamGame, SteamUser } from '../../src/steam/SteamApiClientSimple'

export const mockGame: SteamGame = {
    appid: 220,
    name: 'Half-Life 2',
    playtime_forever: 1200,
    img_icon_url: 'test_icon',
    img_logo_url: 'test_logo',
    artwork: {
        icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/test_icon.jpg',
        logo: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/220/test_logo.jpg',
        header: 'https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg',
        library: 'https://cdn.akamai.steamstatic.com/steam/apps/220/library_600x900.jpg'
    }
}

export const mockUser: SteamUser = {
    steamid: '76561197984589530',
    vanity_url: 'testuser',
    game_count: 1,
    retrieved_at: new Date().toISOString(),
    games: [mockGame]
}

export function createMockBlob(type = 'image/jpeg', content = 'fake image data'): Blob {
    return new Blob([content], { type })
}

export function createMockFetchResponse(blob: Blob, ok = true) {
    return {
        ok,
        blob: vi.fn().mockResolvedValue(blob),
        status: ok ? 200 : 500,
        statusText: ok ? 'OK' : 'Internal Server Error'
    }
}

export function setupFetchMock() {
    ;(globalThis as any).fetch = vi.fn()
    return globalThis.fetch as any
}

export function setupLocalStorageMock() {
    const storage = new Map<string, string>()
    
    const localStorageMock = {
        storage,
        getItem: vi.fn((key: string) => storage.get(key) || null),
        setItem: vi.fn((key: string, value: string) => {
            storage.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
            storage.delete(key)
        }),
        clear: vi.fn(() => {
            storage.clear()
        }),
        get length() {
            return storage.size
        },
        key: vi.fn((index: number) => {
            const keys = Array.from(storage.keys())
            return keys[index] || null
        })
    }

    Object.defineProperty(globalThis, 'localStorage', {
        value: localStorageMock,
        writable: true
    })
    
    return localStorageMock
}

export function setupAbortControllerMock() {
    const mockAbortController = {
        signal: { aborted: false },
        abort: vi.fn()
    }
    ;(globalThis as any).AbortController = vi.fn(() => mockAbortController)
    return mockAbortController
}
