/**
 * SteamUIPanel - Manages Steam-specific UI controls and interactions
 */

// Cross-platform timeout type that works in both Node.js and browser environments
type TimeoutHandle = ReturnType<typeof setTimeout>

import { getElementByIdSafe } from '../utils'
import { renderTemplate } from '../utils/TemplateEngine'
import { EventManager, EventSource } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamImportLibraryEvent } from '../types/InteractionEvents'
import { SteamIntegration } from '../steam-integration/SteamIntegration'
import { validateLibraryExportPayload } from '../steam-integration/LibrarySource'
import type { SteamCacheClearEvent } from '../types/InteractionEvents'
import { Logger } from '../utils/Logger'
import steamCacheStatsTemplate from '../templates/steam-ui/cache-stats.html?raw'

/** The comment-free build of export-library.js (yarn build:bookmarklets), not the readable
 *  source — a javascript: bookmark gets flattened to one line by many browsers when dragged
 *  to the bookmarks bar, and a `//` comment with no real newline left to end it would swallow
 *  everything after it. Fetched at runtime so the install link can't drift from what ships. */
const BOOKMARKLET_SOURCE_URL = '/bookmarklets/export-library.min.js'
/** The readable source, for the "paste into console" fallback — a console paste never gets
 *  flattened to one line, so comments are safe there and worth keeping for transparency. */
const BOOKMARKLET_READABLE_SOURCE_URL = '/bookmarklets/export-library.js'

export class SteamUIPanel {
  private static readonly logger = Logger.createLogFunctions(SteamUIPanel.name)

  private eventManager: EventManager
  private steamUI: HTMLElement | null
  private steamUserInput: HTMLInputElement | null
  private loadGamesButton: HTMLButtonElement | null
  private loadFromCacheButton: HTMLButtonElement | null
  private refreshCacheButton: HTMLButtonElement | null
  private clearCacheButton: HTMLButtonElement | null
  private showCacheStatsButton: HTMLButtonElement | null
  private importFromFileButton: HTMLButtonElement | null
  private importFileInput: HTMLInputElement | null
  private bookmarkletInstallLink: HTMLAnchorElement | null
  private bookmarkletConsoleSource: HTMLElement | null
  private bookmarkletConsoleCopyButton: HTMLButtonElement | null
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
    this.importFromFileButton = getElementByIdSafe('import-from-file') as HTMLButtonElement
    this.importFileInput = getElementByIdSafe('import-file-input') as HTMLInputElement
    this.bookmarkletInstallLink = getElementByIdSafe('bookmarklet-install-link') as HTMLAnchorElement
    this.bookmarkletConsoleSource = document.getElementById('bookmarklet-console-source')
    this.bookmarkletConsoleCopyButton = getElementByIdSafe('bookmarklet-console-copy') as HTMLButtonElement
    this.cacheInfoDiv = document.getElementById('cache-info')
    this.steamStatus = document.getElementById('steam-status')
  }

  init(): void {
    this.setupEventListeners()
    this.initBookmarkletInstallLink()
  }

  /**
   * Builds the bookmarklet install link from the actual served source (not a hand-copied
   * duplicate) so the instructions can never drift from what ships.
   *
   * The link does double duty and needs no separate "Import from Steam" button: clicking it
   * (rather than dragging it to the bookmarks bar) runs the same javascript: href natively, in
   * this page's context — which is exactly what the bookmarklet's own "not on Steam yet" branch
   * is for. It opens the tagged Steam games page itself, same as a dedicated button would
   * have. Dragging it installs it for later, for completing the capture on the Steam side.
   */
  private initBookmarkletInstallLink(): void {
    if (this.bookmarkletInstallLink) {
      fetch(BOOKMARKLET_SOURCE_URL)
        .then(response => response.text())
        .then(source => {
          if (!this.bookmarkletInstallLink) return
          this.bookmarkletInstallLink.href = `javascript:${source}`
          // Not preventing default: clicking (not dragging) should run it right here.
          this.bookmarkletInstallLink.addEventListener('click', () => {
            this.showStatus('Opening your Steam games page — click the same bookmark again there to finish, or use the console-paste option below.', 'loading')
          })
        })
        .catch(error => {
          SteamUIPanel.logger.error('Failed to load bookmarklet source for install link:', error)
        })
    }

    if (this.bookmarkletConsoleSource || this.bookmarkletConsoleCopyButton) {
      fetch(BOOKMARKLET_READABLE_SOURCE_URL)
        .then(response => response.text())
        .then(source => {
          if (this.bookmarkletConsoleSource) this.bookmarkletConsoleSource.textContent = source
          if (this.bookmarkletConsoleCopyButton) {
            this.bookmarkletConsoleCopyButton.addEventListener('click', () => {
              navigator.clipboard.writeText(source)
                .then(() => this.showStatus('Code copied — paste it into the console on your Steam games page.', 'success'))
                .catch(() => this.showStatus('Could not copy to clipboard.', 'error'))
            })
          }
        })
        .catch(error => {
          SteamUIPanel.logger.error('Failed to load bookmarklet source for console-paste block:', error)
        })
    }
  }

  private setupEventListeners(): void {
    // steam-ui starts hidden and only shows once we know we've landed on the anonymous store —
    // DataLoaded fires after every successful load (online, demo, or imported), so checking
    // isAnonymous() there is a single hinge point instead of separately wiring show/hide to
    // every event that could mean "a real profile just loaded."
    this.eventManager.registerEventHandler(SteamEventTypes.DataLoaded, () => {
      if (SteamIntegration.getInstance()?.isAnonymous()) {
        this.show()
      } else {
        this.hide()
      }
    })

    // Load Games button
    if (this.loadGamesButton) {
      this.loadGamesButton.addEventListener('click', () => {
        const userInput = this.getUserInput()
        if (userInput) {
          this.eventManager.emit(SteamEventTypes.LoadLibrary, {
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
          this.eventManager.emit(SteamEventTypes.LoadLibrary, {
            userInput,
            source: EventSource.UI
          })
        }
      })
    }
    
    // Cache management buttons
    if (this.refreshCacheButton) {
      this.refreshCacheButton.addEventListener('click', () => {
        this.eventManager.emit(SteamEventTypes.LoadLibrary, {
          forceUpdate: true,
          source: EventSource.UI
        })
      })
    }
    
    if (this.clearCacheButton) {
      this.clearCacheButton.addEventListener('click', () => {
        this.eventManager.emit<SteamCacheClearEvent>(SteamEventTypes.CacheClear, {
          scope: 'all',
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

    if (this.importFromFileButton) {
      this.importFromFileButton.addEventListener('click', () => this.importFileInput?.click())
    }

    if (this.importFileInput) {
      this.importFileInput.addEventListener('change', this.handleImportFileSelected.bind(this))
    }

    // Enter key support for input field
    if (this.steamUserInput) {
      this.steamUserInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          const userInput = this.getUserInput()
          if (userInput) {
            this.eventManager.emit(SteamEventTypes.LoadLibrary, {
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

  /** The bookmarklet's own delivery (postMessage) is handled entirely by SteamIntegration —
   *  this panel only owns the file-picker path, since that's the one that's genuinely a DOM
   *  concern (an <input type=file>). Validation logic itself is shared, not re-implemented
   *  here — see validateLibraryExportPayload. */
  private handleImportFileSelected(): void {
    const file = this.importFileInput?.files?.[0]
    if (!file || !this.importFileInput) return

    file.text()
      .then(text => {
        const validated = validateLibraryExportPayload(JSON.parse(text))
        if (!validated) {
          this.showStatus('That file doesn\'t look like a Steam library export.', 'error')
          return
        }

        this.showStatus(`Library imported! (${validated.games.length} games)`, 'success')
        this.eventManager.emit<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, {
          games: validated.games,
          displayName: validated.displayName ?? undefined,
          channel: 'file',
          source: EventSource.UI
        })
      })
      .catch(error => {
        SteamUIPanel.logger.error('Failed to read imported library file:', error)
        this.showStatus('Could not read that file.', 'error')
      })
      .finally(() => {
        if (this.importFileInput) this.importFileInput.value = ''
      })
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
