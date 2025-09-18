/**
 * UIManager - Coordinates all UI components and their interactions
 */

import { SteamUIPanel } from './SteamUIPanel'
import { ProgressDisplay } from './ProgressDisplay'
import { WebXRUIPanel } from './WebXRUIPanel'
import { renderTemplate } from '../utils/TemplateEngine'
import uiErrorTemplate from '../templates/ui/error.html?raw'
import type { SteamIntegration } from '../steam-integration/SteamIntegration'

export interface UIManagerEvents {
  steamLoadGames: (vanityUrl: string) => void
  steamLoadFromCache: (vanityUrl: string) => void
  steamUseOffline: (vanityUrl: string) => void
  steamRefreshCache: () => void
  steamClearCache: () => void
  steamShowCacheStats: () => void
  steamDevModeToggle?: (isEnabled: boolean) => void
  webxrEnterVR: () => void
}

export class UIManager {
  // Expose UI panels directly instead of using delegation
  public readonly steamUIPanel: SteamUIPanel
  public readonly progressDisplay: ProgressDisplay
  public readonly webxrUIPanel: WebXRUIPanel
  
  constructor(
    private events: UIManagerEvents,
    private steamIntegration: SteamIntegration
  ) {
    this.steamUIPanel = new SteamUIPanel({
      onLoadGames: this.events.steamLoadGames,
      onLoadFromCache: this.events.steamLoadFromCache,
      onUseOffline: this.events.steamUseOffline,
      onRefreshCache: this.events.steamRefreshCache,
      onClearCache: this.events.steamClearCache,
      onShowCacheStats: this.events.steamShowCacheStats,
      onDevModeToggle: this.events.steamDevModeToggle
    }, this.steamIntegration)
    
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
