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

    it('stores and retrieves selected artwork data by appid', () => {
        SteamArtworkStateManager.setSelection(123, 'header', 'https://example/header.jpg')

        const state = SteamArtworkStateManager.getState(123)
        expect(state?.selectedType).toBe('header')
        expect(state?.selectedUrl).toBe('https://example/header.jpg')
    })

    it('clears selected artwork data for a game', () => {
        SteamArtworkStateManager.setSelection(123, 'library', 'u')

        SteamArtworkStateManager.clearSelection(123)

        const state = SteamArtworkStateManager.getState(123)
        expect(state?.selectedType).toBeUndefined()
        expect(state?.selectedUrl).toBeUndefined()
    })

    it('clears all sidecar state', () => {
        SteamArtworkStateManager.setSelection(123, 'library', 'u1')
        SteamArtworkStateManager.setSelection(456, 'header', 'u2')

        SteamArtworkStateManager.clearAllState()

        expect(SteamArtworkStateManager.getStateMap()).toEqual({})
    })
})
