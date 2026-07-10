import { SteamUIPanel } from './SteamUIPanel'
import { ProgressDisplay } from './ProgressDisplay'
import { WebXRUIPanel } from './WebXRUIPanel'
import { renderTemplate } from '../utils/TemplateEngine'
import uiErrorTemplate from '../templates/ui/error.html?raw'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import { SteamApiClient } from '../steam'

export class UIManager {
  private static instance: UIManager | null = null

  // Expose UI panels directly instead of using delegation
  public readonly steamUIPanel: SteamUIPanel
  public readonly progressDisplay: ProgressDisplay
  public readonly webxrUIPanel: WebXRUIPanel

  constructor() {
    this.steamUIPanel = new SteamUIPanel()

    this.progressDisplay = new ProgressDisplay()

    this.webxrUIPanel = new WebXRUIPanel()
  }

  init(): void {
    this.steamUIPanel.init()
    this.progressDisplay.init()
    this.webxrUIPanel.init()

    // steam-ui starts hidden (its markup default) and only shows once SteamIntegration
    // resolves to the anonymous store — see SteamUIPanel's DataLoaded handler. Showing it
    // unconditionally here used to make it briefly flash even when a real profile (online or
    // imported) was about to auto-load.
    this.webxrUIPanel.showControlsHelp()

    const eventManager = EventManager.getInstance()
    eventManager.registerEventHandler(SteamEventTypes.CacheStats, this.showCacheStats.bind(this))
  }

  private async showCacheStats(): Promise<void> {
    try {
      const cacheManager = SteamApiClient.getInstance().getCacheManager()
      const stats = cacheManager.getStats()

      if (stats) {
        this.steamUIPanel.updateCacheStats(stats)
      }
    } catch (error) {
      console.error('Failed to get cache stats:', error)
    }
  }

  hideLoading(): void {
    const loading = document.getElementById('loading')
    if (loading) {
      loading.classList.add('hidden')
    }
  }

  showError(message: string): void {
    const loading = document.getElementById('loading')
    if (loading) {
      loading.innerHTML = renderTemplate(uiErrorTemplate, { message })
    }
  }

  static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager()
    }
    return UIManager.instance
  }
}
