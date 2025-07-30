/**
 * Cache Management UI Component
 * 
 * Provides a collapsible interface for monitoring and managing:
 * - Image cache statistics 
 * - Storage quota information
 * - Cache clearing controls
 * - Storage warnings and status
 * 
 * TODO: ROADMAP - Make this entire cache UI optional via user settings/options
 * This should be configurable once we add user preferences/settings system.
 */

import type { ImageCacheStats } from '../steam/images/ImageManager'
import '../styles/components/cache-management-ui.css'

export interface CacheUIConfig {
    containerId: string
    refreshInterval?: number
    autoCollapse?: boolean
}

export class CacheManagementUI {
    private container: HTMLElement | null = null
    private config: Required<CacheUIConfig>
    private refreshTimer: number | null = null
    private isCollapsed: boolean = true
    private onGetStats?: () => Promise<ImageCacheStats>
    private onClearCache?: () => Promise<void>

    constructor(config: CacheUIConfig) {
        this.config = {
            refreshInterval: config.refreshInterval ?? 5000, // 5 seconds
            autoCollapse: config.autoCollapse ?? true,
            ...config
        }
    }

    /**
     * Initialize the UI component
     */
    init(
        getStats: () => Promise<ImageCacheStats>,
        clearCache: () => Promise<void>
    ): void {
        this.onGetStats = getStats
        this.onClearCache = clearCache
        
        this.container = document.getElementById(this.config.containerId)
        if (!this.container) {
            console.warn(`CacheManagementUI: Container ${this.config.containerId} not found`)
            return
        }

        this.render()
        this.startAutoRefresh()
    }

    /**
     * Dispose of resources and stop timers
     */
    dispose(): void {
        this.stopAutoRefresh()
        if (this.container) {
            this.container.innerHTML = ''
        }
    }

    /**
     * Manually refresh the cache statistics
     */
    async refresh(): Promise<void> {
        if (!this.onGetStats) return

        try {
            const stats = await this.onGetStats()
            this.updateDisplay(stats)
        } catch (error) {
            console.error('Failed to refresh cache stats:', error)
            this.showError('Failed to load cache statistics')
        }
    }

    /**
     * Toggle the collapsed state
     */
    toggle(): void {
        this.isCollapsed = !this.isCollapsed
        this.updateCollapseState()
    }

    private render(): void {
        if (!this.container) return

        this.container.innerHTML = `
            <div class="cache-management">
                <div class="cache-header" id="cache-header">
                    <h3>🗄️ Cache Management</h3>
                    <button class="toggle-btn" id="cache-toggle">
                        ${this.isCollapsed ? '▼' : '▲'}
                    </button>
                </div>
                <div class="cache-content ${this.isCollapsed ? 'collapsed' : ''}" id="cache-content">
                    <div class="cache-stats" id="cache-stats">
                        <div class="loading">Loading cache statistics...</div>
                    </div>
                    <div class="cache-controls">
                        <button class="refresh-btn" id="cache-refresh">🔄 Refresh</button>
                        <button class="clear-btn" id="cache-clear">🗑️ Clear Cache</button>
                    </div>
                </div>
            </div>
        `

        this.attachEventListeners()
        this.refresh() // Initial load
    }

    private attachEventListeners(): void {
        const header = document.getElementById('cache-header')
        const toggleBtn = document.getElementById('cache-toggle')
        const refreshBtn = document.getElementById('cache-refresh')
        const clearBtn = document.getElementById('cache-clear')

        header?.addEventListener('click', () => this.toggle())
        toggleBtn?.addEventListener('click', (e) => {
            e.stopPropagation()
            this.toggle()
        })
        
        refreshBtn?.addEventListener('click', () => this.refresh())
        clearBtn?.addEventListener('click', () => this.clearCache())
    }

    private updateCollapseState(): void {
        const content = document.getElementById('cache-content')
        const toggleBtn = document.getElementById('cache-toggle')
        
        if (content) {
            content.className = `cache-content ${this.isCollapsed ? 'collapsed' : ''}`
        }
        
        if (toggleBtn) {
            toggleBtn.textContent = this.isCollapsed ? '▼' : '▲'
        }
    }

    private updateDisplay(stats: ImageCacheStats): void {
        const statsContainer = document.getElementById('cache-stats')
        if (!statsContainer) return

        const { totalImages, totalSize, storageQuota } = stats
        const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2)
        
        let quotaInfo = ''
        let quotaBar = ''
        
        if (storageQuota?.isSupported) {
            const { usageMB, quotaMB, usagePercent, isNearLimit } = storageQuota
            const quotaClass = usagePercent > 95 ? 'critical' : usagePercent > 80 ? 'warning' : ''
            
            quotaInfo = `
                <div class="stat-row">
                    <span class="stat-label">Storage Usage:</span>
                    <span class="stat-value">${usageMB.toFixed(1)} / ${quotaMB.toFixed(1)} MB (${usagePercent.toFixed(1)}%)</span>
                </div>
            `
            
            quotaBar = `
                <div class="quota-bar">
                    <div class="quota-fill ${quotaClass}" style="width: ${Math.min(usagePercent, 100)}%"></div>
                </div>
                ${isNearLimit ? '<div class="error">⚠️ Storage usage is high!</div>' : ''}
            `
        }

        statsContainer.innerHTML = `
            <div class="stat-row">
                <span class="stat-label">Images Cached:</span>
                <span class="stat-value">${totalImages}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Cache Size:</span>
                <span class="stat-value">${sizeInMB} MB</span>
            </div>
            ${quotaInfo}
            ${quotaBar}
            ${stats.totalImages > 0 ? `
                <div class="stat-row">
                    <span class="stat-label">Oldest:</span>
                    <span class="stat-value">${new Date(stats.oldestTimestamp).toLocaleString()}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Newest:</span>
                    <span class="stat-value">${new Date(stats.newestTimestamp).toLocaleString()}</span>
                </div>
            ` : ''}
        `
    }

    private showError(message: string): void {
        const statsContainer = document.getElementById('cache-stats')
        if (statsContainer) {
            statsContainer.innerHTML = `<div class="error">${message}</div>`
        }
    }

    private async clearCache(): Promise<void> {
        if (!this.onClearCache) return

        const clearBtn = document.getElementById('cache-clear') as HTMLButtonElement
        if (clearBtn) {
            clearBtn.disabled = true
            clearBtn.textContent = '🗑️ Clearing...'
        }

        try {
            await this.onClearCache()
            await this.refresh() // Refresh after clearing
        } catch (error) {
            console.error('Failed to clear cache:', error)
            this.showError('Failed to clear cache')
        } finally {
            if (clearBtn) {
                clearBtn.disabled = false
                clearBtn.textContent = '🗑️ Clear Cache'
            }
        }
    }

    private startAutoRefresh(): void {
        if (this.config.refreshInterval > 0) {
            this.refreshTimer = window.setInterval(() => {
                if (!this.isCollapsed) { // Only refresh when expanded
                    this.refresh()
                }
            }, this.config.refreshInterval)
        }
    }

    private stopAutoRefresh(): void {
        if (this.refreshTimer !== null) {
            window.clearInterval(this.refreshTimer)
            this.refreshTimer = null
        }
    }
}
