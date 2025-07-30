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
import { renderTemplate } from '../utils/TemplateEngine'
import cacheMainTemplate from '../templates/cache-management/main.html?raw'
import cacheStatsTemplate from '../templates/cache-management/stats.html?raw'
import cacheErrorTemplate from '../templates/cache-management/error.html?raw'
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

        this.container.innerHTML = renderTemplate(cacheMainTemplate, {
            collapsed: this.isCollapsed,
            expanded: !this.isCollapsed
        })

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
        
        let quotaData = {}
        
        if (storageQuota?.isSupported) {
            const { usageMB, quotaMB, usagePercent, isNearLimit } = storageQuota
            const quotaClass = usagePercent > 95 ? 'critical' : usagePercent > 80 ? 'warning' : ''
            
            quotaData = {
                hasQuotaInfo: true,
                usageMB: usageMB.toFixed(1),
                quotaMB: quotaMB.toFixed(1),
                usagePercent: usagePercent.toFixed(1),
                quotaClass,
                quotaFillPercent: Math.min(usagePercent, 100),
                isNearLimit
            }
        }

        const templateData = {
            totalImages,
            sizeInMB,
            hasImages: totalImages > 0,
            oldestDate: totalImages > 0 ? new Date(stats.oldestTimestamp).toLocaleString() : '',
            newestDate: totalImages > 0 ? new Date(stats.newestTimestamp).toLocaleString() : '',
            ...quotaData
        }

        statsContainer.innerHTML = renderTemplate(cacheStatsTemplate, templateData)
    }

    private showError(message: string): void {
        const statsContainer = document.getElementById('cache-stats')
        if (statsContainer) {
            statsContainer.innerHTML = renderTemplate(cacheErrorTemplate, { message })
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
