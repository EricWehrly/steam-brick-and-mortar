import { EventManager, EventSource } from '../../core/EventManager'
import { SteamEventTypes } from '../../types/InteractionEvents'
import { UIManager } from '../UIManager'
import { steamApi } from '../../steam/SteamApiClient'

export class SteamUICoordinator {
    private eventManager: EventManager

    constructor() {
        this.eventManager = EventManager.getInstance()
        this.eventManager.registerEventHandler(SteamEventTypes.CacheStats, this.showCacheStats.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.ImageCacheClear, this.clearImageCache.bind(this))
    }

    loadFromCache(userInput: string): void {
        this.eventManager.emit(SteamEventTypes.LoadFromCache, {
            userInput,
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    async showCacheStats(): Promise<void> {
        try {
            const cacheManager = steamApi.getCacheManager()
            const stats = cacheManager.getStats()
            
            if (stats) {
                this.updateCacheStats(stats)
            }
        } catch (error) {
            console.error('Failed to get cache stats:', error)
        }
    }

    async clearImageCache(): Promise<void> {
        try {
            const { ImageManager } = await import('../../steam/images/ImageManager')
            await ImageManager.getInstance().clearCache()
            console.log('Image cache cleared successfully!')
        } catch (error) {
            console.error('Failed to clear image cache:', error)
        }
    }

    updateCacheStats(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
        UIManager.getInstance().steamUIPanel.updateCacheStats(stats)
    }
}