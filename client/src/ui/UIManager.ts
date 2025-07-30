/**
 * UIManager - Coordinates all UI components and their interactions
 */

import { SteamUIPanel } from './SteamUIPanel'
import { ProgressDisplay } from './ProgressDisplay'
import { WebXRUIPanel } from './WebXRUIPanel'
import { renderTemplate } from '../utils/TemplateEngine'
import uiErrorTemplate from '../templates/ui/error.html?raw'

export interface UIManagerEvents {
  steamLoadGames: (vanityUrl: string) => void
  steamUseOffline: (vanityUrl: string) => void
  steamRefreshCache: () => void
  steamClearCache: () => void
  steamShowCacheStats: () => void
  webxrEnterVR: () => void
}

export class UIManager {
  private steamUIPanel: SteamUIPanel
  private progressDisplay: ProgressDisplay
  private webxrUIPanel: WebXRUIPanel
  
  constructor(private events: UIManagerEvents) {
    this.steamUIPanel = new SteamUIPanel({
      onLoadGames: this.events.steamLoadGames,
      onUseOffline: this.events.steamUseOffline,
      onRefreshCache: this.events.steamRefreshCache,
      onClearCache: this.events.steamClearCache,
      onShowCacheStats: this.events.steamShowCacheStats
    })
    
    this.progressDisplay = new ProgressDisplay()
    
    this.webxrUIPanel = new WebXRUIPanel({
      onEnterVR: this.events.webxrEnterVR
    })
  }
  
  init(): void {
    this.steamUIPanel.init()
    this.progressDisplay.init()
    this.webxrUIPanel.init()
    
    // Show initial UI state
    this.showSteamUI()
    this.showControlsHelp()
  }
  
  // Steam UI delegation
  showSteamStatus(message: string, type: 'loading' | 'success' | 'error'): void {
    this.steamUIPanel.showStatus(message, type)
  }
  
  updateCacheStats(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
    this.steamUIPanel.updateCacheStats(stats)
  }
  
  checkOfflineAvailability(vanityUrl: string): void {
    this.steamUIPanel.checkOfflineAvailability(vanityUrl)
  }
  
  // Progress UI delegation
  showProgress(show: boolean): void {
    this.progressDisplay.show(show)
  }
  
  updateProgress(current: number, total: number, message: string, gameText?: string): void {
    this.progressDisplay.update(current, total, message, gameText)
  }
  
  // WebXR UI delegation
  setWebXRSupported(supported: boolean): void {
    this.webxrUIPanel.setSupported(supported)
  }
  
  setWebXRSessionActive(active: boolean): void {
    this.webxrUIPanel.setSessionActive(active)
  }
  
  // Overall UI state
  private showSteamUI(): void {
    this.steamUIPanel.show()
  }
  
  private showControlsHelp(): void {
    this.webxrUIPanel.showControlsHelp()
  }
  
  hideLoading(): void {
    const loading = document.getElementById('loading')
    if (loading) {
      loading.style.display = 'none'
    }
  }
  
  showError(message: string): void {
    const loading = document.getElementById('loading')
    if (loading) {
      loading.innerHTML = renderTemplate(uiErrorTemplate, { message })
    }
  }
}
