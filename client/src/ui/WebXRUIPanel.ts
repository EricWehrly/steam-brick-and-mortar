/**
 * WebXRUIPanel - Manages WebXR-specific UI controls
 */

import { EventManager, EventSource } from '../core/EventManager'
import { InputEventTypes, WebXREventTypes, type InputDevicesChangedEvent } from '../types/InteractionEvents'
import { InputDeviceKind } from '../input/InputProfile'

export class WebXRUIPanel {
  private eventManager: EventManager
  private xrButton: HTMLElement | null
  private controlsHelp: HTMLElement | null
  private vrHeadsetStatus: HTMLElement | null

  constructor() {
    this.eventManager = EventManager.getInstance()
    this.xrButton = document.getElementById('webxr-button')
    this.controlsHelp = document.getElementById('controls-help')
    this.vrHeadsetStatus = document.getElementById('vr-headset-status')
  }

  init(): void {
    this.setupEventListeners()
    this.eventManager.registerEventHandler<InputDevicesChangedEvent>(InputEventTypes.DevicesChanged, this.handleDevicesChanged.bind(this))
  }
  
  private setupEventListeners(): void {
    if (this.xrButton) {
      this.xrButton.addEventListener('click', () => {
        this.eventManager.emit(WebXREventTypes.Toggle, {
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

  /**
   * Reflects DeviceDetector's registered device list, not just its own WebXR session state -
   * a VR-kind device can appear here from a real XR session's input sources, or (see
   * DeviceDetector.probeHardwareDevices) from a USB-detected headset with no XR session at all.
   * Owner-managed subscription: this panel owns the DOM element, so it listens for the event
   * that drives it directly rather than being told by a coordinator.
   */
  private handleDevicesChanged(event: CustomEvent<InputDevicesChangedEvent>): void {
    if (!this.vrHeadsetStatus) return

    const vrDevice = event.detail.devices.find(device => device.kind === InputDeviceKind.VR)
    if (vrDevice) {
      this.vrHeadsetStatus.textContent = `🥽 ${vrDevice.name}`
      this.vrHeadsetStatus.classList.remove('hidden')
    } else {
      this.vrHeadsetStatus.classList.add('hidden')
    }
  }
}
