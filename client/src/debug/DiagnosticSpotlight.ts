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
import { LightRegistry } from '../lighting/LightRegistry'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { EventManager } from '../core/EventManager'
import { GameEventTypes } from '../types/InteractionEvents'
import vertexShader from './shaders/spotlight-beam.vert?raw'
import fragmentShader from './shaders/spotlight-beam.frag?raw'

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
    private animationFrameId: number | null = null
    private baseIntensities: Map<THREE.SpotLight, number> = new Map()
    private beamsBySpotlight: Map<THREE.SpotLight, THREE.Mesh> = new Map()
    private static sharedBeamGeometry: THREE.CylinderGeometry | null = null
    private static sharedBeamMaterial: THREE.ShaderMaterial | null = null

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

            const gameBottomY = target.position.y - 0.2 // Bottom of standard game box
            spotlight.target.position.set(
                target.position.x,
                gameBottomY,
                target.position.z
            )

            this.updateBeamHeight(spotlight)

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
            const beam = this.beamsBySpotlight.get(spotlight)
            if (beam) {
                this.spotlightGroup.remove(beam)
                this.beamsBySpotlight.delete(spotlight)
            }
            this.spotlightGroup.remove(spotlight)
            this.spotlightGroup.remove(spotlight.target)
            spotlight.dispose()
        }
    }

    private createSpotlight(): THREE.SpotLight {
        const spotlight = new THREE.SpotLight(
            0xfff8e7,      // color: soft warm white
            3.0,           // intensity: higher for visibility
            6,             // distance: 6m range
            Math.PI / 10,  // angle: ~18 degrees for focused beam
            0.5,           // penumbra: 0-1, higher = softer edges
            2              // decay: 2 = physically accurate falloff
        )
        
        spotlight.castShadow = false // Don't interfere with scene lighting
        spotlight.name = 'diagnostic-spotlight'
        
        // Create visible light column/beam
        this.createLightBeam(spotlight)
        
        return spotlight
    }

    private createLightBeam(spotlight: THREE.SpotLight): void {
        // TODO: Coordinate with RoomManager ceiling height instead of hardcoding
        const height = 3.5 // Standard room height (currently hardcoded, could be taller for outdoor scenes)
        const radiusTop = 0.08
        const radiusBottom = 0.12
        
        if (!DiagnosticSpotlight.sharedBeamGeometry) {
            DiagnosticSpotlight.sharedBeamGeometry = new THREE.CylinderGeometry(
                radiusTop,
                radiusBottom,
                height,
                24,   // radialSegments - higher = smoother cylinder
                1,    // heightSegments - 1 is sufficient for straight cylinder
                true  // openEnded - no caps for better performance
            )
        }
        
        if (!DiagnosticSpotlight.sharedBeamMaterial) {
            DiagnosticSpotlight.sharedBeamMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    color: { value: new THREE.Color(0xfff8e7) },
                    opacity: { value: 0.2 }, // Low opacity for subtle effect
                    gameBottomY: { value: 0.0 }, // Updated per spotlight - where to start fade
                    beamBottomY: { value: 0.0 }  // Floor level (0) - where fade ends
                },
                vertexShader,
                fragmentShader,
                transparent: true,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        }
        
        const beamMesh = new THREE.Mesh(
            DiagnosticSpotlight.sharedBeamGeometry,
            DiagnosticSpotlight.sharedBeamMaterial
        )
        beamMesh.name = 'spotlight-beam'
        beamMesh.position.set(0, 0, 0)
        
        this.spotlightGroup.add(beamMesh)
        this.beamsBySpotlight.set(spotlight, beamMesh)
    }

    private updateBeamHeight(spotlight: THREE.SpotLight): void {
        const beam = this.beamsBySpotlight.get(spotlight)
        if (!beam) return
        
        beam.position.copy(spotlight.position)
        beam.position.y = 1.75 // Mid-height (3.5m / 2)
        
        const material = beam.material as THREE.ShaderMaterial
        if (material?.uniforms) {
            material.uniforms.gameBottomY.value = spotlight.target.position.y
            material.uniforms.beamBottomY.value = 0.0
        }
    }

    public clear(): void {
        console.debug(`🔦 [Spotlight] Clearing ${this.spotlights.length} spotlight(s)...`)
        
        this.stopAnimation()
        
        while (this.spotlights.length > 0) {
            this.removeSpotlight()
        }
        
        this.baseIntensities.clear()
        this.beamsBySpotlight.clear()
        this.restoreStoreLights()
    }

    private getRectAreaLights(): THREE.RectAreaLight[] {
        return LightRegistry.getInstance().getLightsByType(THREE.RectAreaLight)
    }

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

    private restoreStoreLights(): void {
        if (!this.scene) return

        this.originalLightIntensities.forEach((originalIntensity, light) => {
            light.intensity = originalIntensity
        })

        console.debug(`🔦 [Spotlight] Restored ${this.originalLightIntensities.size} store lights to original intensity`)
        this.originalLightIntensities.clear()
    }

    private startAnimation(): void {
        if (this.animationFrameId !== null) return // Already running

        const animate = () => {
            this.updateSpotlightEffects()
            this.animationFrameId = requestAnimationFrame(animate)
        }
        
        animate()
    }

    private stopAnimation(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
    }

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

    // Pre-compile the beam ShaderMaterial so the GPU driver doesn't JIT-compile it
    // on the first frame the spotlight appears (which causes a visible lag spike).
    public precompileBeamShader(): void {
        const renderer = DataManager.getInstance().get<THREE.WebGLRenderer>(DataKey.Renderer)
        const scene = this.scene
        const camera = this.camera
        if (!renderer || !scene || !camera) return

        // Ensure the shared geometry and material exist before compiling
        if (!DiagnosticSpotlight.sharedBeamGeometry) {
            DiagnosticSpotlight.sharedBeamGeometry = new THREE.CylinderGeometry(0.08, 0.12, 3.5, 24, 1, true)
        }
        if (!DiagnosticSpotlight.sharedBeamMaterial) {
            DiagnosticSpotlight.sharedBeamMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    color: { value: new THREE.Color(0xfff8e7) },
                    opacity: { value: 0.2 },
                    gameBottomY: { value: 0.0 },
                    beamBottomY: { value: 0.0 }
                },
                vertexShader,
                fragmentShader,
                transparent: true,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        }

        const tempMesh = new THREE.Mesh(DiagnosticSpotlight.sharedBeamGeometry, DiagnosticSpotlight.sharedBeamMaterial)
        tempMesh.frustumCulled = false
        scene.add(tempMesh)
        renderer.compile(scene, camera)
        scene.remove(tempMesh)
    }
}

export function initializeDiagnosticSpotlightOnStart(): void {
    const spotlight = new DiagnosticSpotlight()
    spotlight.precompileBeamShader()

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
