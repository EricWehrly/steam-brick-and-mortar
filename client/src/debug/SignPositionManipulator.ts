/**
 * Sign Position Manipulator - Debug tool for shelf-top time-bucket signs
 */

import { SceneSignManager } from '../scene/SceneSignManager'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { RecentlyPlayedCeilingSign } from '../scene/RecentlyPlayedCeilingSign'
import type { SteamGameData } from '../scene/game-box/types/GameData'
import '../styles/sign-manipulator-panel.css'

export class SignPositionManipulator {
    private container: HTMLElement | null = null
    private isVisible = false
    
    // Default values from SceneSignManager.placeTimeBucketSigns
    private settings = {
        SIGN_ANCHOR_Y_OFFSET: 2.0,
        SIGN_Y_CLEARANCE: 0.02,
        SIGN_FRONT_OFFSET: 0.28
    }

    constructor() {
        // TODO: dev mode consolidation — multiple debug activation patterns exist in codebase.
        // For now, always create the panel (debug-only build consideration for later).
        this.createPanel()
        this.setupKeyboardShortcut()
    }

    private createPanel(): void {
        this.container = document.createElement('div')
        this.container.id = 'sign-manipulator-panel'
        this.container.className = 'sign-manipulator-panel hidden'
        
        this.container.innerHTML = `
            <div class="sign-manip-header">
                <span>🪧 Sign Manipulator</span>
                <button class="sign-manip-close">✕</button>
            </div>
            <div class="sign-manip-body">
                <div class="sign-manip-control">
                    <label>Anchor Y Offset</label>
                    <input type="range" id="manip-anchor-y" min="0" max="4" step="0.01" value="${this.settings.SIGN_ANCHOR_Y_OFFSET}">
                    <span id="val-anchor-y">${this.settings.SIGN_ANCHOR_Y_OFFSET}</span>
                </div>
                <div class="sign-manip-control">
                    <label>Y Clearance</label>
                    <input type="range" id="manip-clearance-y" min="-0.5" max="0.5" step="0.01" value="${this.settings.SIGN_Y_CLEARANCE}">
                    <span id="val-clearance-y">${this.settings.SIGN_Y_CLEARANCE}</span>
                </div>
                <div class="sign-manip-control">
                    <label>Front Offset</label>
                    <input type="range" id="manip-front-offset" min="-1" max="1" step="0.01" value="${this.settings.SIGN_FRONT_OFFSET}">
                    <span id="val-front-offset">${this.settings.SIGN_FRONT_OFFSET}</span>
                </div>
                <div class="sign-manip-actions">
                    <button id="manip-copy" class="manip-btn">📋 Copy Sign Offsets</button>
                    <button id="manip-reset" class="manip-btn secondary">🔄 Reset</button>
                </div>
            </div>
        `
        
        document.body.appendChild(this.container)
        this.attachEvents()
    }

    private attachEvents(): void {
        if (!this.container) return

        const closeBtn = this.container.querySelector('.sign-manip-close')
        closeBtn?.addEventListener('click', () => this.toggle())

        const inputs = {
            'manip-anchor-y': 'SIGN_ANCHOR_Y_OFFSET',
            'manip-clearance-y': 'SIGN_Y_CLEARANCE',
            'manip-front-offset': 'SIGN_FRONT_OFFSET'
        }

        Object.entries(inputs).forEach(([id, key]) => {
            const input = document.getElementById(id) as HTMLInputElement
            const valDisplay = document.getElementById(`val-${id.replace('manip-', '')}`)
            
            input?.addEventListener('input', () => {
                const val = parseFloat(input.value)
                if (valDisplay) valDisplay.textContent = val.toFixed(2)
                ;(this.settings as any)[key] = val
                this.refreshSigns()
            })
        })

        document.getElementById('manip-copy')?.addEventListener('click', () => {
            const code = `const SIGN_ANCHOR_Y_OFFSET = ${this.settings.SIGN_ANCHOR_Y_OFFSET.toFixed(2)}\nconst SIGN_Y_CLEARANCE = ${this.settings.SIGN_Y_CLEARANCE.toFixed(2)}\nconst SIGN_FRONT_OFFSET = ${this.settings.SIGN_FRONT_OFFSET.toFixed(2)}`
            navigator.clipboard.writeText(code)
            console.log('📋 Copied sign offsets to clipboard:\n' + code)
            
            const btn = document.getElementById('manip-copy')
            if (btn) {
                const original = btn.textContent
                btn.textContent = '✅ Copied!'
                setTimeout(() => btn.textContent = original, 2000)
            }
        })

        document.getElementById('manip-reset')?.addEventListener('click', () => {
            this.settings = {
                SIGN_ANCHOR_Y_OFFSET: 2.0,
                SIGN_Y_CLEARANCE: 0.02,
                SIGN_FRONT_OFFSET: 0.28
            }
            this.updateInputs()
            this.refreshSigns()
        })
    }

    private updateInputs(): void {
        const mapping = {
            'manip-anchor-y': 'SIGN_ANCHOR_Y_OFFSET',
            'manip-clearance-y': 'SIGN_Y_CLEARANCE',
            'manip-front-offset': 'SIGN_FRONT_OFFSET'
        }

        Object.entries(mapping).forEach(([id, key]) => {
            const input = document.getElementById(id) as HTMLInputElement
            const valDisplay = document.getElementById(`val-${id.replace('manip-', '')}`)
            const val = (this.settings as any)[key]
            if (input) input.value = val.toString()
            if (valDisplay) valDisplay.textContent = val.toFixed(2)
        })
    }

    private refreshSigns(): void {
        // This is a bit of a hack since we're bypassing the normal flow,
        // but it's for debug so it's fine.
        
        // We need the data that GpuStorePropsRenderer uses
        // In a real app we'd emit an event, but here we'll try to reach into the manager
        const manager = SceneSignManager.instance
        const data = DataManager.getInstance()
        
        const games = data.get<SteamGameData[]>('steam.games') ?? []
        const shelfPositions = (manager as any)._lastShelfPositions
        const shelfRotationsY = (manager as any)._lastShelfRotationsY
        const ceilingSignPos = (manager as any)._lastCeilingSignPos
        
        if (shelfPositions && shelfRotationsY && ceilingSignPos) {
            // We need to inject our overrides into the manager or pass them in
            // For now, let's just call it with our local values if we can modify the manager
            (manager as any)._debugOverrides = this.settings
            manager.placeTimeBucketSigns(shelfPositions, shelfRotationsY, games, ceilingSignPos)
        }
    }

    private setupKeyboardShortcut(): void {
        window.addEventListener('keydown', (e) => {
            // 'm' toggles sign manipulator — unambiguous in-scene key, no modifier
            if (e.key === 'm' && !e.ctrlKey && !e.metaKey) {
                this.toggle()
            }
        })
    }

    public toggle(): void {
        this.isVisible = !this.isVisible
        this.container?.classList.toggle('hidden', !this.isVisible)
    }
}
