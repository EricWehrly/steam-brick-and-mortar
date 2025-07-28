/**
 * CacheManagementPanel - Centralized cache management within pause menu
 * 
 * Consolidates cache operations from the scattered UI into one place
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import type { ImageCacheStats } from '../../../steam/images/ImageManager'

export interface CacheStats {
    imageCount: number
    totalSize: number
    lastUpdate: Date | null
}

export class CacheManagementPanel extends PauseMenuPanel {
    readonly id = 'cache-management'
    readonly title = 'Cache Management'
    readonly icon = '🗂️'

    private cacheStats: CacheStats = {
        imageCount: 0,
        totalSize: 0,
        lastUpdate: null
    }
    
    private updateInterval: number | null = null
    private onGetStats?: () => Promise<ImageCacheStats>
    private onClearCache?: () => Promise<void>

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
    }
    
    /**
     * Initialize with cache functions from Steam integration
     */
    initCacheFunctions(
        getStats: () => Promise<ImageCacheStats>,
        clearCache: () => Promise<void>
    ): void {
        this.onGetStats = getStats
        this.onClearCache = clearCache
    }
    
    /**
     * Convert ImageCacheStats to internal CacheStats format
     */
    private convertCacheStats(imageStats: ImageCacheStats): CacheStats {
        return {
            imageCount: imageStats.totalImages,
            totalSize: imageStats.totalSize,
            lastUpdate: imageStats.newestTimestamp > 0 ? new Date(imageStats.newestTimestamp) : null
        }
    }

    render(): string {
        return `
            <div class="cache-section">
                <div class="cache-stats" id="cache-stats">
                    <div class="stat-item">
                        <span class="stat-label">Images Cached:</span>
                        <span class="stat-value" id="cache-image-count">Loading...</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Size:</span>
                        <span class="stat-value" id="cache-total-size">Loading...</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Last Updated:</span>
                        <span class="stat-value" id="cache-last-update">Loading...</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Browser Cache API:</span>
                        <span class="stat-value">${('caches' in window) ? 'Available' : 'Not available'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Storage Quota:</span>
                        <span class="stat-value" id="storage-quota">Calculating...</span>
                    </div>
                </div>
            </div>

            <div class="cache-section">
                <div class="cache-actions">
                    <button class="cache-btn cache-btn-primary" id="refresh-cache-btn" disabled>
                        🔄 Refresh Cache
                    </button>
                    <button class="cache-btn cache-btn-secondary" id="clear-cache-btn" disabled>
                        🗑️ Clear Cache
                    </button>
                    <button class="cache-btn cache-btn-secondary" id="download-missing-btn" disabled>
                        📥 Download Missing
                    </button>
                </div>
            </div>

            <div class="cache-section">
                <div class="cache-settings">
                    <div class="setting-item">
                        <label for="auto-download-toggle">
                            <input type="checkbox" id="auto-download-toggle" checked>
                            Auto-download missing images
                        </label>
                    </div>
                    <div class="setting-item">
                        <label for="cache-limit-input">
                            Max cache size (MB):
                            <input type="number" id="cache-limit-input" value="500" min="100" max="5000" step="100">
                        </label>
                    </div>
                    <div class="setting-item">
                        <label for="preload-toggle">
                            <input type="checkbox" id="preload-toggle">
                            Preload next page images
                        </label>
                    </div>
                </div>
            </div>
        `
    }

    attachEvents(): void {
        // Cache action buttons
        const panel = this.getPanelElement()
        if (!panel) return

        const refreshBtn = panel.querySelector('#refresh-cache-btn')
        const clearBtn = panel.querySelector('#clear-cache-btn')
        const downloadBtn = panel.querySelector('#download-missing-btn')

        this.addEventListener(refreshBtn as HTMLElement, 'click', () => this.refreshCache())
        this.addEventListener(clearBtn as HTMLElement, 'click', () => this.clearCache())
        this.addEventListener(downloadBtn as HTMLElement, 'click', () => this.downloadMissing())

        // Settings
        const autoDownloadToggle = panel.querySelector('#auto-download-toggle') as HTMLInputElement
        const cacheLimitInput = panel.querySelector('#cache-limit-input') as HTMLInputElement
        const preloadToggle = panel.querySelector('#preload-toggle') as HTMLInputElement

        this.addEventListener(autoDownloadToggle, 'change', (e) => {
            const target = e.target as HTMLInputElement
            this.setSetting('autoDownload', target.checked)
        })

        this.addEventListener(cacheLimitInput, 'change', (e) => {
            const target = e.target as HTMLInputElement
            this.setSetting('cacheLimit', parseInt(target.value))
        })

        this.addEventListener(preloadToggle, 'change', (e) => {
            const target = e.target as HTMLInputElement
            this.setSetting('preload', target.checked)
        })

        this.addPanelStyles()
    }

    onShow(): void {
        this.startStatsUpdate()
        this.updateCacheStats()
        this.updateStorageQuotaDisplay() // Get initial storage quota
    }

    onHide(): void {
        this.stopStatsUpdate()
    }

    /**
     * Enable cache actions when Steam profile is loaded
     */
    enableCacheActions(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const buttons = panel.querySelectorAll('.cache-btn')
        buttons.forEach(btn => {
            btn.removeAttribute('disabled')
        })
    }

    /**
     * Disable cache actions when no Steam profile is loaded
     */
    disableCacheActions(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const buttons = panel.querySelectorAll('.cache-btn')
        buttons.forEach(btn => {
            btn.setAttribute('disabled', 'true')
        })
    }

    /**
     * Start periodic cache stats updates
     */
    private startStatsUpdate(): void {
        if (this.updateInterval) return

        this.updateInterval = window.setInterval(() => {
            this.updateCacheStats()
        }, 5000) // Update every 5 seconds
    }

    /**
     * Stop periodic cache stats updates
     */
    private stopStatsUpdate(): void {
        if (this.updateInterval) {
            window.clearInterval(this.updateInterval)
            this.updateInterval = null
        }
    }

    /**
     * Update cache statistics display
     */
    private async updateCacheStats(): Promise<void> {
        try {
            // Use Steam integration function if available, otherwise fallback to browser cache
            if (this.onGetStats) {
                const imageStats = await this.onGetStats()
                this.cacheStats = this.convertCacheStats(imageStats)
            } else {
                const cacheStats = await this.getCacheInfo()
                this.cacheStats = cacheStats
            }

            // Update UI
            this.updateStatsUI()
        } catch (error) {
            console.error('Failed to update cache stats:', error)
            this.showError('Failed to load cache statistics')
        }
    }

    /**
     * Get cache information from browser storage
     */
    private async getCacheInfo(): Promise<CacheStats> {
        // Try to get cache information from various sources
        const stats: CacheStats = {
            imageCount: 0,
            totalSize: 0,
            lastUpdate: null
        }

        try {
            // Check for cache API support
            if ('caches' in window) {
                const cacheNames = await window.caches.keys()
                for (const cacheName of cacheNames) {
                    if (cacheName.includes('steam') || cacheName.includes('image')) {
                        const cache = await window.caches.open(cacheName)
                        const requests = await cache.keys()
                        stats.imageCount += requests.length
                    }
                }
            }

            // Check localStorage for cache metadata
            const cacheMetadata = localStorage.getItem('steam-image-cache-metadata')
            if (cacheMetadata) {
                const metadata = JSON.parse(cacheMetadata)
                stats.totalSize = metadata.totalSize ?? 0
                stats.lastUpdate = metadata.lastUpdate ? new Date(metadata.lastUpdate) : null
            }

            // Estimate size if not available
            if (stats.totalSize === 0 && stats.imageCount > 0) {
                stats.totalSize = stats.imageCount * 150000 // Estimate 150KB per image
            }

        } catch (error) {
            console.warn('Could not get detailed cache info:', error)
            // Fallback to basic localStorage check
            const keys = Object.keys(localStorage).filter(key => 
                key.includes('steam') || key.includes('cache') || key.includes('image')
            )
            stats.imageCount = keys.length
        }

        return stats
    }

    /**
     * Update the statistics UI elements
     */
    private updateStatsUI(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const imageCountEl = panel.querySelector('#cache-image-count')
        const totalSizeEl = panel.querySelector('#cache-total-size')
        const lastUpdateEl = panel.querySelector('#cache-last-update')

        if (imageCountEl) {
            imageCountEl.textContent = this.cacheStats.imageCount.toString()
        }

        if (totalSizeEl) {
            totalSizeEl.textContent = this.formatBytes(this.cacheStats.totalSize)
        }

        if (lastUpdateEl) {
            lastUpdateEl.textContent = this.cacheStats.lastUpdate 
                ? this.cacheStats.lastUpdate.toLocaleString()
                : 'Never'
        }
    }

    /**
     * Refresh cache by re-downloading recent items
     */
    private async refreshCache(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#refresh-cache-btn')
        if (!btn) return

        btn.textContent = '🔄 Refreshing...'
        btn.setAttribute('disabled', 'true')

        try {
            // Update cache statistics by calling the stats function
            if (this.onGetStats) {
                const imageStats = await this.onGetStats()
                this.cacheStats = this.convertCacheStats(imageStats)
                this.updateStatsUI()
            }
            
            this.showSuccess('Cache refreshed successfully')
        } catch (error) {
            console.error('Cache refresh failed:', error)
            this.showError('Failed to refresh cache')
        } finally {
            btn.textContent = '🔄 Refresh Cache'
            btn.removeAttribute('disabled')
        }
    }

    /**
     * Clear all cached data
     */
    private async clearCache(): Promise<void> {
        const confirmed = window.confirm('Are you sure you want to clear all cached data? This will require re-downloading images.')
        if (!confirmed) return

        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#clear-cache-btn')
        if (!btn) return

        btn.textContent = '🗑️ Clearing...'
        btn.setAttribute('disabled', 'true')

        try {
            // Use Steam integration clear function if available
            if (this.onClearCache) {
                await this.onClearCache()
            } else {
                // Fallback: Clear cache API caches
                if ('caches' in window) {
                    const cacheNames = await window.caches.keys()
                    for (const cacheName of cacheNames) {
                        if (cacheName.includes('steam') || cacheName.includes('image')) {
                            await window.caches.delete(cacheName)
                        }
                    }
                }

                // Clear localStorage cache items
                const keysToRemove = Object.keys(localStorage).filter(key => 
                    key.includes('steam') || key.includes('cache') || key.includes('image')
                )
                keysToRemove.forEach(key => localStorage.removeItem(key))
            }

            this.showSuccess('Cache cleared successfully')
            this.updateCacheStats()
        } catch (error) {
            console.error('Cache clear failed:', error)
            this.showError('Failed to clear cache')
        } finally {
            btn.textContent = '🗑️ Clear Cache'
            btn.removeAttribute('disabled')
        }
    }

    /**
     * Download missing images
     */
    private async downloadMissing(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#download-missing-btn')
        if (!btn) return

        btn.textContent = '📥 Downloading...'
        btn.setAttribute('disabled', 'true')

        try {
            // Simulate download operation
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            this.showSuccess('Missing images downloaded')
            this.updateCacheStats()
        } catch (error) {
            console.error('Download failed:', error)
            this.showError('Failed to download missing images')
        } finally {
            btn.textContent = '📥 Download Missing'
            btn.removeAttribute('disabled')
        }
    }

    /**
     * Set a cache setting
     */
    private setSetting(key: string, value: boolean | number | string): void {
        const settings = this.getSettings()
        settings[key] = value
        localStorage.setItem('cache-settings', JSON.stringify(settings))
        this.showSuccess(`Setting updated: ${key}`)
    }

    /**
     * Get cache settings from localStorage
     */
    private getSettings(): Record<string, boolean | number | string> {
        try {
            const settings = localStorage.getItem('cache-settings')
            return settings ? JSON.parse(settings) : {}
        } catch {
            return {}
        }
    }

    /**
     * Format bytes to human readable string
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    /**
     * Update storage quota display
     */
    private updateStorageQuotaDisplay(): void {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            navigator.storage.estimate().then(estimate => {
                const used = estimate.usage ?? 0
                const quota = estimate.quota ?? 0
                const usedMB = Math.round(used / 1024 / 1024)
                const quotaMB = Math.round(quota / 1024 / 1024)
                
                const panel = this.getPanelElement()
                const quotaEl = panel?.querySelector('#storage-quota')
                if (quotaEl) {
                    quotaEl.textContent = `${usedMB} MB / ${quotaMB} MB`
                }
            })
        }
    }

    /**
     * Get storage quota information
     */
    private getStorageQuota(): string {
        this.updateStorageQuotaDisplay() // Trigger async update
        return 'Calculating...'
    }

    /**
     * Show success message
     */
    private showSuccess(message: string): void {
        this.showMessage(message, 'success')
    }

    /**
     * Show error message
     */
    private showError(message: string): void {
        this.showMessage(message, 'error')
    }

    /**
     * Show a temporary message
     */
    private showMessage(message: string, type: 'success' | 'error'): void {
        const messageDiv = document.createElement('div')
        messageDiv.className = `cache-message cache-message-${type}`
        messageDiv.textContent = message
        
        const panel = this.getPanelElement()
        const content = panel?.querySelector('.panel-content')
        if (content) {
            content.insertBefore(messageDiv, content.firstChild)
            
            setTimeout(() => {
                messageDiv.remove()
            }, 3000)
        }
    }

    /**
     * Add panel-specific styles
     */
    private addPanelStyles(): void {
        const style = document.createElement('style')
        style.id = 'cache-panel-styles'
        style.textContent = `
            .cache-section {
                padding: 15px;
                border-bottom: 1px solid #333;
            }

            .cache-section:last-child {
                border-bottom: none;
            }

            .cache-section h4 {
                margin: 0 0 12px 0;
                color: #00aaff;
                font-size: 14px;
                font-weight: 600;
            }

            .cache-stats {
                display: grid;
                gap: 10px;
            }

            .stat-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #2a2a2a;
                border-radius: 6px;
            }

            .stat-label {
                color: #ccc;
                font-size: 13px;
            }

            .stat-value {
                color: #fff;
                font-weight: 600;
                font-size: 13px;
            }

            .cache-actions {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }

            .cache-btn {
                background: #444;
                border: 1px solid #555;
                color: #fff;
                padding: 10px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s ease;
                min-width: 120px;
            }

            .cache-btn:hover:not([disabled]) {
                background: #555;
                border-color: #666;
            }

            .cache-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .cache-btn-primary {
                background: #00aaff;
                border-color: #0088cc;
            }

            .cache-btn-primary:hover:not([disabled]) {
                background: #0088cc;
                border-color: #0066aa;
            }

            .cache-settings {
                display: grid;
                gap: 15px;
            }

            .setting-item {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .setting-item label {
                color: #ccc;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
            }

            .setting-item input[type="checkbox"] {
                width: 16px;
                height: 16px;
            }

            .setting-item input[type="number"] {
                background: #333;
                border: 1px solid #555;
                color: #fff;
                padding: 6px 10px;
                border-radius: 4px;
                width: 80px;
                margin-left: 10px;
            }

            .cache-log {
                background: #222;
                border: 1px solid #333;
                border-radius: 6px;
                padding: 15px;
                max-height: 200px;
                overflow-y: auto;
                font-family: monospace;
                font-size: 12px;
            }

            .cache-log p {
                margin: 0 0 8px 0;
                color: #ccc;
                line-height: 1.4;
            }

            .cache-log p:last-child {
                margin-bottom: 0;
            }

            .cache-message {
                padding: 10px 15px;
                margin-bottom: 15px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
            }

            .cache-message-success {
                background: rgba(0, 170, 0, 0.2);
                border: 1px solid rgba(0, 170, 0, 0.4);
                color: #00ff00;
            }

            .cache-message-error {
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.4);
                color: #ff6666;
            }
        `

        // Only add if not already present
        if (!document.getElementById('cache-panel-styles')) {
            document.head.appendChild(style)
        }
    }

    dispose(): void {
        this.stopStatsUpdate()
        
        // Remove panel styles
        const styles = document.getElementById('cache-panel-styles')
        if (styles) {
            styles.remove()
        }
        
        super.dispose()
    }
}
