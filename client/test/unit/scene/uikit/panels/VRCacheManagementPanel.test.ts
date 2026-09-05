/**
 * VRCacheManagementPanel - data-wiring tests. PixelDataCache/SteamApiClient are mocked at the
 * module boundary (same pattern as GameArtworkProvider.test.ts / LocalSteamLibraryLoader.test.ts)
 * rather than exercised for real - this panel's own job is rendering what they hand it, not
 * gathering it correctly.
 *
 * Button clicks (Refresh, Load, Clear Cache's arm/confirm) aren't simulated here - no other ported
 * VR panel test does either (see VRDebugPanel.test.ts), since there's no click-simulation harness
 * for @pmndrs/uikit-default's Button in this suite yet. What's covered instead: the same data-load
 * methods those clicks call, invoked directly, and the resulting Text updates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Text } from '@pmndrs/uikit'
import { EventManager } from '../../../../../src/core/EventManager'
import { SteamEventTypes } from '../../../../../src/types/InteractionEvents'
import { VRCacheManagementPanel } from '../../../../../src/scene/uikit/panels/VRCacheManagementPanel'

const getStorageEstimateMock = vi.fn()
vi.mock('../../../../../src/scene/game-box/instancing/PixelDataCache', () => ({
    PixelDataCache: {
        getInstance: () => ({ getStorageEstimate: getStorageEstimateMock })
    }
}))

const getCachedUsersMock = vi.fn()
vi.mock('../../../../../src/steam/SteamApiClient', () => ({
    SteamApiClient: {
        getInstance: () => ({ getCachedUsers: getCachedUsersMock })
    }
}))

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

describe('VRCacheManagementPanel', () => {
    beforeEach(() => {
        getStorageEstimateMock.mockReset().mockResolvedValue({ count: 0, estimatedMB: 0 })
        getCachedUsersMock.mockReset().mockReturnValue([])
    })

    it('constructs a real uikit component tree without throwing', () => {
        expect(() => new VRCacheManagementPanel()).not.toThrow()
    })

    it('exposes its root container for the tab shell to mount', () => {
        const panel = new VRCacheManagementPanel()
        expect(panel.container).toBeDefined()
    })

    it('populates the image-count stat from PixelDataCache on construction', async () => {
        getStorageEstimateMock.mockResolvedValue({ count: 7, estimatedMB: 3 })
        const setPropertiesSpy = vi.spyOn(Text.prototype, 'setProperties')

        new VRCacheManagementPanel()
        await flushMicrotasks()

        expect(setPropertiesSpy).toHaveBeenCalledWith(expect.objectContaining({ text: '7' }))
    })

    it('shows the empty-state message when there are no cached users', async () => {
        getCachedUsersMock.mockReturnValue([])
        const panel = new VRCacheManagementPanel()
        await flushMicrotasks()

        const usersList = panel.container.children[3]
        expect(usersList.children.some(child => child instanceof Text && (child as unknown as { inputProperties: { text: string } }).inputProperties.text === 'No cached users found')).toBe(true)
    })

    it('builds one row per cached user, each with its own Load button', async () => {
        getCachedUsersMock.mockReturnValue([
            { vanityUrl: 'alice', displayName: 'Alice', gameCount: 12, steamId: '1' },
            { vanityUrl: 'bob', displayName: 'Bob', gameCount: 5, steamId: '2' }
        ])
        const panel = new VRCacheManagementPanel()
        await flushMicrotasks()

        const usersList = panel.container.children[3]
        expect(usersList.children).toHaveLength(2)
    })

    it('emits SteamEventTypes.LoadLibrary for the clicked user\'s vanity URL', async () => {
        getCachedUsersMock.mockReturnValue([
            { vanityUrl: 'alice', displayName: 'Alice', gameCount: 12, steamId: '1' }
        ])
        const emitSpy = vi.spyOn(EventManager.getInstance(), 'emit')

        const panel = new VRCacheManagementPanel()
        await flushMicrotasks()

        const usersList = panel.container.children[3]
        const row = usersList.children[0]
        const loadButton = row.children[1] as unknown as { inputProperties: { onClick: () => void } }
        loadButton.inputProperties.onClick()

        expect(emitSpy).toHaveBeenCalledWith(SteamEventTypes.LoadLibrary, expect.objectContaining({ userInput: 'alice' }))
    })
})
