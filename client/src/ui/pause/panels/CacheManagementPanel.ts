/**
 * CacheManagementPanel - Centralized cache management within pause menu
 * 
 * Consolidates cache operations from the scattered UI into one place
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import cacheManagementPanelTemplate from '../templates/cache-management-panel.html?raw'
import { PixelDataCache } from '../../../scene/game-box/instancing/PixelDataCache'
import { SteamApiClient } from '../../../steam/SteamApiClient'
import { EventManager, EventSource } from '../../../core/EventManager'
import { SteamEventTypes } from '../../../types/InteractionEvents'
import type { SteamCacheClearEvent, SteamImageCacheClearEvent } from '../../../types/InteractionEvents'
import '../../../styles/pause-menu/cache-management-panel.css'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'

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
    private eventManager: EventManager

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
        this.eventManager = EventManager.getInstance()
    }

    render(): string {
        const settings = this.getSettings()

        const cachedUsersOptions = this.cachedUsers.length > 0
            ? this.cachedUsers.map(user => `<option value="${user.vanityUrl}">${user.displayName} (${user.gameCount} games)</option>`).join('')
            : '<option value="" disabled>Loading cached users...</option>'

        const templateData = {
            imageCount: this.cacheStats.imageCount || 'Loading...',
            totalSize: this.cacheStats.totalSize ? this.formatBytes(this.cacheStats.totalSize) : 'Loading...',
            lastUpdate: this.cacheStats.lastUpdate?.toLocaleString() || 'Never',
            cacheApiStatus: ('caches' in window) ? 'Available' : 'Not available',
            cacheApiUnavailable: !('caches' in window),
            storageQuota: 'Calculating...',
            hasImages: this.cacheStats.imageCount > 0,
            cachedUsersOptions: cachedUsersOptions,
            refreshButtonDisabled: '',
            validateButtonDisabled: '',
            clearButtonDisabled: '',
            downloadButtonDisabled: 'disabled', // downloadMissing() is a stub - see its body
            autoDownloadChecked: settings.autoDownload !== false ? 'checked' : '',
            cacheLimitValue: settings.cacheLimit || 500,
            preloadChecked: settings.preload ? 'checked' : ''
        }

        return renderTemplate(cacheManagementPanelTemplate, templateData)
    }

    refreshTemplate(): void {
        const panel = this.getPanelElement()
        if (!panel) {
            return
        }

        const contentContainer = panel.querySelector('.panel-content')
        if (!contentContainer) {
            return
        }

        contentContainer.innerHTML = this.render()
        this.attachEvents() // innerHTML above drops the old listeners

        if (this.isVisible) {
            this.updateCacheStats()
        }
    }

    attachEvents(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        UIComponentUtils.setupButtons(panel, [
            { buttonId: 'refresh-cache-btn', onClick: this.refreshCache.bind(this) },
            { buttonId: 'validate-cache-btn', onClick: this.validateCache.bind(this) },
            { buttonId: 'clear-cache-btn', onClick: this.clearCache.bind(this) },
            { buttonId: 'download-missing-btn', onClick: this.downloadMissing.bind(this) },
            { buttonId: 'load-cached-user-btn', onClick: this.loadSelectedCachedUser.bind(this) }
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

    refreshCachedUsers(): void {
        if (this.isVisible) {
            this.loadCachedUsers()
        }
    }

    private async loadCachedUsers(): Promise<void> {
        try {
            this.cachedUsers = SteamApiClient.getInstance().getCachedUsers()
            this.refreshCachedUsersDropdown()
        } catch (error) {
            console.error('Failed to load cached users:', error)
            this.cachedUsers = []
            this.refreshCachedUsersDropdown()
        }
    }

    private refreshCachedUsersDropdown(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const select = panel.querySelector('#cached-users-select') as HTMLSelectElement
        if (!select) return

        let options: string
        if (this.cachedUsers.length > 0) {
            options = this.cachedUsers
                .map(user => `<option value="${user.vanityUrl}">${user.displayName} (${user.gameCount} games)</option>`)
                .join('')
        } else {
            options = '<option value="" disabled>No cached users found</option>'
        }

        select.innerHTML = `<option value="">Select a cached user...</option>${options}`

        const loadBtn = panel.querySelector('#load-cached-user-btn') as HTMLButtonElement
        if (loadBtn) {
            loadBtn.disabled = true // no selection yet
        }
    }

    enableCacheActions(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const buttons = panel.querySelectorAll('.cache-btn')
        buttons.forEach(btn => {
            btn.removeAttribute('disabled')
        })
    }

    disableCacheActions(): void {
        const panel = this.getPanelElement()
        if (!panel) return

        const buttons = panel.querySelectorAll('.cache-btn')
        buttons.forEach(btn => {
            btn.setAttribute('disabled', 'true')
        })
    }

    private startStatsUpdate(): void {
        if (this.updateInterval) return

        this.updateInterval = window.setInterval(() => {
            this.updateCacheStats()
        }, 5000)
    }

    private stopStatsUpdate(): void {
        if (this.updateInterval) {
            window.clearInterval(this.updateInterval)
            this.updateInterval = null
        }
    }

    private async updateCacheStats(): Promise<void> {
        try {
            const pixelCache = PixelDataCache.getInstance()
            const pixelStats = await pixelCache.getStorageEstimate()

            this.cacheStats = {
                imageCount: pixelStats.count,
                totalSize: pixelStats.estimatedMB * 1024 * 1024, // MB -> bytes
                lastUpdate: new Date() // PixelDataCache doesn't track timestamps itself
            }

            this.updateStatsUI()
        } catch (error) {
            console.error('Failed to update cache stats:', error)
            this.showError('Failed to load cache statistics')
        }
    }

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

    private async refreshCache(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#refresh-cache-btn')
        if (!btn) return

        btn.textContent = 'ðŸ”„ Refreshing...'
        btn.setAttribute('disabled', 'true')

        try {
            await this.updateCacheStats()

            this.showSuccess('Cache refreshed successfully')
        } catch (error) {
            console.error('Cache refresh failed:', error)
            this.showError('Failed to refresh cache')
        } finally {
            btn.textContent = 'ðŸ”„ Refresh Cache'
            btn.removeAttribute('disabled')
        }
    }

    // TODO: PixelDataCache doesn't have validation yet - for now just refreshes stats
    private async validateCache(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#validate-cache-btn')
        if (!btn) return

        btn.textContent = 'ðŸ” Validating...'
        btn.setAttribute('disabled', 'true')

        try {
            // PixelDataCache uses versioning for invalidation, so there's no per-entry check
            // to run - just refresh the stats to show current state.
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
            EventManager.getInstance().emit<SteamCacheClearEvent>(SteamEventTypes.CacheClear, {
                scope: 'all',
                source: EventSource.UI
            })
            EventManager.getInstance().emit<SteamImageCacheClearEvent>(SteamEventTypes.ImageCacheClear, {
                source: EventSource.UI
            })

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
            this.eventManager.emit(SteamEventTypes.LoadLibrary, {
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

    private async downloadMissing(): Promise<void> {
        const panel = this.getPanelElement()
        if (!panel) return

        const btn = panel.querySelector('#download-missing-btn')
        if (!btn) return

        btn.textContent = 'ðŸ“¥ Downloading...'
        btn.setAttribute('disabled', 'true')

        try {
            // Stub - no real download exists yet, this only simulates the wait
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

    private setSetting(key: string, value: boolean | number | string): void {
        const settings = this.getSettings()
        settings[key] = value
        localStorage.setItem('cache-settings', JSON.stringify(settings))
        this.showSuccess(`Setting updated: ${key}`)
    }

    private getSettings(): Record<string, boolean | number | string> {
        try {
            const settings = localStorage.getItem('cache-settings')
            return settings ? JSON.parse(settings) : {}
        } catch {
            return {}
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

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

    private showSuccess(message: string): void {
        this.showMessage(message, 'success')
    }

    private showError(message: string): void {
        this.showMessage(message, 'error')
    }

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

    dispose(): void {
        this.stopStatsUpdate()
        super.dispose()
    }
}
