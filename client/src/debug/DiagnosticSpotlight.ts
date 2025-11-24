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
    private originalLightIntensities: Map<THREE.Light, number> = new Map()
    private scene: THREE.Scene | null = null
    private readonly DIM_FACTOR = 0.2 // Dim to 20% of original intensity
    private camera: THREE.Camera | null = null
    private cachedRectAreaLights: THREE.RectAreaLight[] | null = null
    private animationFrameId: number | null = null
    private baseIntensities: Map<THREE.SpotLight, number> = new Map()
    // Shared geometry and material for all light beams to reduce GPU memory usage
    private static sharedBeamGeometry: THREE.CylinderGeometry | null = null
    private static sharedBeamMaterial: THREE.MeshBasicMaterial | null = null

    constructor() {
        this.spotlightGroup = new THREE.Group()
        this.spotlightGroup.name = 'diagnostic-spotlights'
        
        try {
            this.gameFinder = new GameFinder()
            this.scene = this.gameFinder['scene']
            this.scene.add(this.spotlightGroup)
            
            // Get camera reference for distance calculations
            this.camera = this.scene.children.find(child => child instanceof THREE.Camera) as THREE.Camera || null
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
        
        // Dim store/prop lights when spotlights are active
        this.dimStoreLights()
        
        // Position spotlights on targets
        for (let i = 0; i < neededCount; i++) {
            const spotlight = this.spotlights[i]
            const target = targets[i]
            
            this.aimSpotlightAtTarget(target, spotlight)
            
            // Store base intensity for animation
            this.baseIntensities.set(spotlight, spotlight.intensity)

            console.debug(`🔦 [Spotlight ${i}] Positioned at (${spotlight.position.x.toFixed(2)}, ${spotlight.position.y.toFixed(2)}, ${spotlight.position.z.toFixed(2)}) → ${target.name || target.appid}`)
        }
        
        // Start animation loop
        this.startAnimation()
    }

    private aimSpotlightAtTarget(target: SpotlightTarget, spotlight: THREE.SpotLight) {
        if (target.position) {
            // Position spotlight above target
            const spotlightHeight = target.position.y + 2 // 2m above game
            spotlight.position.set(
                target.position.x,
                spotlightHeight,
                target.position.z
            )

            // Aim at bottom of game for full coverage
            const gameBottomY = target.position.y - 0.2 // Bottom of standard game box
            spotlight.target.position.set(
                target.position.x,
                gameBottomY,
                target.position.z
            )

            // Update beam height to extend from spotlight to game bottom
            const beamHeight = spotlightHeight - gameBottomY
            this.updateBeamHeight(spotlight, beamHeight)

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
        // Enchanting spotlight: white core with warm golden edges
        const spotlight = new THREE.SpotLight(
            0xfff8e7,      // Soft warm white (not harsh yellow)
            3.0,           // Higher intensity for better visibility
            6,             // Distance
            Math.PI / 10,  // Narrower angle (18 degrees) - more focused beam
            0.5,           // Higher penumbra for softer, feathered edges
            2              // More decay for dramatic falloff
        )
        
        spotlight.castShadow = false // Don't interfere with scene lighting
        spotlight.name = 'diagnostic-spotlight'
        
        // Create visible light column/beam
        this.createLightBeam(spotlight)
        
        return spotlight
    }

    /**
     * Create a visible light beam column for the spotlight
     * Semi-transparent cylinder that makes the light visible in 3D space
     */
    private createLightBeam(spotlight: THREE.SpotLight): void {
        // Calculate beam geometry based on spotlight angle and distance
        const height = 2.0 // Height from spotlight to target (matches spotlight positioning)
        const angle = spotlight.angle
        const radiusTop = 0.05 // Very narrow at top (near light source)
        const radiusBottom = height * Math.tan(angle) // Wider at bottom based on cone angle
        
        // Create shared geometry once for all light beams to prevent OOM with multiple spotlights
        if (!DiagnosticSpotlight.sharedBeamGeometry) {
            DiagnosticSpotlight.sharedBeamGeometry = new THREE.CylinderGeometry(
                radiusTop,
                radiusBottom,
                height,
                16, // radial segments
                1,  // height segments
                true // open ended
            )
        }
        
        // Create shared material once for all light beams
        if (!DiagnosticSpotlight.sharedBeamMaterial) {
            DiagnosticSpotlight.sharedBeamMaterial = new THREE.MeshBasicMaterial({
                color: 0xfff8e7, // Match spotlight color
                transparent: true,
                opacity: 0.15, // Very subtle - just enough to see the column
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending, // Makes it glow/accumulate with other lights
                depthWrite: false // Don't interfere with depth sorting
            })
        }
        
        const beamMesh = new THREE.Mesh(
            DiagnosticSpotlight.sharedBeamGeometry,
            DiagnosticSpotlight.sharedBeamMaterial
        )
        beamMesh.name = 'spotlight-beam'
        
        // Position beam to extend downward from spotlight
        beamMesh.position.set(0, -height / 2, 0)
        beamMesh.rotation.x = 0 // Starts vertical, will be aimed with spotlight
        
        // Attach beam to spotlight so it moves/rotates with it
        spotlight.add(beamMesh)
    }

    /**
     * Update beam height to match distance from spotlight to game bottom
     */
    private updateBeamHeight(spotlight: THREE.SpotLight, newHeight: number): void {
        const beam = spotlight.children.find(child => child.name === 'spotlight-beam') as THREE.Mesh
        if (beam?.geometry) {
            // Reposition beam center
            beam.position.y = -newHeight / 2
            
            // Scale geometry to new height (geometry is created at fixed height)
            const originalHeight = 2.0
            beam.scale.y = newHeight / originalHeight
        }
    }

    public clear(): void {
        console.debug(`🔦 [Spotlight] Clearing ${this.spotlights.length} spotlight(s)...`)
        
        // Stop animation
        this.stopAnimation()
        
        while (this.spotlights.length > 0) {
            this.removeSpotlight()
        }
        
        // Clear base intensities
        this.baseIntensities.clear()
        
        // Restore original light intensities
        this.restoreStoreLights()
    }

    /**
     * Collect RectAreaLights from scene (cached after first call)
     * Cache is invalidated when lights are added/removed from scene
     */
    private getRectAreaLights(): THREE.RectAreaLight[] {
        if (this.cachedRectAreaLights) {
            return this.cachedRectAreaLights
        }

        if (!this.scene) return []

        const lights: THREE.RectAreaLight[] = []
        this.scene.traverse((object) => {
            if (object instanceof THREE.RectAreaLight) {
                lights.push(object)
            }
        })

        this.cachedRectAreaLights = lights
        console.debug(`🔦 [Spotlight] Cached ${lights.length} RectAreaLights (avoids scene traversal on every toggle)`)
        return lights
    }

    /**
     * Invalidate the RectAreaLight cache (call this if lights are added/removed from scene)
     */
    public invalidateLightCache(): void {
        this.cachedRectAreaLights = null
        console.debug('🔦 [Spotlight] Light cache invalidated')
    }

    /**
     * Dim store/prop lights (RectAreaLights) to make spotlights more visible
     * Leaves ambient and directional lights at full intensity
     */
    private dimStoreLights(): void {
        const lights = this.getRectAreaLights()

        for (const light of lights) {
            // Store original intensity if not already stored
            if (!this.originalLightIntensities.has(light)) {
                this.originalLightIntensities.set(light, light.intensity)
            }
            // Dim to 20% of original
            const originalIntensity = this.originalLightIntensities.get(light)
            if (originalIntensity !== undefined) {
                light.intensity = originalIntensity * this.DIM_FACTOR
            }
        }

        console.debug(`🔦 [Spotlight] Dimmed ${lights.length} store lights to ${this.DIM_FACTOR * 100}%`)
    }

    /**
     * Restore store/prop lights to original intensity
     */
    private restoreStoreLights(): void {
        if (!this.scene) return

        this.originalLightIntensities.forEach((originalIntensity, light) => {
            light.intensity = originalIntensity
        })

        console.debug(`🔦 [Spotlight] Restored ${this.originalLightIntensities.size} store lights to original intensity`)
        this.originalLightIntensities.clear()
    }

    /**
     * Start the animation loop for distance-based intensity and pulsing
     */
    private startAnimation(): void {
        if (this.animationFrameId !== null) return // Already running

        const animate = () => {
            this.updateSpotlightEffects()
            this.animationFrameId = requestAnimationFrame(animate)
        }
        
        animate()
    }

    /**
     * Stop the animation loop
     */
    private stopAnimation(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
    }

    /**
     * Update spotlight intensity based on distance and add gentle pulsing
     */
    private updateSpotlightEffects(): void {
        if (!this.camera || this.spotlights.length === 0) return

        const time = Date.now() * 0.001 // Convert to seconds

        for (const spotlight of this.spotlights) {
            const baseIntensity = this.baseIntensities.get(spotlight)
            if (baseIntensity === undefined) continue

            // Calculate distance from camera to spotlight
            const distance = this.camera.position.distanceTo(spotlight.position)
            
            // Distance-based intensity scaling
            // Close (0-5m): 2.0x base, Far (15m+): 5.0x base
            const minDistance = 3
            const maxDistance = 15
            const minIntensityMultiplier = 2.0
            const maxIntensityMultiplier = 5.0
            
            const normalizedDistance = Math.max(0, Math.min(1, (distance - minDistance) / (maxDistance - minDistance)))
            const intensityMultiplier = minIntensityMultiplier + (maxIntensityMultiplier - minIntensityMultiplier) * normalizedDistance
            
            // Pulsing effect - subtle and slow
            // Close: slower pulse (2s period, 8% variation)
            // Far: slightly faster pulse (1.5s period, 12% variation)
            const pulsePeriod = 2.0 - (0.5 * normalizedDistance) // 2.0s close, 1.5s far
            const pulseAmplitude = 0.08 + (0.04 * normalizedDistance) // 8% close, 12% far
            const pulseValue = 1 + pulseAmplitude * Math.sin(time * Math.PI * 2 / pulsePeriod)
            
            // Apply combined effect
            spotlight.intensity = baseIntensity * intensityMultiplier * pulseValue
        }
    }

    /**
     * Dispose of shared resources. Call when DiagnosticSpotlight is no longer needed.
     * This is a static method because resources are shared across all instances.
     */
    public static disposeSharedResources(): void {
        if (DiagnosticSpotlight.sharedBeamGeometry) {
            DiagnosticSpotlight.sharedBeamGeometry.dispose()
            DiagnosticSpotlight.sharedBeamGeometry = null
        }
        
        if (DiagnosticSpotlight.sharedBeamMaterial) {
            DiagnosticSpotlight.sharedBeamMaterial.dispose()
            DiagnosticSpotlight.sharedBeamMaterial = null
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
