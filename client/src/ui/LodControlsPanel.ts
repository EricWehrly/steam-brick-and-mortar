/**
 * LOD Controls Panel - Real-time Level of Detail control interface
 * 
 * Provides controls for switching texture LOD levels on game box artwork:
 * - Global LOD level buttons (High, Mid, Low)
 * - Visual feedback on current selection
 * - Memory usage display
 */

import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import { LOD_LEVEL, type LodLevel } from '../scene/game-box/instancing/LodArtworkRenderer'

export interface LodControlsConfig {
    /** Callback when LOD level changes */
    onLodChange?: (level: LodLevel) => void
}

export class LodControlsPanel {
    private container: HTMLElement
    private eventManager: EventManager
    private currentLod: LodLevel = LOD_LEVEL.HIGH
    private onLodChange?: (level: LodLevel) => void
    private isVisible: boolean = false

    constructor(eventManager: EventManager, config: LodControlsConfig = {}) {
        this.eventManager = eventManager
        this.onLodChange = config.onLodChange
        this.container = this.createPanel()
    }

    private createPanel(): HTMLElement {
        const panel = document.createElement('div')
        panel.id = 'lod-controls-panel'
        panel.className = 'lod-controls-panel'
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 12px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            display: none;
            min-width: 180px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `
        
        panel.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold; font-size: 14px;">
                🎨 Texture LOD
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <button id="lod-btn-high" class="lod-btn active" data-lod="0" style="${this.getButtonStyle(true)}">
                    High (512px)
                </button>
                <button id="lod-btn-mid" class="lod-btn" data-lod="1" style="${this.getButtonStyle(false)}">
                    Mid (128px)
                </button>
                <button id="lod-btn-low" class="lod-btn" data-lod="2" style="${this.getButtonStyle(false)}">
                    Low (16px)
                </button>
            </div>
            <div id="lod-stats" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px; color: #aaa;">
                <!-- Memory stats will be shown here -->
            </div>
        `
        
        document.body.appendChild(panel)
        this.setupEventListeners(panel)
        
        return panel
    }
    
    private getButtonStyle(isActive: boolean): string {
        const base = `
            padding: 8px 12px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 4px;
            cursor: pointer;
            font-family: monospace;
            font-size: 12px;
            transition: all 0.2s;
        `
        if (isActive) {
            return base + 'background: #4a9eff; color: white; border-color: #4a9eff;'
        }
        return base + 'background: rgba(255,255,255,0.1); color: #ccc;'
    }
    
    private setupEventListeners(panel: HTMLElement): void {
        const buttons = panel.querySelectorAll('.lod-btn')
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLButtonElement
                const lodLevel = parseInt(target.dataset.lod ?? '0') as LodLevel
                this.setLod(lodLevel)
            })
            
            // Hover effects
            btn.addEventListener('mouseenter', (e) => {
                const target = e.target as HTMLButtonElement
                if (!target.classList.contains('active')) {
                    target.style.background = 'rgba(255,255,255,0.2)'
                }
            })
            btn.addEventListener('mouseleave', (e) => {
                const target = e.target as HTMLButtonElement
                if (!target.classList.contains('active')) {
                    target.style.background = 'rgba(255,255,255,0.1)'
                }
            })
        })
    }
    
    private setLod(level: LodLevel): void {
        this.currentLod = level
        
        // Update button states
        const buttons = this.container.querySelectorAll('.lod-btn')
        buttons.forEach(btn => {
            const btnElement = btn as HTMLButtonElement
            const btnLod = parseInt(btnElement.dataset.lod ?? '0')
            const isActive = btnLod === level
            btnElement.classList.toggle('active', isActive)
            btnElement.style.cssText = this.getButtonStyle(isActive)
        })
        
        // Call the callback
        if (this.onLodChange) {
            this.onLodChange(level)
        }
        
        // Emit event for other systems
        this.eventManager.emit(GameEventTypes.InstancedBatchComplete)
        
        console.debug(`🎨 LOD level set to ${level} (${['High', 'Mid', 'Low'][level]})`)
    }
    
    /**
     * Update the stats display
     */
    public updateStats(stats: { textureCount: number; instanceCount: number; totalMB: number }): void {
        const statsEl = this.container.querySelector('#lod-stats')
        if (statsEl) {
            statsEl.innerHTML = `
                Textures: ${stats.textureCount}<br>
                Instances: ${stats.instanceCount}<br>
                VRAM: ~${stats.totalMB.toFixed(1)}MB
            `
        }
    }
    
    public show(): void {
        this.container.style.display = 'block'
        this.isVisible = true
    }
    
    public hide(): void {
        this.container.style.display = 'none'
        this.isVisible = false
    }
    
    public toggle(): void {
        if (this.isVisible) {
            this.hide()
        } else {
            this.show()
        }
    }
    
    public getCurrentLod(): LodLevel {
        return this.currentLod
    }
    
    public dispose(): void {
        this.container.remove()
    }
}
