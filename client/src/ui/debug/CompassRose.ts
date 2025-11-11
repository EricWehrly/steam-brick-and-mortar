/**
 * Compass Rose - Visual direction indicator for debugging spatial orientation
 * Shows N/S/E/W directions in top-right corner of screen
 */

import * as THREE from 'three'
import { AppSettings, type SettingChangedEvent } from '../../core/AppSettings'
import { EventManager } from '../../core/EventManager'
import { AppSettingsEventTypes } from '../../types/InteractionEvents'

export class CompassRose {
    private container: HTMLDivElement
    private camera: THREE.Camera
    private isVisible: boolean = true
    private appSettings: AppSettings
    private eventManager: EventManager

    constructor(camera: THREE.Camera) {
        this.camera = camera
        this.appSettings = AppSettings.getInstance()
        this.eventManager = EventManager.getInstance()
        
        this.container = this.createCompassElement()
        document.body.appendChild(this.container)
        
        // Set initial visibility from settings (default: off)
        this.setVisible(this.appSettings.getSetting('showCompassRose'))
        
        // Listen for setting changes
        this.eventManager.registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            (event) => {
                if (event.detail.key === 'showCompassRose') {
                    this.setVisible(event.detail.value as boolean)
                }
            }
        )
    }

    private createCompassElement(): HTMLDivElement {
        const compass = document.createElement('div')
        compass.id = 'compass-rose'
        compass.style.position = 'fixed'
        compass.style.top = '60px'
        compass.style.right = '20px'
        compass.style.width = '80px'
        compass.style.height = '80px'
        compass.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
        compass.style.border = '2px solid rgba(255, 255, 255, 0.3)'
        compass.style.borderRadius = '50%'
        compass.style.display = 'flex'
        compass.style.alignItems = 'center'
        compass.style.justifyContent = 'center'
        compass.style.fontFamily = 'monospace'
        compass.style.fontSize = '12px'
        compass.style.color = 'white'
        compass.style.zIndex = '1000'
        compass.style.pointerEvents = 'none'

        // Create cardinal direction labels
        const directions = [
            { label: 'N', angle: 0, color: '#ff4444' },      // North (red) - negative Z
            { label: 'E', angle: 90, color: '#44ff44' },     // East (green) - positive X
            { label: 'S', angle: 180, color: '#ffffff' },    // South (white) - positive Z
            { label: 'W', angle: 270, color: '#4444ff' }     // West (blue) - negative X
        ]

        directions.forEach(dir => {
            const label = document.createElement('div')
            label.textContent = dir.label
            label.style.position = 'absolute'
            label.style.color = dir.color
            label.style.fontWeight = 'bold'
            label.style.fontSize = '14px'
            label.className = `compass-${dir.label.toLowerCase()}`
            
            // Position labels around circle
            const radius = 28
            const rad = (dir.angle - 90) * Math.PI / 180 // -90 to start from top
            const x = radius * Math.cos(rad)
            const y = radius * Math.sin(rad)
            
            label.style.left = `calc(50% + ${x}px - 6px)`
            label.style.top = `calc(50% + ${y}px - 7px)`
            
            compass.appendChild(label)
        })

        // Center dot
        const center = document.createElement('div')
        center.style.position = 'absolute'
        center.style.width = '4px'
        center.style.height = '4px'
        center.style.backgroundColor = 'yellow'
        center.style.borderRadius = '50%'
        center.style.left = 'calc(50% - 2px)'
        center.style.top = 'calc(50% - 2px)'
        compass.appendChild(center)

        return compass
    }

    public update(): void {
        if (!this.isVisible) return

        // Get camera rotation
        const cameraDirection = new THREE.Vector3()
        this.camera.getWorldDirection(cameraDirection)
        
        // Calculate angle (0 = looking north/-Z, increases clockwise)
        const angle = Math.atan2(cameraDirection.x, -cameraDirection.z) * 180 / Math.PI
        
        // Rotate compass to match camera orientation
        this.container.style.transform = `rotate(${-angle}deg)`
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible
        this.container.style.display = visible ? 'flex' : 'none'
    }

    public dispose(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container)
        }
    }
}
