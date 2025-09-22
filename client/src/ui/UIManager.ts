/**
 * UIManager - Coordinates all UI components and their interactions
 */

import { SteamUIPanel } from './SteamUIPanel'
import { ProgressDisplay } from './ProgressDisplay'
import { WebXRUIPanel } from './WebXRUIPanel'
import { renderTemplate } from '../utils/TemplateEngine'
import uiErrorTemplate from '../templates/ui/error.html?raw'

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
      loading.classList.add('hidden')
    }
  }
  
  showError(message: string): void {
    const loading = document.getElementById('loading')
    if (loading) {
      loading.innerHTML = renderTemplate(uiErrorTemplate, { message })
    }
  }

  /**
   * Get singleton instance - creates itself when first accessed
   */
  static getInstance(): UIManager {
    if (!UIManager.instance) {
      // Self-initialize with no dependencies - truly self-sufficient
      UIManager.instance = new UIManager()
    }
    return UIManager.instance
  }
}
