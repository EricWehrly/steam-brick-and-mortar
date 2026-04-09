/**
 * TD: raf-loop-migration
 * Game Spotlight — click-to-highlight system for games in the scene.
 * Also exposed to the browser console for manual debugging:
 *   window.spotlightGame("UNLOVED")
 *   window.spotlightGame(["Psychonauts", "Half Life: Alyx"])
 *   window.spotlightGame(611500) // by appid
 *   window.clearSpotlights()
 */

import * as THREE from 'three'
import { GameFinder } from './GameFinder'
import { LightRegistry } from '../lighting/LightRegistry'
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

export class GameSpotlight {
    private static instance: GameSpotlight | null = null

    static getInstance(): GameSpotlight | null {
        return GameSpotlight.instance
    }

    private spotlights: THREE.SpotLight[] = []
    // Pre-created pool: all spots are in the scene at startup with intensity=0 so
    // materials compile with the full light count during the startup stall, not on
    // first click. visible=true is intentional — invisible lights are excluded from
    // Three.js's light hash and won't trigger pre-compilation.
    private spotlightPool: THREE.SpotLight[] = []
    private spotlightGroup: THREE.Group
    private maxSpotlights: number = 1
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
        
        GameSpotlight.instance = this

        try {
            this.scene = GameFinder.getScene()
            this.scene.add(this.spotlightGroup)

            // Pre-create the full pool so shader compilation happens at startup.
            // All pool spotlights are in-scene with intensity=0 — they count toward the
            // light hash (forcing MeshStandardMaterial recompile now) but emit nothing.
            for (let i = 0; i < this.maxSpotlights; i++) {
                const spotlight = this.createSpotlight()
                spotlight.intensity = 0
                this.spotlightGroup.add(spotlight)
                this.spotlightGroup.add(spotlight.target)
                const beam = this.beamsBySpotlight.get(spotlight)
                if (beam) beam.visible = false
                this.spotlightPool.push(spotlight)
            }

            // Get camera reference for distance calculations
            this.camera = this.scene.children.find(child => child instanceof THREE.Camera) as THREE.Camera || null
        } catch (error) {
            console.error('Failed to initialize GameSpotlight:', error)
        }
    }

    public spotlight(targets: string | number | Array<string | number>): void {
        if (!this.scene) {
            console.error('❌ [Spotlight] Scene not available')
            return
        }

        const gameObjects = this.findTargetsInScene(targets)

        if (gameObjects.length === 0) {
            this.clear()
        } else {
            this.updateSpotlights(gameObjects)
        }
    }

    private findTargetsInScene(targets: string | number | (string | number)[]) : SpotlightTarget[]{
        const targetArray = Array.isArray(targets) ? targets : [targets]
        
        const gameObjects: SpotlightTarget[] = []
        
        for (const target of targetArray) {
            const found = GameFinder.find(target)
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

            // visible stays true — pool spotlights are always visible=true,
            // we control activation via intensity instead
        }
    }

    private createSpotlights(neededCount: number) {
        while (this.spotlights.length < neededCount) {
            // Activate from pool (already in scene) rather than constructing a new light,
            // so no shader recompilation occurs here.
            const spotlight = this.spotlightPool.pop() ?? this.createSpotlight()
            spotlight.intensity = 3.0
            const beam = this.beamsBySpotlight.get(spotlight)
            if (beam) beam.visible = true
            if (!this.spotlightGroup.children.includes(spotlight)) {
                this.spotlightGroup.add(spotlight)
                this.spotlightGroup.add(spotlight.target)
            }
            this.spotlights.push(spotlight)
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
            spotlight.intensity = 0
            const beam = this.beamsBySpotlight.get(spotlight)
            if (beam) beam.visible = false
            this.spotlightPool.push(spotlight)
            // Stays in scene so the light-count hash remains stable
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
        this.createLightBeam(spotlight)
        return spotlight
    }

    private createLightBeam(spotlight: THREE.SpotLight): void {
        // TODO: Coordinate with RoomManager ceiling height instead of hardcoding
        const height = 3.5 // Standard room height (currently hardcoded, could be taller for outdoor scenes)
        const radiusTop = 0.08
        const radiusBottom = 0.12
        
        if (!GameSpotlight.sharedBeamGeometry) {
            GameSpotlight.sharedBeamGeometry = new THREE.CylinderGeometry(
                radiusTop,
                radiusBottom,
                height,
                24,   // radialSegments - higher = smoother cylinder
                1,    // heightSegments - 1 is sufficient for straight cylinder
                true  // openEnded - no caps for better performance
            )
        }
        
        if (!GameSpotlight.sharedBeamMaterial) {
            GameSpotlight.sharedBeamMaterial = new THREE.ShaderMaterial({
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
            GameSpotlight.sharedBeamGeometry,
            GameSpotlight.sharedBeamMaterial
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
        // beamsBySpotlight intentionally NOT cleared — pooled spotlights still own their beams
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
        if (GameSpotlight.sharedBeamGeometry) {
            GameSpotlight.sharedBeamGeometry.dispose()
            GameSpotlight.sharedBeamGeometry = null
        }
        
        if (GameSpotlight.sharedBeamMaterial) {
            GameSpotlight.sharedBeamMaterial.dispose()
            GameSpotlight.sharedBeamMaterial = null
        }
    }

}

export function initializeGameSpotlightOnStart(): void {
    // TODO: move construction to before buildScene() in SteamBrickAndMortarApp so that
    // pool SpotLights exist before room MeshStandardMaterials first render. That way
    // materials compile once with the full light count instead of recompiling at startup.
    const instance = GameSpotlight.getInstance() ?? new GameSpotlight()

    // @ts-ignore - Intentionally adding to window for debugging
    window.spotlightGame = (target: string | number | Array<string | number>) => {
        instance.spotlight(target)
    }

    // @ts-ignore - Intentionally adding to window for debugging
    window.clearSpotlights = () => {
        instance.clear()
    }

    console.debug('🔦 [GameSpotlight] Console functions: spotlightGame(), clearSpotlights()')
}

// Register the named handler with the EventManager
EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeGameSpotlightOnStart)
