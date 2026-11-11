/**
 * CacheActionHandler owns the cache tab: it reports readouts when the tab opens or Refresh is
 * pressed, and Clear Cache raises both clear events and then re-measures.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventManager } from '../../../../src/core/EventManager'
import { PixelDataCache } from '../../../../src/scene/game-box/instancing/PixelDataCache'
import {
    SteamEventTypes,
    UIEventTypes,
    type MenuPanelChangedEvent,
    type ReadoutsUpdatedEvent,
    type SettingsActionRequestedEvent
} from '../../../../src/types/InteractionEvents'
import { CacheActionHandler, formatByteCount } from '../../../../src/ui/settings/CacheActionHandler'
import { SETTINGS_ACTION } from '../../../../src/ui/settings/SettingsActions'
import { READOUT_ID } from '../../../../src/ui/settings/SettingsSchema'

describe('formatByteCount', () => {
    it('scales to the largest fitting unit', () => {
        expect(formatByteCount(0)).toBe('0 B')
        expect(formatByteCount(1536)).toBe('1.5 KB')
        expect(formatByteCount(5 * 1024 * 1024)).toBe('5 MB')
    })
})

describe('CacheActionHandler', () => {
    const eventManager = EventManager.getInstance()
    let handler: CacheActionHandler
    let readouts: ReadoutsUpdatedEvent[]
    let cleared: string[]

    function collectReadouts(event: CustomEvent<ReadoutsUpdatedEvent>): void {
        readouts.push(event.detail)
    }
    function collectCacheClear(): void { cleared.push('cache') }
    function collectImageClear(): void { cleared.push('image') }

    async function settle(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 0))
    }

    beforeEach(() => {
        readouts = []
        cleared = []
        vi.spyOn(PixelDataCache.getInstance(), 'getStorageEstimate').mockResolvedValue({ count: 7, estimatedMB: 1 })
        Object.defineProperty(navigator, 'storage', {
            configurable: true,
            value: { estimate: vi.fn().mockResolvedValue({ usage: 2048, quota: 1048576 }) }
        })
        eventManager.registerEventHandler<ReadoutsUpdatedEvent>(UIEventTypes.ReadoutsUpdated, collectReadouts)
        eventManager.registerEventHandler(SteamEventTypes.CacheClear, collectCacheClear)
        eventManager.registerEventHandler(SteamEventTypes.ImageCacheClear, collectImageClear)
        handler = new CacheActionHandler()
        handler.init()
    })

    afterEach(() => {
        handler.dispose()
        eventManager.deregisterEventHandler(UIEventTypes.ReadoutsUpdated, collectReadouts)
        eventManager.deregisterEventHandler(SteamEventTypes.CacheClear, collectCacheClear)
        eventManager.deregisterEventHandler(SteamEventTypes.ImageCacheClear, collectImageClear)
        vi.restoreAllMocks()
    })

    it('reports image count and storage when the cache tab opens', async () => {
        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: 'cache-management' })
        await settle()

        expect(readouts).toHaveLength(1)
        expect(readouts[0].values[READOUT_ID.ImageCacheCount]).toBe('7')
        expect(readouts[0].values[READOUT_ID.StorageUsage]).toBe('2 KB / 1 MB')
    })

    it('stays quiet when another tab opens', async () => {
        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: 'application' })
        await settle()

        expect(readouts).toHaveLength(0)
    })

    it('re-measures on Refresh', async () => {
        eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId: SETTINGS_ACTION.RefreshCacheStats })
        await settle()

        expect(readouts).toHaveLength(1)
    })

    it('Clear Cache raises both clear events, then re-measures', async () => {
        eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId: SETTINGS_ACTION.ClearCache })
        await settle()

        expect(cleared).toEqual(['cache', 'image'])
        expect(readouts).toHaveLength(1)
    })

    it('reports storage as unavailable when the browser has no estimate', async () => {
        Object.defineProperty(navigator, 'storage', { configurable: true, value: {} })
        eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId: SETTINGS_ACTION.RefreshCacheStats })
        await settle()

        expect(readouts[0].values[READOUT_ID.StorageUsage]).toBe('Not available')
    })

    it('ignores actions after dispose()', async () => {
        handler.dispose()
        eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId: SETTINGS_ACTION.ClearCache })
        await settle()

        expect(cleared).toEqual([])
    })
})
