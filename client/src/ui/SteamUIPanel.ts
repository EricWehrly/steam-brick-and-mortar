/**
 * SteamUIPanel - Manages Steam-specific UI controls and interactions
 */

import { getElementByIdSafe } from '../utils'

export interface SteamUIPanelEvents {
  onLoadGames: (vanityUrl: string) => void
  onUseOffline: (vanityUrl: string) => void
  onRefreshCache: () => void
  onClearCache: () => void
  onShowCacheStats: () => void
}

export class SteamUIPanel {
  private steamUI: HTMLElement | null
  private steamVanityInput: HTMLInputElement | null
  private loadGamesButton: HTMLButtonElement | null
  private useOfflineButton: HTMLButtonElement | null
  private refreshCacheButton: HTMLButtonElement | null
  private clearCacheButton: HTMLButtonElement | null
  private showCacheStatsButton: HTMLButtonElement | null
  private cacheInfoDiv: HTMLElement | null
  private steamStatus: HTMLElement | null
  
  constructor(private events: SteamUIPanelEvents) {
    // Get UI elements
    this.steamUI = document.getElementById('steam-ui')
    this.steamVanityInput = getElementByIdSafe('steam-vanity') as HTMLInputElement
    this.loadGamesButton = getElementByIdSafe('load-steam-games') as HTMLButtonElement
    this.useOfflineButton = getElementByIdSafe('use-offline-data') as HTMLButtonElement
    this.refreshCacheButton = getElementByIdSafe('refresh-cache') as HTMLButtonElement
    this.clearCacheButton = getElementByIdSafe('clear-cache') as HTMLButtonElement
    this.showCacheStatsButton = getElementByIdSafe('show-cache-stats') as HTMLButtonElement
    this.cacheInfoDiv = document.getElementById('cache-info')
    this.steamStatus = document.getElementById('steam-status')
  }
  
  init(): void {
    this.setupEventListeners()
    this.setupInputPlaceholder()
  }
  
  private setupEventListeners(): void {
    // Load Games button
    if (this.loadGamesButton) {
      this.loadGamesButton.addEventListener('click', () => {
        const vanityUrl = this.getVanityInput()
        if (vanityUrl) {
          this.events.onLoadGames(vanityUrl)
        }
      })
    }
    
    // Use Offline button
    if (this.useOfflineButton) {
      this.useOfflineButton.addEventListener('click', () => {
        const vanityUrl = this.getVanityInput()
        if (vanityUrl) {
          this.events.onUseOffline(vanityUrl)
        }
      })
    }
    
    // Cache management buttons
    if (this.refreshCacheButton) {
      this.refreshCacheButton.addEventListener('click', () => {
        this.events.onRefreshCache()
      })
    }
    
    if (this.clearCacheButton) {
      this.clearCacheButton.addEventListener('click', () => {
        this.events.onClearCache()
      })
    }
    
    if (this.showCacheStatsButton) {
      this.showCacheStatsButton.addEventListener('click', () => {
        this.events.onShowCacheStats()
      })
    }
    
    // Enter key support for input field
    if (this.steamVanityInput) {
      this.steamVanityInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          const vanityUrl = this.getVanityInput()
          if (vanityUrl) {
            this.events.onLoadGames(vanityUrl)
          }
        }
      })
      
      // Input change handler for offline availability
      this.steamVanityInput.addEventListener('input', () => {
        const vanityUrl = this.steamVanityInput?.value.trim() || ''
        this.checkOfflineAvailability(vanityUrl)
      })
    }
  }
  
  private setupInputPlaceholder(): void {
    if (this.steamVanityInput) {
      this.steamVanityInput.placeholder = 'e.g., SpiteMonger or steamcommunity.com/id/SpiteMonger'
    }
  }
  
  private getVanityInput(): string | null {
    if (!this.steamVanityInput) return null
    
    const input = this.steamVanityInput.value.trim()
    if (!input) {
      this.showStatus('Please enter a Steam profile URL or vanity name', 'error')
      return null
    }
    
    return input
  }
  
  show(): void {
    if (this.steamUI) {
      this.steamUI.style.display = 'block'
    }
  }
  
  showStatus(message: string, type: 'loading' | 'success' | 'error'): void {
    if (!this.steamStatus) return
    
    this.steamStatus.textContent = message
    this.steamStatus.className = `status-${type}`
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        if (this.steamStatus) {
          this.steamStatus.className = 'status-hidden'
        }
      }, 5000)
    }
  }
  
  setLoadingState(isLoading: boolean): void {
    if (this.loadGamesButton) {
      this.loadGamesButton.disabled = isLoading
    }
  }
  
  updateCacheStats(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
    // Update cache info if it's currently visible
    if (this.cacheInfoDiv && this.cacheInfoDiv.style.display === 'block') {
      this.showCacheStatsInfo(stats)
    }
    
    // Update button text to show entry count
    if (this.showCacheStatsButton) {
      this.showCacheStatsButton.textContent = `Cache Info (${stats.totalEntries})`
    }
  }
  
  showCacheStatsInfo(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
    if (!this.cacheInfoDiv) return
    
    this.cacheInfoDiv.innerHTML = `
      <strong>Cache Statistics:</strong><br>
      • Total entries: ${stats.totalEntries}<br>
      • Cache hits: ${stats.cacheHits}<br>
      • Cache misses: ${stats.cacheMisses}<br>
    `
    
    // Toggle visibility
    const isHidden = this.cacheInfoDiv.style.display === 'none'
    this.cacheInfoDiv.style.display = isHidden ? 'block' : 'none'
    
    if (this.showCacheStatsButton) {
      this.showCacheStatsButton.textContent = isHidden ? 'Hide Info' : 'Cache Info'
    }
  }
  
  checkOfflineAvailability(vanityUrl: string): void {
    if (!this.useOfflineButton) return
    
    if (!vanityUrl) {
      this.useOfflineButton.style.display = 'none'
      return
    }
    
    // For simplified client, always hide offline button since it's not implemented
    this.useOfflineButton.style.display = 'none'
  }
}
