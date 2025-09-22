/**
 * WebXRUIPanel - Manages WebXR-specific UI controls
 */

import { EventManager, EventSource } from '../core/EventManager'
import { WebXREventTypes } from '../types/InteractionEvents'

export class WebXRUIPanel {
  private eventManager: EventManager
  private xrButton: HTMLElement | null
  private controlsHelp: HTMLElement | null
  
  constructor() {
    this.eventManager = EventManager.getInstance()
    this.xrButton = document.getElementById('webxr-button')
    this.controlsHelp = document.getElementById('controls-help')
  }
  
  init(): void {
    this.setupEventListeners()
  }
  
  private setupEventListeners(): void {
    if (this.xrButton) {
      this.xrButton.addEventListener('click', () => {
        this.eventManager.emit(WebXREventTypes.Toggle, {
          timestamp: Date.now(),
          source: EventSource.UI
        })
      })
    }
  }
  
  setSupported(supported: boolean): void {
    if (!this.xrButton) return
    
    this.xrButton.classList.remove('hidden')
    
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
      this.controlsHelp.classList.remove('hidden')
    }
  }
}
