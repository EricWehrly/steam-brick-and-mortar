/**
 * SteamUIPanel - Manages Steam-specific UI controls and interactions
 */

// Cross-platform timeout type that works in both Node.js and browser environments
type TimeoutHandle = ReturnType<typeof setTimeout>

import { getElementByIdSafe } from '../utils'
import { renderTemplate } from '../utils/TemplateEngine'
import { EventManager, EventSource } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import { SteamIntegration } from '../steam-integration/SteamIntegration'
import steamCacheStatsTemplate from '../templates/steam-ui/cache-stats.html?raw'

export class SteamUIPanel {
  private eventManager: EventManager
  private steamUI: HTMLElement | null
  private steamUserInput: HTMLInputElement | null
  private loadGamesButton: HTMLButtonElement | null
  private loadFromCacheButton: HTMLButtonElement | null
  private refreshCacheButton: HTMLButtonElement | null
  private clearCacheButton: HTMLButtonElement | null
  private showCacheStatsButton: HTMLButtonElement | null
  private cacheInfoDiv: HTMLElement | null
  private steamStatus: HTMLElement | null
  private cacheCheckDebounceTimeout: TimeoutHandle | null = null
  
  constructor() {
    this.eventManager = EventManager.getInstance()
    
    // Get UI elements
    this.steamUI = document.getElementById('steam-ui')
    this.steamUserInput = getElementByIdSafe('steam-user-input') as HTMLInputElement
    this.loadGamesButton = getElementByIdSafe('load-steam-games') as HTMLButtonElement
    this.loadFromCacheButton = getElementByIdSafe('load-from-cache') as HTMLButtonElement
    this.refreshCacheButton = getElementByIdSafe('refresh-cache') as HTMLButtonElement
    this.clearCacheButton = getElementByIdSafe('clear-cache') as HTMLButtonElement
    this.showCacheStatsButton = getElementByIdSafe('show-cache-stats') as HTMLButtonElement
    this.cacheInfoDiv = document.getElementById('cache-info')
    this.steamStatus = document.getElementById('steam-status')
  }
  
  init(): void {
    this.setupEventListeners()
  }
  
  private setupEventListeners(): void {
    // Hide panel when profile loading starts (from UI or auto-load)
    this.eventManager.registerEventHandler(SteamEventTypes.LoadGames, () => this.hide())
    this.eventManager.registerEventHandler(SteamEventTypes.LoadFromCache, () => this.hide())
    
    // Load Games button
    if (this.loadGamesButton) {
      this.loadGamesButton.addEventListener('click', () => {
        const userInput = this.getUserInput()
        if (userInput) {
          this.eventManager.emit(SteamEventTypes.LoadGames, {
            userInput,
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
            source: EventSource.UI
          })
        }
      })
    }
    
    // Cache management buttons
    if (this.refreshCacheButton) {
      this.refreshCacheButton.addEventListener('click', () => {
        this.eventManager.emit(SteamEventTypes.CacheRefresh, {
          source: EventSource.UI
        })
      })
    }
    
    if (this.clearCacheButton) {
      this.clearCacheButton.addEventListener('click', () => {
        this.eventManager.emit(SteamEventTypes.CacheClear, {
          source: EventSource.UI
        })
      })
    }
    
    if (this.showCacheStatsButton) {
      this.showCacheStatsButton.addEventListener('click', () => {
        this.eventManager.emit(SteamEventTypes.CacheStats, {
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
              source: EventSource.UI
            })
          }
        }
      })
      
      // Input change handler for cache availability with debouncing
      this.steamUserInput.addEventListener('input', () => {
        const userInput = this.steamUserInput?.value.trim() || ''
        
        // Clear any existing debounce timer
        if (this.cacheCheckDebounceTimeout !== null) {
          clearTimeout(this.cacheCheckDebounceTimeout)
        }
        
        if (!userInput) {
          // If no input, immediately hide the button (no debounce needed)
          this.updateLoadFromCacheButtonVisibility(false)
          return
        }
        
        // Debounce cache check for 250ms to avoid excessive calls while typing
        this.cacheCheckDebounceTimeout = setTimeout(() => {
          const steamIntegration = SteamIntegration.getInstance()
          
          if (steamIntegration) {
            const hasCache = steamIntegration.hasCachedData(userInput)
            this.updateLoadFromCacheButtonVisibility(hasCache)
          } else {
            // No SteamIntegration instance, hide the button
            this.updateLoadFromCacheButtonVisibility(false)
          }
          
          this.cacheCheckDebounceTimeout = null
        }, 250)
      })
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
    
    // Manage loading state based on status type
    if (type === 'loading') {
      this.setLoadingState(true)
    } else if (type === 'error' || type === 'success') {
      this.setLoadingState(false)
      if (type === 'success') {
        // Auto-hide success messages after 5 seconds
        setTimeout(() => {
          if (this.steamStatus) {
            this.steamStatus.className = 'status-hidden'
          }
        }, 5000)
      }
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
  
  updateCacheStats(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
    // Update cache info if it's currently visible
    if (this.cacheInfoDiv?.style.display === 'block') {
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
  
  updateLoadFromCacheButtonVisibility(hasCache: boolean): void {
    if (!this.loadFromCacheButton) return

    if (!hasCache) {
      this.loadFromCacheButton.classList.add('hidden')
      return
    }
    
    this.loadFromCacheButton.classList.remove('hidden')
  }
  
  dispose(): void {
    if (this.cacheCheckDebounceTimeout !== null) {
      clearTimeout(this.cacheCheckDebounceTimeout)
      this.cacheCheckDebounceTimeout = null
    }
  }
}
