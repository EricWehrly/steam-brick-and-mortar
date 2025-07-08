/**
 * WebXRUIPanel - Manages WebXR-specific UI controls
 */

export interface WebXRUIPanelEvents {
  onEnterVR: () => void
}

export class WebXRUIPanel {
  private xrButton: HTMLElement | null
  private controlsHelp: HTMLElement | null
  
  constructor(private events: WebXRUIPanelEvents) {
    this.xrButton = document.getElementById('webxr-button')
    this.controlsHelp = document.getElementById('controls-help')
  }
  
  init(): void {
    this.setupEventListeners()
  }
  
  private setupEventListeners(): void {
    if (this.xrButton) {
      this.xrButton.addEventListener('click', () => {
        this.events.onEnterVR()
      })
    }
  }
  
  setSupported(supported: boolean): void {
    if (!this.xrButton) return
    
    this.xrButton.style.display = 'block'
    
    if (supported) {
      this.xrButton.textContent = 'Enter VR'
      if (this.xrButton instanceof HTMLButtonElement) {
        this.xrButton.disabled = false
      }
    } else {
      this.xrButton.textContent = 'VR Not Available'
      if (this.xrButton instanceof HTMLButtonElement) {
        this.xrButton.disabled = true
      }
    }
  }
  
  setSessionActive(active: boolean): void {
    if (!this.xrButton) return
    
    this.xrButton.textContent = active ? 'Exit VR' : 'Enter VR'
  }
  
  showControlsHelp(): void {
    if (this.controlsHelp) {
      this.controlsHelp.style.display = 'block'
    }
  }
}
