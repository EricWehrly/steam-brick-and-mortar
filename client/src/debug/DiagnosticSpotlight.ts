/**
 * Diagnostic Spotlight System
 * 
 * Provides debugging spotlights to visually highlight specific games in the scene.
 * Useful for debugging empty/black textures and other visual issues.
 * 
 * Usage from console:
 *   window.spotlightGame("UNLOVED")
 *   window.spotlightGame(["Psychonauts", "Half Life: Alyx"])
 *   window.spotlightGame(611500) // by appid
 *   window.clearSpotlights()
 */

import * as THREE from 'three'
import { GameFinder } from './GameFinder'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'

export interface SpotlightTarget {
    name?: string
    appid?: number | string
    position?: THREE.Vector3
    mesh?: THREE.Object3D
}

export class DiagnosticSpotlight {
    private gameFinder: GameFinder | null = null
    private spotlights: THREE.SpotLight[] = []
    private spotlightGroup: THREE.Group
    // Limit spotlight count to prevent performance degradation from excessive real-time shadow/light calculations
    // Each SpotLight adds computational cost to the render loop
    private maxSpotlights: number = 10

    constructor() {
        this.spotlightGroup = new THREE.Group()
        this.spotlightGroup.name = 'diagnostic-spotlights'
        
        try {
            this.gameFinder = new GameFinder()
            this.gameFinder['scene'].add(this.spotlightGroup)
        } catch (error) {
            console.error('Failed to initialize DiagnosticSpotlight:', error)
        }
    }

    public spotlight(targets: string | number | Array<string | number>): void {
        if (!this.gameFinder) {
            console.error('❌ [Spotlight] Scene or GameFinder not available')
            return
        }

        const gameObjects = this.findTargetsInScene(targets)
        
        if (gameObjects.length === 0) {
            this.clear();
        } else {
            this.updateSpotlights(gameObjects)
        }
        
    }

    private findTargetsInScene(targets: string | number | (string | number)[]) : SpotlightTarget[]{
        const targetArray = Array.isArray(targets) ? targets : [targets]
        
        const gameObjects: SpotlightTarget[] = []
        
        for (const target of targetArray) {
            const found = this.gameFinder.find(target)
            if (found) {
                gameObjects.push(found)
            }
        }
        return gameObjects
    }

    private updateSpotlights(targets: SpotlightTarget[]): void {
        const neededCount = Math.min(targets.length, this.maxSpotlights)
        
        this.removeExcessSpotlights(neededCount)
        
        this.createSpotlights(neededCount)
        
        // Position spotlights on targets
        for (let i = 0; i < neededCount; i++) {
            const spotlight = this.spotlights[i]
            const target = targets[i]
            
            this.aimSpotlightAtTarget(target, spotlight)

            console.debug(`🔦 [Spotlight ${i}] Positioned at (${spotlight.position.x.toFixed(2)}, ${spotlight.position.y.toFixed(2)}, ${spotlight.position.z.toFixed(2)}) → ${target.name || target.appid}`)
        }
    }

    private aimSpotlightAtTarget(target: SpotlightTarget, spotlight: THREE.SpotLight) {
        if (target.position) {
            // Position spotlight above target
            spotlight.position.set(
                target.position.x,
                target.position.y + 2, // 2m above
                target.position.z
            )

            // Aim at target
            spotlight.target.position.copy(target.position)

            spotlight.visible = true
            spotlight.target.visible = true
        }
    }

    private createSpotlights(neededCount: number) {
        while (this.spotlights.length < neededCount) {
            const spotlight = this.createSpotlight()
            this.spotlights.push(spotlight)
            this.spotlightGroup.add(spotlight)
            this.spotlightGroup.add(spotlight.target)
        }
    }

    private removeExcessSpotlights(neededCount: number) {
        while (this.spotlights.length > neededCount) {
            this.removeSpotlight()
        }
    }
    
    private removeSpotlight(): void {
        const spotlight = this.spotlights.pop()
        if (spotlight) {
            this.spotlightGroup.remove(spotlight)
            this.spotlightGroup.remove(spotlight.target)
            spotlight.dispose()
        }
    }

    private createSpotlight(): THREE.SpotLight {
        const spotlight = new THREE.SpotLight(
            0xffff00,      // Yellow color for visibility
            2.0,           // Intensity
            5,             // Distance
            Math.PI / 6,   // Angle (30 degrees)
            0.3,           // Penumbra
            1              // Decay
        )
        
        spotlight.castShadow = false // Don't interfere with scene lighting
        spotlight.name = 'diagnostic-spotlight'
        
        return spotlight
    }

    public clear(): void {
        console.debug(`🔦 [Spotlight] Clearing ${this.spotlights.length} spotlight(s)...`)
        
        while (this.spotlights.length > 0) {
            this.removeSpotlight()
        }
    }
}

// Initialize diagnostic spotlight after game start using a named handler
export function initializeDiagnosticSpotlightOnStart(_event?: CustomEvent): void {
    const spotlight = new DiagnosticSpotlight()

    // @ts-ignore - Intentionally adding to window for debugging
    window.spotlightGame = (target: string | number | Array<string | number>) => {
        spotlight.spotlight(target)
    }

    // @ts-ignore - Intentionally adding to window for debugging
    window.clearSpotlights = () => {
        spotlight.clear()
    }

    // TODO: find a namespace within window to aggregate app functions
    console.debug('🔦 [Spotlight] Diagnostic spotlight functions exposed to window:')
    console.debug('  window.spotlightGame("UNLOVED")        - Spotlight a game by name')
    console.debug('  window.spotlightGame(611500)           - Spotlight by appid')
    console.debug('  window.spotlightGame(["Game1", "Game2"]) - Spotlight multiple')
    console.debug('  window.clearSpotlights()               - Clear all spotlights')
}

// Register the named handler with the EventManager
EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeDiagnosticSpotlightOnStart)
