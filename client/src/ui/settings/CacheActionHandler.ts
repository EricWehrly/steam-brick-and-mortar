/**
 * Owns the cache tab's behaviour: reports the image-cache and browser-storage readouts when the
 * tab opens or Refresh is pressed, and carries out Clear Cache by raising the same two clear
 * events the DOM CacheManagementPanel does (see cache-clear-domain-unification in
 * docs/tech-debt.md) before re-measuring.
 */

import { EventManager, EventSource } from '../../core/EventManager'
import { PixelDataCache } from '../../scene/game-box/instancing/PixelDataCache'
import {
    SteamEventTypes,
    UIEventTypes,
    type MenuPanelChangedEvent,
    type ReadoutsUpdatedEvent,
    type SettingsActionRequestedEvent,
    type SteamCacheClearEvent,
    type SteamImageCacheClearEvent
} from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'
import { SETTINGS_ACTION } from './SettingsActions'
import { READOUT_ID } from './SettingsSchema'

const logger = Logger.createLogFunctions('CacheActionHandler')

const CACHE_PANEL_ID = 'cache-management'
const BYTES_PER_UNIT = 1024
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const
const STORAGE_UNAVAILABLE = 'Not available'

export function formatByteCount(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)), BYTE_UNITS.length - 1)
    return `${parseFloat((bytes / BYTES_PER_UNIT ** unit).toFixed(2))} ${BYTE_UNITS[unit]}`
}

export class CacheActionHandler {
    private readonly eventManager = EventManager.getInstance()

    init(): void {
        this.eventManager.registerEventHandler<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, this.actOnRequest)
        this.eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, this.reportOnTabOpened)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.SettingsActionRequested, this.actOnRequest)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuPanelChanged, this.reportOnTabOpened)
    }

    private readonly actOnRequest = (event: CustomEvent<SettingsActionRequestedEvent>): void => {
        if (event.detail.actionId === SETTINGS_ACTION.ClearCache) this.clearCaches()
        if (event.detail.actionId === SETTINGS_ACTION.RefreshCacheStats) void this.reportStats()
    }

    private readonly reportOnTabOpened = (event: CustomEvent<MenuPanelChangedEvent>): void => {
        if (event.detail.panelId === CACHE_PANEL_ID) void this.reportStats()
    }

    private clearCaches(): void {
        this.eventManager.emit<SteamCacheClearEvent>(SteamEventTypes.CacheClear, { scope: 'all', source: EventSource.UI })
        this.eventManager.emit<SteamImageCacheClearEvent>(SteamEventTypes.ImageCacheClear, { source: EventSource.UI })
        void this.reportStats()
    }

    private async reportStats(): Promise<void> {
        try {
            const pixelStats = await PixelDataCache.getInstance().getStorageEstimate()
            this.eventManager.emit<ReadoutsUpdatedEvent>(UIEventTypes.ReadoutsUpdated, {
                values: {
                    [READOUT_ID.ImageCacheCount]: String(pixelStats.count),
                    [READOUT_ID.StorageUsage]: await this.describeStorage()
                },
                source: EventSource.UI
            })
        } catch (error) {
            logger.error('Failed to read cache statistics', error)
        }
    }

    private async describeStorage(): Promise<string> {
        if (!('storage' in navigator) || !('estimate' in navigator.storage)) return STORAGE_UNAVAILABLE
        const { usage = 0, quota = 0 } = await navigator.storage.estimate()
        return `${formatByteCount(usage)} / ${formatByteCount(quota)}`
    }
}
