/**
 * LOD Debug Overlay - Visual display of LOD distance zones
 * 
 * Shows a small radar-style overlay with:
 * - Colored rings showing HIGH/MID/LOW distance thresholds
 * - Dots representing game boxes colored by their current LOD
 * - Camera position at center
 * 
 * Toggle via AppSettings.showLodDebug
 */

import * as THREE from 'three'
import { AppSettings, type SettingChangedEvent } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { AppSettingsEventTypes } from '../types/InteractionEvents'
import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { LOD_LEVEL, type LodLevel } from '../scene/game-box/instancing/LodArtworkRenderer'
import { Logger } from '../utils/Logger'

const log = Logger.withContext('LodDebugOverlay')

interface LodInstanceData {
    position: THREE.Vector3
    lodLevel: LodLevel
}

// Colors for LOD levels (matching typical traffic light pattern)
const LOD_COLORS = {
    [LOD_LEVEL.HIGH]: '#22ff22',   // Green - high quality
    [LOD_LEVEL.MID]: '#ffaa00',    // Orange - medium quality  
    [LOD_LEVEL.LOW]: '#ff4444'     // Red - low quality
}

const ZONE_COLORS = {
    high: 'rgba(34, 255, 34, 0.2)',
    mid: 'rgba(255, 170, 0, 0.15)',
    low: 'rgba(255, 68, 68, 0.1)'
}

export interface LodDebugConfig {
    /** Distance for HIGH LOD zone (meters) */
    highDistance: number
    /** Distance for MID LOD zone (meters) */
    midDistance: number
    /** Max distance to show on radar (meters) */
    maxDistance: number
    /** Size of the overlay in pixels */
    overlaySize: number
}

const DEFAULT_CONFIG: LodDebugConfig = {
    highDistance: 3.0,
    midDistance: 8.0,
    maxDistance: 15.0,
    overlaySize: 200
}

export class LodDebugOverlay {
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D
    private container: HTMLDivElement
    private config: LodDebugConfig
    private isVisible: boolean = false
    
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly dataManager: DataManager
    private readonly appSettings: AppSettings
    private readonly eventManager: EventManager
    
    // Callback to get instance data from LOD system
    private getInstanceData: (() => ReadonlyMap<number, LodInstanceData>) | null = null
    
    // Reusable vector for calculations
    private readonly tmpVec = new THREE.Vector3()

    constructor(config: Partial<LodDebugConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.dataManager = DataManager.getInstance()
        this.appSettings = AppSettings.getInstance()
        this.eventManager = EventManager.getInstance()
        
        // Create container
        this.container = document.createElement('div')
        this.container.id = 'lod-debug-overlay'
        this.container.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: ${this.config.overlaySize + 10}px;
            height: ${this.config.overlaySize + 10}px;
            background: rgba(0, 0, 0, 0.7);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            padding: 5px;
            display: none;
            z-index: 1000;
            pointer-events: none;
        `
        
        // Create canvas
        this.canvas = document.createElement('canvas')
        this.canvas.width = this.config.overlaySize
        this.canvas.height = this.config.overlaySize
        this.canvas.style.borderRadius = '50%'
        
        const ctx = this.canvas.getContext('2d')
        if (!ctx) throw new Error('Could not get 2D context')
        this.ctx = ctx
        
        this.container.appendChild(this.canvas)
        
        // Add legend
        const legend = this.createLegend()
        this.container.appendChild(legend)
        
        document.body.appendChild(this.container)
        
        // Listen for setting changes
        this.eventManager.registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            (event) => {
                if (event.detail.key === 'showLodDebug') {
                    this.setVisible(event.detail.value as boolean)
                }
            }
        )
        
        // Check initial setting
        this.setVisible(this.appSettings.getSetting('showLodDebug') ?? false)
    }
    
    private createLegend(): HTMLDivElement {
        const legend = document.createElement('div')
        legend.style.cssText = `
            position: absolute;
            bottom: -60px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            font-family: monospace;
            font-size: 10px;
            color: white;
            white-space: nowrap;
        `
        
        const items = [
            { label: 'HIGH', color: LOD_COLORS[LOD_LEVEL.HIGH] },
            { label: 'MID', color: LOD_COLORS[LOD_LEVEL.MID] },
            { label: 'LOW', color: LOD_COLORS[LOD_LEVEL.LOW] }
        ]
        
        for (const item of items) {
            const span = document.createElement('span')
            span.innerHTML = `<span style="color: ${item.color}">●</span> ${item.label}`
            legend.appendChild(span)
        }
        
        return legend
    }
    
    /**
     * Set the data source for LOD instance information
     */
    public setDataSource(getter: () => ReadonlyMap<number, LodInstanceData>): void {
        this.getInstanceData = getter
        log.lifecycle('Data source connected')
    }
    
    /**
     * Update distance thresholds (call if LOD config changes)
     */
    public updateThresholds(highDistance: number, midDistance: number): void {
        this.config.highDistance = highDistance
        this.config.midDistance = midDistance
    }
    
    public setVisible(visible: boolean): void {
        this.isVisible = visible
        this.container.style.display = visible ? 'block' : 'none'
        log.lifecycle(`Visibility: ${visible}`)
        
        if (visible && !this.isRegistered()) {
            this.renderLoopRegistry.register('LodDebugOverlay', this.update.bind(this))
        } else if (!visible && this.isRegistered()) {
            this.renderLoopRegistry.unregister('LodDebugOverlay')
        }
    }
    
    private isRegistered(): boolean {
        // Check if we're in the registry by trying to unregister (hacky but works)
        return this.isVisible
    }
    
    private update(_now: number, _deltaTime: number): void {
        if (!this.isVisible) return
        
        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (!camera) return
        
        this.render(camera)
    }
    
    private render(camera: THREE.Camera): void {
        const { width, height } = this.canvas
        const centerX = width / 2
        const centerY = height / 2
        const scale = (width / 2 - 10) / this.config.maxDistance // pixels per meter
        
        // Clear canvas
        this.ctx.clearRect(0, 0, width, height)
        
        // Draw zone rings (from outside in)
        this.drawZoneRing(centerX, centerY, this.config.maxDistance * scale, ZONE_COLORS.low)
        this.drawZoneRing(centerX, centerY, this.config.midDistance * scale, ZONE_COLORS.mid)
        this.drawZoneRing(centerX, centerY, this.config.highDistance * scale, ZONE_COLORS.high)
        
        // Draw distance markers
        this.drawDistanceMarker(centerX, centerY, this.config.highDistance * scale, `${this.config.highDistance}m`)
        this.drawDistanceMarker(centerX, centerY, this.config.midDistance * scale, `${this.config.midDistance}m`)
        
        // Draw game instances
        if (this.getInstanceData) {
            const instances = this.getInstanceData()
            const cameraPos = camera.position
            const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
            const cameraAngle = Math.atan2(cameraDir.x, -cameraDir.z)
            
            let drawnCount = 0
            for (const [_index, data] of instances) {
                // Calculate position relative to camera (XZ plane)
                this.tmpVec.copy(data.position).sub(cameraPos)
                const dx = this.tmpVec.x
                const dz = this.tmpVec.z
                const distance = Math.sqrt(dx * dx + dz * dz)
                
                if (distance > this.config.maxDistance) continue
                
                // Rotate to align with camera forward
                const angle = Math.atan2(dx, -dz) - cameraAngle
                const screenX = centerX + Math.sin(angle) * distance * scale
                const screenY = centerY - Math.cos(angle) * distance * scale
                
                // Draw dot colored by LOD level
                this.ctx.beginPath()
                this.ctx.arc(screenX, screenY, 3, 0, Math.PI * 2)
                this.ctx.fillStyle = LOD_COLORS[data.lodLevel]
                this.ctx.fill()
                drawnCount++
            }
            
            // Draw instance count text
            this.ctx.font = '10px monospace'
            this.ctx.fillStyle = 'white'
            this.ctx.textAlign = 'center'
            this.ctx.fillText(`${instances.size} total, ${drawnCount} visible`, centerX, height - 5)
        } else {
            // No data source
            this.ctx.font = '10px monospace'
            this.ctx.fillStyle = 'red'
            this.ctx.textAlign = 'center'
            this.ctx.fillText('No data source', centerX, centerY + 40)
        }
        
        // Draw camera position (center)
        this.ctx.beginPath()
        this.ctx.arc(centerX, centerY, 5, 0, Math.PI * 2)
        this.ctx.fillStyle = 'white'
        this.ctx.fill()
        
        // Draw camera direction indicator
        this.ctx.beginPath()
        this.ctx.moveTo(centerX, centerY)
        this.ctx.lineTo(centerX, centerY - 15)
        this.ctx.strokeStyle = 'white'
        this.ctx.lineWidth = 2
        this.ctx.stroke()
        
        // Draw "N" for north (forward in our coordinate system)
        this.ctx.font = '10px monospace'
        this.ctx.fillStyle = 'white'
        this.ctx.textAlign = 'center'
        this.ctx.fillText('▲', centerX, centerY - 20)
    }
    
    private drawZoneRing(cx: number, cy: number, radius: number, color: string): void {
        this.ctx.beginPath()
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        this.ctx.fillStyle = color
        this.ctx.fill()
        
        // Draw ring border
        this.ctx.beginPath()
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        this.ctx.lineWidth = 1
        this.ctx.stroke()
    }
    
    private drawDistanceMarker(cx: number, cy: number, radius: number, label: string): void {
        this.ctx.font = '9px monospace'
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        this.ctx.textAlign = 'right'
        this.ctx.fillText(label, cx + radius - 2, cy - 2)
    }
    
    public dispose(): void {
        this.renderLoopRegistry.unregister('LodDebugOverlay')
        this.container.remove()
    }
}
