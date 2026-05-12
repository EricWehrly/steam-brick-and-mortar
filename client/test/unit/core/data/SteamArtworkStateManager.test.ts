import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataManager } from '../../../../src/core/data/DataManager'
import { SteamArtworkStateManager } from '../../../../src/core/data/SteamArtworkStateManager'

describe('SteamArtworkStateManager', () => {
    beforeEach(() => {
        DataManager.resetInstance()
    })

    afterEach(() => {
        DataManager.getInstance().clear()
        DataManager.resetInstance()
    })

    it('stores and retrieves per-format cache entries by appid', () => {
        SteamArtworkStateManager.setCacheEntry(123, 'library', {
            reason: '404',
            urlsTried: ['u1'],
            attemptCount: 1,
            isPermanent: true,
        })

        const cache = SteamArtworkStateManager.getCacheEntry(123, 'library')
        expect(cache).toEqual({
            reason: '404',
            urlsTried: ['u1'],
            attemptCount: 1,
            isPermanent: true,
        })
    })

    it('deletes a single format entry and removes cacheByFormat when empty', () => {
        SteamArtworkStateManager.setCacheEntry(123, 'library', { reason: '404' })
        SteamArtworkStateManager.deleteCacheEntry(123, 'library')

        const state = SteamArtworkStateManager.getState(123)
        expect(state?.cacheByFormat).toBeUndefined()
    })

    it('tracks attempts and selection in sidecar state', () => {
        SteamArtworkStateManager.resetAttempts(123)
        SteamArtworkStateManager.appendAttempt(123, {
            type: 'library',
            url: 'https://example/library.jpg',
            result: 'failure',
            error: 'timeout',
        })
        SteamArtworkStateManager.setSelection(123, 'header', 'https://example/header.jpg')

        const state = SteamArtworkStateManager.getState(123)
        expect(state?.attemptResults).toHaveLength(1)
        expect(state?.selectedType).toBe('header')
        expect(state?.selectedUrl).toBe('https://example/header.jpg')
    })

    it('clears only presentation state without deleting cacheByFormat', () => {
        SteamArtworkStateManager.setCacheEntry(123, 'library', { reason: 'CORS', isPermanent: true })
        SteamArtworkStateManager.setSelection(123, 'library', 'u')
        SteamArtworkStateManager.appendAttempt(123, {
            type: 'library',
            url: 'u',
            result: 'success',
        })

        SteamArtworkStateManager.clearPresentationState(123)

        const state = SteamArtworkStateManager.getState(123)
        expect(state?.cacheByFormat?.library?.reason).toBe('CORS')
        expect(state?.selectedType).toBeUndefined()
        expect(state?.selectedUrl).toBeUndefined()
        expect(state?.attemptResults).toEqual([])
    })

    it('clears all sidecar state', () => {
        SteamArtworkStateManager.setCacheEntry(123, 'library', { reason: '404' })
        SteamArtworkStateManager.setCacheEntry(456, 'header', { reason: 'NETWORK' })

        SteamArtworkStateManager.clearAllState()

        expect(SteamArtworkStateManager.getStateMap()).toEqual({})
    })
})
