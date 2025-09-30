/**
 * SteamUIPanel - Manages Steam-specific UI controls and interactions
 */

import { getElementByIdSafe } from '../utils'
import { renderTemplate } from '../utils/TemplateEngine'
import { EventManager, EventSource } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import steamCacheStatsTemplate from '../templates/steam-ui/cache-stats.html?raw'

export class SteamUIPanel {
  private eventManager: EventManager
  private steamUI: HTMLElement | null
  private steamUserInput: HTMLInputElement | null
  private loadGamesButton: HTMLButtonElement | null
  private loadFromCacheButton: HTMLButtonElement | null
  private useOfflineButton: HTMLButtonElement | null
  private refreshCacheButton: HTMLButtonElement | null
  private clearCacheButton: HTMLButtonElement | null
  private showCacheStatsButton: HTMLButtonElement | null
  private cacheInfoDiv: HTMLElement | null
  private steamStatus: HTMLElement | null
  
  constructor() {
    this.eventManager = EventManager.getInstance()
    
    // Get UI elements
    this.steamUI = document.getElementById('steam-ui')
    this.steamUserInput = getElementByIdSafe('steam-user-input') as HTMLInputElement
    this.loadGamesButton = getElementByIdSafe('load-steam-games') as HTMLButtonElement
    this.loadFromCacheButton = getElementByIdSafe('load-from-cache') as HTMLButtonElement
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
        const userInput = this.getUserInput()
        if (userInput) {
          // Keep UI visible but show loading state
          this.setLoadingState(true)
          this.showStatus('Loading Steam games...', 'loading')
          
          this.eventManager.emit(SteamEventTypes.LoadGames, {
            userInput,
            timestamp: Date.now(),
            source: EventSource.UI
          })
        }
      })
    }
    
    // Load from Cache button
    if (this.loadFromCacheButton) {
      this.loadFromCacheButton.addEventListener('click', () => {
        const userInput = this.getUserInput()
        if (userInput) {
          this.eventManager.emit(SteamEventTypes.LoadFromCache, {
            userInput,
            timestamp: Date.now(),
            source: EventSource.UI
          })
        }
      })
    }
    
    // Use Offline button
    if (this.useOfflineButton) {
      this.useOfflineButton.addEventListener('click', () => {
        const userInput = this.getUserInput()
        if (userInput) {
          this.eventManager.emit(SteamEventTypes.UseOffline, {
            userInput,
            timestamp: Date.now(),
            source: EventSource.UI
          })
        }
      })
    }
    
    // Cache management buttons
    if (this.refreshCacheButton) {
      this.refreshCacheButton.addEventListener('click', () => {
        this.eventManager.emit(SteamEventTypes.CacheRefresh, {
          timestamp: Date.now(),
          source: EventSource.UI
        })
      })
    }
    
    if (this.clearCacheButton) {
      this.clearCacheButton.addEventListener('click', () => {
        this.eventManager.emit(SteamEventTypes.CacheClear, {
          timestamp: Date.now(),
          source: EventSource.UI
        })
      })
    }
    
    if (this.showCacheStatsButton) {
      this.showCacheStatsButton.addEventListener('click', () => {
        this.eventManager.emit(SteamEventTypes.CacheStats, {
          timestamp: Date.now(),
          source: EventSource.UI
        })
      })
    }
    
    // Enter key support for input field
    if (this.steamUserInput) {
      this.steamUserInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          const userInput = this.getUserInput()
          if (userInput) {
            this.eventManager.emit(SteamEventTypes.LoadGames, {
              userInput,
              timestamp: Date.now(),
              source: EventSource.UI
            })
          }
        }
      })
      
      // Input change handler for cache and offline availability
      this.steamUserInput.addEventListener('input', () => {
        const userInput = this.steamUserInput?.value.trim() || ''
        this.checkOfflineAvailability(userInput)
        
        // Show/hide Load from Cache button based on input presence
        // The actual cache availability will be handled by the workflow manager
        this.checkCacheAvailability(userInput, Boolean(userInput))
      })
    }
    

  }
  
  private setupInputPlaceholder(): void {
    if (this.steamUserInput) {
      this.steamUserInput.placeholder = 'e.g., SpiteMonger, 76561198054514251, or steamcommunity.com/profiles/76561198054514251'
    }
  }
  
  private getUserInput(): string | null {
    if (!this.steamUserInput) return null
    
    const input = this.steamUserInput.value.trim()
    if (!input) {
      this.showStatus('Please enter a Steam Profile URL, Custom URL, or Steam ID', 'error')
      return null
    }
    
    return input
  }
  
  show(): void {
    if (this.steamUI) {
      this.steamUI.classList.remove('hidden')
    }
  }
  
  hide(): void {
    if (this.steamUI) {
      this.steamUI.classList.add('hidden')
    }
  }
  
  showStatus(message: string, type: 'loading' | 'success' | 'error'): void {
    if (!this.steamStatus) return
    
    // Use innerHTML for error messages that may contain HTML formatting, textContent for others
    if (type === 'error' && message.includes('<br>')) {
      this.steamStatus.innerHTML = message
    } else {
      this.steamStatus.textContent = message
    }
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
    // Disable all interactive elements during loading
    if (this.loadGamesButton) {
      this.loadGamesButton.disabled = isLoading
    }
    if (this.loadFromCacheButton) {
      this.loadFromCacheButton.disabled = isLoading
    }
    if (this.useOfflineButton) {
      this.useOfflineButton.disabled = isLoading
    }
    if (this.steamUserInput) {
      this.steamUserInput.disabled = isLoading
    }
    
    // Set visual state for the entire UI panel
    if (this.steamUI) {
      if (isLoading) {
        this.steamUI.classList.add('loading')
      } else {
        this.steamUI.classList.remove('loading')
      }
    }
  }

  /**
   * Handle error state - re-enable UI for retry and show error message
   */
  handleError(errorMessage: string): void {
    this.setLoadingState(false)  // Re-enable all controls
    this.showStatus(errorMessage, 'error')
    // Keep the steam UI panel visible so user can retry
    this.show()
  }

  /**
   * Handle successful completion - can hide UI or transition to game view
   */
  handleSuccess(): void {
    this.setLoadingState(false)
    // For now, hide the UI on success (games will be loaded)
    this.hide()
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
    
    this.cacheInfoDiv.innerHTML = renderTemplate(steamCacheStatsTemplate, stats)
    
    // Toggle visibility
    const isHidden = this.cacheInfoDiv.style.display === 'none'
    this.cacheInfoDiv.style.display = isHidden ? 'block' : 'none'
    
    if (this.showCacheStatsButton) {
      this.showCacheStatsButton.textContent = isHidden ? 'Hide Info' : 'Cache Info'
    }
  }
  
  checkCacheAvailability(userInput: string, hasCache: boolean): void {
    if (!this.loadFromCacheButton) return
    
    if (!userInput || !hasCache) {
      this.loadFromCacheButton.classList.add('hidden')
      return
    }
    
    // Show the Load from Cache button when cached data is available
    this.loadFromCacheButton.classList.remove('hidden')
  }
  
  checkOfflineAvailability(userInput: string): void {
    if (!this.useOfflineButton) return
    
    if (!userInput) {
      this.useOfflineButton.classList.add('hidden')
      return
    }
    
    // For simplified client, always hide offline button since it's not implemented
    this.useOfflineButton.classList.add('hidden')
  }
  

}
