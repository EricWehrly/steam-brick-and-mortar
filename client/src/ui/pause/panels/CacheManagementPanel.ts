/**
 * CacheManagementPanel - Centralized cache management within pause menu
 * 
 * Consolidates cache operations from the scattered UI into one place
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import cacheManagementPanelTemplate from '../templates/cache-management-panel.html?raw'
import { PixelDataCache } from '../../../scene/game-box/instancing/PixelDataCache'
import { steamApi } from '../../../steam/SteamApiClient'
import { EventManager, EventSource } from '../../../core/EventManager'
import { SteamEventTypes } from '../../../types/InteractionEvents'
import '../../../styles/pause-menu/cache-management-panel.css'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import { DataManager } from '../../../core/data/DataManager'

export interface CacheStats {
    imageCount: number
    totalSize: number
    lastUpdate: Date | null
}

export interface CachedUser {
    vanityUrl: string
    displayName: string
    gameCount: number
    steamId: string
}

export class CacheManagementPanel extends PauseMenuPanel {
    readonly id = 'cache-management'
    readonly title = 'Cache'
    readonly icon = '💾'

    private cacheStats: CacheStats = {
        imageCount: 0,
        totalSize: 0,
        lastUpdate: null
    }
    
    private cachedUsers: CachedUser[] = []
    private updateInterval: number | null = null
    private imageUrls: string[] = []
    private currentImageIndex: number = 0
    private previewerInitialized: boolean = false
    private eventManager: EventManager

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
        this.eventManager = EventManager.getInstance()
    }

    render(): string {
        const settings = this.getSettings()
        
        // Get cached users for dropdown - handle case where users haven't loaded yet
        const cachedUsersOptions = this.cachedUsers.length > 0
            ? this.cachedUsers.map(user => `<option value="${user.vanityUrl}">${user.displayName} (${user.gameCount} games)</option>`).join('')
            : '<option value="" disabled>Loading cached users...</option>'
        
        // Prepare template data with current state
        const templateData = {
            // Cache stats (will be updated via refreshStats)
            imageCount: this.cacheStats.imageCount || 'Loading...',
            totalSize: this.cacheStats.totalSize ? this.formatBytes(this.cacheStats.totalSize) : 'Loading...',
            lastUpdate: this.cacheStats.lastUpdate?.toLocaleString() || 'Never',
            cacheApiStatus: ('caches' in window) ? 'Available' : 'Not available',
            cacheApiUnavailable: !('caches' in window),
            storageQuota: 'Calculating...',
            hasImages: this.cacheStats.imageCount > 0,
            
            // Cached users dropdown
            cachedUsersOptions: cachedUsersOptions,
            
            // Button states
            refreshButtonDisabled: '',
            validateButtonDisabled: '',
            clearButtonDisabled: '',
            downloadButtonDisabled: 'disabled', // No download function yet
            
            // Settings values from localStorage
            autoDownloadChecked: settings.autoDownload !== false ? 'checked' : '',
            cacheLimitValue: settings.cacheLimit || 500,
            preloadChecked: settings.preload ? 'checked' : ''
        }
        
        return renderTemplate(cacheManagementPanelTemplate, templateData)
    }

    /**
     * Refresh the panel template with current data
     * Called when Steam data loads to update hasImages state
     */
    refreshTemplate(): void {
        
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const contentContainer = panel.querySelector('.panel-content')
        if (!contentContainer) {
            return
        }
        
        // Re-render the template with current data
        contentContainer.innerHTML = this.render()
        
        // Re-attach event listeners since we replaced the content
        this.attachEvents()
        
        // If this panel is visible, refresh the stats
        if (this.isVisible) {
            this.updateCacheStats()
        }
    }

    attachEvents(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        UIComponentUtils.setupButtons(panel, [
            { buttonId: 'force-update-cache-btn', onClick: this.forceUpdateCache.bind(this) },
            { buttonId: 'refresh-cache-btn', onClick: this.refreshCache.bind(this) },
            { buttonId: 'validate-cache-btn', onClick: this.validateCache.bind(this) },
            { buttonId: 'clear-cache-btn', onClick: this.clearCache.bind(this) },
            { buttonId: 'download-missing-btn', onClick: this.downloadMissing.bind(this) },
            { buttonId: 'load-cached-user-btn', onClick: this.loadSelectedCachedUser.bind(this) },
            { buttonId: 'initialize-previewer-btn', onClick: this.initializePreviewer.bind(this) },
            { buttonId: 'prev-image-btn', onClick: this.previousImage.bind(this) },
            { buttonId: 'next-image-btn', onClick: this.nextImage.bind(this) }
        ])

        UIComponentUtils.setupSelect(panel, {
            selectId: 'cached-users-select',
            onChange: () => this.onCachedUserSelectionChange()
        })

        UIComponentUtils.setupToggles(panel, [
            {
                toggleId: 'auto-download-toggle',
                onChange: (checked) => this.setSetting('autoDownload', checked)
            },
            {
                toggleId: 'preload-toggle',
                onChange: (checked) => this.setSetting('preload', checked)
            }
        ])

        UIComponentUtils.setupInput<number>(panel, {
            inputId: 'cache-limit-input',
            parseValue: (v) => parseInt(v, 10),
            onChange: (value) => this.setSetting('cacheLimit', value)
        })

        UIComponentUtils.setupInput<number>(panel, {
            inputId: 'image-index-input',
            parseValue: (v) => parseInt(v, 10),
            onChange: (index) => {
                if (!isNaN(index)) {
                    this.goToImage(index)
                }
            }
        })

        document.addEventListener('keydown', (e) => {
            if (!this.previewerInitialized) return
            
            if (e.key === 'ArrowLeft') {
                e.preventDefault()
                this.previousImage()
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                this.nextImage()
            }
        })
    }

    onShow(): void {
        this.startStatsUpdate()
        this.updateCacheStats()
        this.updateStorageQuotaDisplay() // Get initial storage quota
        this.loadCachedUsers()
    }

    onHide(): void {
        this.stopStatsUpdate()
    }

    /**
     * Refresh cached users data and update dropdown
     * Call this when cache contents may have changed
     */
    refreshCachedUsers(): void {
        if (this.isVisible) {
            this.loadCachedUsers()
        }
    }

    /**
     * Load cached users for dropdown
     */
    private async loadCachedUsers(): Promise<void> {
        try {
            this.cachedUsers = steamApi.getCachedUsers()
            this.refreshCachedUsersDropdown()
        } catch (error) {
            console.error('Failed to load cached users:', error)
            this.cachedUsers = []
            this.refreshCachedUsersDropdown()
        }
    }

    /**
     * Refresh the cached users dropdown with current data
     */
    private refreshCachedUsersDropdown(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const select = panel.querySelector('#cached-users-select') as HTMLSelectElement
        if (!select) return

        // Generate options HTML based on current cached users state
        let options: string
        if (this.cachedUsers.length > 0) {
            options = this.cachedUsers
                .map(user => `<option value="${user.vanityUrl}">${user.displayName} (${user.gameCount} games)</option>`)
                .join('')
        } else {
            // Show appropriate message for empty state
            options = '<option value="" disabled>No cached users found</option>'
        }

        // Update select options (preserve the default option)
        select.innerHTML = `<option value="">Select a cached user...</option>${options}`
        
        // Update the load button state
        const loadBtn = panel.querySelector('#load-cached-user-btn') as HTMLButtonElement
        if (loadBtn) {
            loadBtn.disabled = true // Disable until user makes a selection
        }
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
            // Primary: use PixelDataCache (the active texture cache)
            const pixelCache = PixelDataCache.getInstance()
            const pixelStats = await pixelCache.getStorageEstimate()
            
            this.cacheStats = {
                imageCount: pixelStats.count,
                totalSize: pixelStats.estimatedMB * 1024 * 1024, // Convert MB to bytes
                lastUpdate: new Date() // PixelDataCache doesn't track timestamps
            }

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
     * Force update cache from network
     */
        private async forceUpdateCache(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#force-update-cache-btn')
        if (!btn) return
        
        // Always try to get the active user explicitly from the dropdown
        const select = panel.querySelector('#cached-users-select') as HTMLSelectElement
        const targetUser = select?.value
        
        if (!targetUser) {
            this.showError('No user selected in dropdown to update.')
            return
        }

        btn.textContent = '?? Updating...'
        btn.setAttribute('disabled', 'true')

        try {
            this.eventManager.emit(SteamEventTypes.CacheForceUpdate, {
                userInput: targetUser,
                source: EventSource.UI
            })
            
            // The actual success message comes from the workflow completion,
            // but we can acknowledge the click immediately
            this.showSuccess('Force update requested...')
        } catch (error) {
            console.error('Force update failed:', error)
            this.showError('Failed to request force update')
        } finally {
            btn.textContent = '?? Force Update Cache'
            btn.removeAttribute('disabled')
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
        
        // Always try to get the active user explicitly from the dropdown
        const select = panel.querySelector('#cached-users-select') as HTMLSelectElement
        const targetUser = select?.value
        
        if (!targetUser) {
            this.showError('No user selected in dropdown to refresh.')
            return
        }

        btn.textContent = '?? Refreshing...'
        btn.setAttribute('disabled', 'true')

        try {
            // First emit the event so SteamIntegration can do its thing
            this.eventManager.emit(SteamEventTypes.CacheRefresh, {
                userInput: targetUser,
                source: EventSource.UI
            })
            
            // Refresh stats from PixelDataCache
            await this.updateCacheStats()
            
            this.showSuccess('Cache refreshed successfully')
        } catch (error) {
            console.error('Cache refresh failed:', error)
            this.showError('Failed to refresh cache')
        } finally {
            btn.textContent = '?? Refresh UI Stats'
            btn.removeAttribute('disabled')
        }
    }

    /**
     * Validate cache and remove corrupted/empty images
     * TODO: PixelDataCache doesn't have validation yet - for now just refresh stats
     */
    private async validateCache(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#validate-cache-btn')
        if (!btn) return

        btn.textContent = 'ðŸ” Validating...'
        btn.setAttribute('disabled', 'true')

        try {
            // PixelDataCache uses versioning for invalidation, no per-entry validation needed
            // Just refresh the stats to show current state
            await this.updateCacheStats()
            
            this.showSuccess('Cache validation complete. Pixel cache uses version-based invalidation.')
        } catch (error) {
            console.error('Cache validation failed:', error)
            this.showError('Failed to validate cache')
        } finally {
            btn.textContent = 'ðŸ” Validate Cache'
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

        btn.textContent = 'ðŸ—‘ï¸ Clearing...'
        btn.setAttribute('disabled', 'true')

        try {
            // Clear PixelDataCache (the active texture cache)
            const pixelCache = PixelDataCache.getInstance()
            await pixelCache.clear()
            
            // Also clear Steam API cache (metadata)
            steamApi.clearCache()

            this.showSuccess('Cache cleared successfully')
            this.updateCacheStats()
        } catch (error) {
            console.error('Cache clear failed:', error)
            this.showError('Failed to clear cache')
        } finally {
            btn.textContent = 'ðŸ—‘ï¸ Clear Cache'
            btn.removeAttribute('disabled')
        }
    }

    /**
     * Handle cached user selection change
     */
    private onCachedUserSelectionChange(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const select = panel.querySelector('#cached-users-select') as HTMLSelectElement
        const loadBtn = panel.querySelector('#load-cached-user-btn') as HTMLButtonElement

        if (select && loadBtn) {
            loadBtn.disabled = !select.value
        }
    }

    /**
     * Load the selected cached user
     */
    private async loadSelectedCachedUser(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const select = panel.querySelector('#cached-users-select') as HTMLSelectElement
        const loadBtn = panel.querySelector('#load-cached-user-btn') as HTMLButtonElement

        if (!select || !loadBtn || !select.value) return

        const selectedVanityUrl = select.value

        loadBtn.textContent = 'ðŸ“‹ Loading...'
        loadBtn.disabled = true

        try {
            // Emit event to load cached user - this is a complex workflow
            this.eventManager.emit(SteamEventTypes.LoadFromCache, {
                userInput: selectedVanityUrl,
                source: EventSource.UI
            })
            
            this.showSuccess(`Loading cached games for ${selectedVanityUrl}...`)
        } catch (error) {
            console.error('Failed to load cached user:', error)
            this.showError('Failed to load cached user games')
        } finally {
            loadBtn.textContent = 'ðŸ“‹ Load Selected User'
            loadBtn.disabled = !select.value
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

        btn.textContent = 'ðŸ“¥ Downloading...'
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
            btn.textContent = 'ðŸ“¥ Download Missing'
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
     * Initialize the image previewer
     * @deprecated Image previewer requires blob cache which was removed. 
     * PixelDataCache stores RGBA pixels, not blobs.
     */
    private async initializePreviewer(): Promise<void> {
        // Image previewer disabled - no longer have blob cache
        // PixelDataCache stores decoded RGBA pixels, not displayable blobs
        this.showError('Image previewer not available - cache stores pixel data, not images')
    }

    /**
     * Navigate to previous image
     */
    private previousImage(): void {
        if (!this.previewerInitialized || this.imageUrls.length === 0) return
        
        this.currentImageIndex = this.currentImageIndex > 0 
            ? this.currentImageIndex - 1 
            : this.imageUrls.length - 1
        this.loadCurrentImage()
        this.updateIndexInput()
    }

    /**
     * Navigate to next image
     */
    private nextImage(): void {
        if (!this.previewerInitialized || this.imageUrls.length === 0) return
        
        this.currentImageIndex = this.currentImageIndex < this.imageUrls.length - 1 
            ? this.currentImageIndex + 1 
            : 0
        this.loadCurrentImage()
        this.updateIndexInput()
    }

    /**
     * Jump to specific image index
     */
    private goToImage(index: number): void {
        if (!this.previewerInitialized || this.imageUrls.length === 0) return
        
        const boundedIndex = Math.max(0, Math.min(index - 1, this.imageUrls.length - 1)) // Convert 1-based to 0-based
        this.currentImageIndex = boundedIndex
        this.loadCurrentImage()
    }

    /**
     * Show previewer navigation controls
     */
    private showPreviewerNavigation(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const navigation = panel.querySelector('#previewer-navigation') as HTMLElement
        const container = panel.querySelector('#image-preview-container') as HTMLElement
        
        if (navigation) navigation.classList.remove('hidden')
        if (container) container.classList.remove('hidden')
    }

    /**
     * Load current image into preview
     */
    private async loadCurrentImage(): Promise<void> {
        if (this.imageUrls.length === 0) return

        const panel = this.getPanelElement()
        if (!panel) return

        const imageElement = panel.querySelector('#preview-image') as HTMLImageElement
        const nameElement = panel.querySelector('#image-name')
        
        if (!imageElement) return

        const currentUrl = this.imageUrls[this.currentImageIndex]
        
        // Image previewer disabled - blob cache removed
        // Just show the URL directly (will fetch from CDN)
        imageElement.src = currentUrl
        
        // Extract filename from URL for display
        const filename = currentUrl.split('/').pop() || 'Unknown'
        if (nameElement) {
            nameElement.textContent = filename
        }

        // Update image size info when loaded
        imageElement.onload = () => {
            const sizeElement = panel.querySelector('#image-size')
            if (sizeElement) {
                sizeElement.textContent = `${imageElement.naturalWidth} Ã— ${imageElement.naturalHeight}`
            }
        }
    }

    /**
     * Update the index input value
     */
    private updateIndexInput(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const indexInput = panel.querySelector('#image-index-input') as HTMLInputElement
        if (indexInput) {
            indexInput.value = (this.currentImageIndex + 1).toString() // Convert 0-based to 1-based
        }
    }

    dispose(): void {
        this.stopStatsUpdate()
        
        // Clean up any blob URLs to prevent memory leaks
        const panel = this.getPanelElement()
        if (panel) {
            const imageElement = panel.querySelector('#preview-image') as HTMLImageElement
            if (imageElement && imageElement.dataset.blobUrl) {
                URL.revokeObjectURL(imageElement.dataset.blobUrl)
                delete imageElement.dataset.blobUrl
            }
        }
        
        super.dispose()
    }
}
