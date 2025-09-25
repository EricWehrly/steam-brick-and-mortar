/**
 * Lighting Renderer - Comprehensive Lighting Setup
 * 
 * Handles all lighting systems that illuminate the environment:
 * - Ambient and directional lighting foundation
 * - Fluorescent store fixtures and commercial lighting
 * - Shadow configuration and quality settings
 * - Dynamic lighting levels and atmosphere control
 * 
 * This renderer should be loaded SECOND after environment to establish
 * proper illumination for props and interactive elements.
 */

import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BlockbusterColors } from '../utils/Colors'
import { PropRenderer } from './PropRenderer'
import { LightingDebugHelper } from './LightingDebugHelper'
import { AppSettings } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { LightingEventTypes, type LightingToggleEvent, type LightingDebugToggleEvent } from '../types/InteractionEvents'
import { LightFactory } from '../lighting/LightFactory'

// Lighting configuration constants
const LIGHT_NAMES = {
    AMBIENT: 'ambient-light',
    MAIN_DIRECTIONAL: 'main-directional-light', 
    FILL: 'fill-light',
    FLUORESCENT_FIXTURES: 'fluorescent-fixtures',
    DRAMATIC_SPOTLIGHT: 'dramatic-spotlight',
    POINT_LIGHT: 'point-light',
    ACCENT_LIGHT: 'accent-light'
} as const

const ROOM_DIMENSIONS = {
    WIDTH: 22,
    DEPTH: 16
} as const

const SHADOW_MAP_SIZES = {
    LOW: 512,
    MEDIUM: 1024, 
    HIGH: 2048,
    ULTRA: 4096
} as const

export interface LightingConfig {
    /** Ambient light intensity (0.0 - 1.0) */
    ambientIntensity?: number
    /** Main directional light intensity (0.0 - 1.0) */
    directionalIntensity?: number
    /** Fill light intensity (0.0 - 1.0) */
    fillLightIntensity?: number
    /** Ceiling height for fluorescent fixtures */
    ceilingHeight?: number
    /** Enable shadows (performance impact) */
    enableShadows?: boolean
    /** Shadow map resolution */
    shadowMapSize?: number
    /** Lighting quality level: 'simple' | 'enhanced' | 'advanced' | 'ouch-my-eyes' */
    quality?: 'simple' | 'enhanced' | 'advanced' | 'ouch-my-eyes'
}

export class LightingRenderer {
    private scene: THREE.Scene
    private renderer: THREE.WebGLRenderer
    private propRenderer: PropRenderer
    private lightingGroup: THREE.Group
    private debugHelper: LightingDebugHelper
    private config: LightingConfig = {}
    private eventManager: EventManager
    private lightFactory: LightFactory

    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
        this.scene = scene
        this.renderer = renderer
        this.propRenderer = new PropRenderer(scene)
        this.debugHelper = new LightingDebugHelper(scene)
        this.eventManager = EventManager.getInstance()
        
        // Initialize RectAreaLight uniforms (required for RectAreaLight to work)
        RectAreaLightUniformsLib.init()
        
        // Create group to hold all lighting objects
        this.lightingGroup = new THREE.Group()
        this.lightingGroup.name = 'lighting'
        this.scene.add(this.lightingGroup)
        this.lightFactory = new LightFactory(this.scene)
        
        // Register for lighting events
        this.setupEventListeners()
    }

    private setupEventListeners(): void {
        // Listen for lighting toggle events
        this.eventManager.registerEventHandler(LightingEventTypes.Toggle, (event: CustomEvent<LightingToggleEvent>) => {
            this.toggleLighting(event.detail.enabled)
        })
        
        // Listen for debug visualization toggle events
        this.eventManager.registerEventHandler(LightingEventTypes.DebugToggle, (event: CustomEvent<LightingDebugToggleEvent>) => {
            this.toggleDebugVisualization(event.detail.enabled)
        })
    }

    public async setupLighting(config: LightingConfig = {}): Promise<void> {
        this.config = { ...this.getDefaultConfig(), ...config }
        
        console.log(`💡 Setting up ${this.config.quality} lighting...`)
        
        try {
            this.configureShadows()
            await this.setupLightsByQuality()
            
            // Check current settings for debug helpers and lighting state
            const appSettings = AppSettings.getInstance()
            
            // Only show debug helpers if setting is enabled
            if (appSettings.getSetting('showLightingDebug')) {
                this.debugHelper.addHelpersForLightGroup(this.lightingGroup)
            }
            
            // Respect the lighting on/off setting
            const lightingEnabled = appSettings.getSetting('enableLighting')
            this.toggleLighting(lightingEnabled)
            
            console.log('✅ Lighting setup complete!')
        } catch (error) {
            console.error('❌ Failed to set up lighting:', error)
            // Fallback to simple lighting
            await this.setupSimpleLighting()
        }
    }

    private getDefaultConfig(): LightingConfig {
        return {
            ambientIntensity: 0.1,
            directionalIntensity: 0.3,
            fillLightIntensity: 0.2,
            ceilingHeight: 3.2,
            enableShadows: true,
            shadowMapSize: 1024,
            quality: 'enhanced'
        }
    }

    private configureShadows(): void {
        if (this.config.enableShadows) {
            this.renderer.shadowMap.enabled = true
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        } else {
            this.renderer.shadowMap.enabled = false
        }
    }

    private async setupLightsByQuality(): Promise<void> {
        switch (this.config.quality) {
            case 'simple':
                await this.setupSimpleLighting()
                break
            case 'enhanced':
                await this.setupEnhancedLighting()
                break
            case 'advanced':
                await this.setupAdvancedLighting()
                break
            case 'ouch-my-eyes':
                await this.setupOuchMyEyesLighting()
                break
            default:
                await this.setupEnhancedLighting()
        }
    }

    private async setupSimpleLighting(): Promise<void> {
        console.log('💡 Setting up SIMPLE lighting - basic illumination only')
        
        // Higher ambient light to compensate for fewer light sources
        this.lightFactory.createAmbientLight(0xffffff, 0.4, { 
            name: LIGHT_NAMES.AMBIENT,
            parent: this.lightingGroup
        })
        
        // Single directional light
        this.lightFactory.createDirectionalLight(0xffffff, 0.6, { 
            name: LIGHT_NAMES.MAIN_DIRECTIONAL,
            parent: this.lightingGroup,
            position: [0, 10, 0]
        })
        
        console.log(`✅ Simple lighting: ${this.lightingGroup.children.length} lights added`)
    }

    private async setupEnhancedLighting(): Promise<void> {
        console.log('💡 Setting up ENHANCED lighting - fluorescent fixtures + basic lights')
        
        this.lightFactory.createAmbientLight(BlockbusterColors.fluorescentCool, this.config.ambientIntensity, {
            name: LIGHT_NAMES.AMBIENT,
            parent: this.lightingGroup
        })
        
        // Position main directional light INSIDE the store space (below ceiling)
        const mainLight = this.lightFactory.createDirectionalLight(BlockbusterColors.fluorescentCool, this.config.directionalIntensity, {
            name: LIGHT_NAMES.MAIN_DIRECTIONAL,
            parent: this.lightingGroup,
            position: [0, this.config.ceilingHeight! - 0.5, 0]
        })
        if (this.config.enableShadows) {
            mainLight.castShadow = true
            mainLight.shadow.mapSize.width = this.config.shadowMapSize!
            mainLight.shadow.mapSize.height = this.config.shadowMapSize!
        }
        
        // Position fill light INSIDE the store space  
        this.lightFactory.createDirectionalLight(BlockbusterColors.fluorescentWarm, this.config.fillLightIntensity, {
            name: LIGHT_NAMES.FILL,
            parent: this.lightingGroup,
            position: [5, this.config.ceilingHeight! - 0.8, 5]
        })
        
        await this.setupFluorescentFixtures()
        
        console.log(`✅ Enhanced lighting: ${this.lightingGroup.children.length} lights/groups added`)
    }

    private async setupAdvancedLighting(): Promise<void> {
        console.log('💡 Setting up ADVANCED lighting - enhanced + point lights + better shadows')
        
        await this.setupEnhancedLighting()
        this.addPointLights()
        
        if (this.config.enableShadows) {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
            this.upgradeShadowQuality(SHADOW_MAP_SIZES.HIGH)
        }
        
        console.log(`✅ Advanced lighting: ${this.lightingGroup.children.length} lights/groups added`)
    }

    private async setupOuchMyEyesLighting(): Promise<void> {
        console.log('💡 Setting up OUCH-MY-EYES lighting - maximum visual fidelity + dramatic effects')
        
        await this.setupAdvancedLighting()
        this.addDramaticLighting()
        
        if (this.config.enableShadows) {
            this.renderer.shadowMap.type = THREE.VSMShadowMap
            this.upgradeShadowQuality(SHADOW_MAP_SIZES.ULTRA)
        }
        
        console.log(`✅ Ouch-my-eyes lighting: ${this.lightingGroup.children.length} lights/groups added`)
    }

    private upgradeShadowQuality(shadowMapSize: number): void {
        const lights = this.lightingGroup.children.filter(child => 
            child instanceof THREE.DirectionalLight || child instanceof THREE.SpotLight
        )
        lights.forEach(light => {
            if ((light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) && light.shadow) {
                light.shadow.mapSize.width = shadowMapSize
                light.shadow.mapSize.height = shadowMapSize
            }
        })
    }

    private async setupFluorescentFixtures(): Promise<void> {
        const fixtures = this.propRenderer.createCeilingLightFixtures(
            this.config.ceilingHeight!,
            ROOM_DIMENSIONS.WIDTH,
            ROOM_DIMENSIONS.DEPTH,
            {
                width: 4,
                height: 0.15,
                depth: 0.6,
                emissiveIntensity: 0.8,
                rows: 2,
                fixturesPerRow: 4
            }
        )
        
        fixtures.name = LIGHT_NAMES.FLUORESCENT_FIXTURES
        this.lightingGroup.add(fixtures)
    }

    private addPointLights(): void {
        const pointLightPositions = [
            { x: -8, y: 2.5, z: 4 },
            { x: 8, y: 2.5, z: 4 },
            { x: -8, y: 2.5, z: -4 },
            { x: 8, y: 2.5, z: -4 }
        ]
        
        pointLightPositions.forEach((pos, index) => {
            const pointLight = this.lightFactory.createPointLight(BlockbusterColors.fluorescentCool, 0.4, 10, undefined, {
                name: `${LIGHT_NAMES.POINT_LIGHT}-${index}`,
                parent: this.lightingGroup,
                position: [pos.x, pos.y, pos.z]
            })
            if (this.config.enableShadows) {
                pointLight.castShadow = true
                pointLight.shadow.mapSize.width = SHADOW_MAP_SIZES.LOW
                pointLight.shadow.mapSize.height = SHADOW_MAP_SIZES.LOW
            }
        })
    }

    private addDramaticLighting(): void {
        const spotLight1 = this.lightFactory.createSpotLight(0xffffff, 1.0, 15, Math.PI / 6, 0.2, 1, {
            name: LIGHT_NAMES.DRAMATIC_SPOTLIGHT,
            parent: this.lightingGroup,
            position: [0, 8, 0]
        })
        spotLight1.target.position.set(0, 0, 0)
        if (this.config.enableShadows) {
            spotLight1.castShadow = true
            spotLight1.shadow.mapSize.width = SHADOW_MAP_SIZES.MEDIUM
            spotLight1.shadow.mapSize.height = SHADOW_MAP_SIZES.MEDIUM
        }
        this.lightingGroup.add(spotLight1.target)
        
        const accentColors = [0xff4444, 0x44ff44, 0x4444ff]
        accentColors.forEach((color, index) => {
            this.lightFactory.createPointLight(color, 0.3, 8, undefined, {
                name: `${LIGHT_NAMES.ACCENT_LIGHT}-${index}`,
                parent: this.lightingGroup,
                position: [(index - 1) * 6, 1.5, -6]
            })
        })
    }

    public async updateLightingQuality(quality: LightingConfig['quality']): Promise<void> {
        this.debugHelper.clearHelpers()
        this.clearLights()
        this.config.quality = quality
        await this.setupLightsByQuality()
        
        // Only show debug helpers if setting is enabled
        const appSettings = AppSettings.getInstance()
        if (appSettings.getSetting('showLightingDebug')) {
            this.debugHelper.addHelpersForLightGroup(this.lightingGroup)
        }
    }

    public toggleLighting(enabled: boolean): void {
        console.log(`💡 ${enabled ? 'Enabling' : 'Disabling'} all lights`)
        
        this.lightingGroup.traverse((child) => {
            if (child instanceof THREE.Light) {
                child.visible = enabled
            }
        })
    }

    public toggleDebugVisualization(enabled: boolean): void {
        console.log(`🔍 ${enabled ? 'Showing' : 'Hiding'} light debug visualization`)
        
        if (enabled) {
            this.debugHelper.addHelpersForLightGroup(this.lightingGroup)
        } else {
            this.debugHelper.clearHelpers()
        }
    }

    public refreshShadows(): void {
        console.log('🔄 Refreshing shadows after props added...')
        
        // Update shadow cameras for all shadow-casting lights
        this.lightingGroup.traverse((child) => {
            if (child instanceof THREE.DirectionalLight && child.castShadow) {
                // Force shadow camera to update bounds
                child.shadow.camera.updateProjectionMatrix()
                child.shadow.map?.dispose()
                child.shadow.map = null
            }
            if (child instanceof THREE.SpotLight && child.castShadow) {
                child.shadow.camera.updateProjectionMatrix()
                child.shadow.map?.dispose()
                child.shadow.map = null
            }
            if (child instanceof THREE.PointLight && child.castShadow) {
                child.shadow.camera.updateProjectionMatrix()
                child.shadow.map?.dispose()
                child.shadow.map = null
            }
        })
        
        // Force renderer to regenerate shadow maps
        this.renderer.shadowMap.needsUpdate = true
        console.log('✅ Shadow refresh completed')
    }

    public updateIntensities(intensities: {
        ambient?: number
        directional?: number
        fill?: number
    }): void {
        const ambientLight = this.lightingGroup.getObjectByName(LIGHT_NAMES.AMBIENT) as THREE.AmbientLight
        if (ambientLight && intensities.ambient !== undefined) {
            ambientLight.intensity = intensities.ambient
        }
        
        const directionalLight = this.lightingGroup.getObjectByName(LIGHT_NAMES.MAIN_DIRECTIONAL) as THREE.DirectionalLight
        if (directionalLight && intensities.directional !== undefined) {
            directionalLight.intensity = intensities.directional
        }
        
        const fillLight = this.lightingGroup.getObjectByName(LIGHT_NAMES.FILL) as THREE.DirectionalLight
        if (fillLight && intensities.fill !== undefined) {
            fillLight.intensity = intensities.fill
        }
    }

    public getLightingStats(): {
        lightCount: number
        shadowsEnabled: boolean
        quality: string
        ambientIntensity: number
        directionalIntensity: number
        lightTypes: string[]
    } {
        const ambientLight = this.lightingGroup.getObjectByName(LIGHT_NAMES.AMBIENT) as THREE.AmbientLight
        const directionalLight = this.lightingGroup.getObjectByName(LIGHT_NAMES.MAIN_DIRECTIONAL) as THREE.DirectionalLight
        
        // Get all light types for debugging
        const lightTypes: string[] = []
        this.lightingGroup.traverse((child) => {
            if (child instanceof THREE.Light) {
                lightTypes.push(`${child.constructor.name}(${child.name || 'unnamed'})`)
            }
        })
        
        return {
            lightCount: this.lightingGroup.children.length,
            shadowsEnabled: this.renderer.shadowMap.enabled,
            quality: this.config.quality ?? 'enhanced',
            ambientIntensity: ambientLight?.intensity ?? 0,
            directionalIntensity: directionalLight?.intensity ?? 0,
            lightTypes
        }
    }

    public clearLights(): void {
        // Remove all children from lighting group
        while (this.lightingGroup.children.length > 0) {
            const child = this.lightingGroup.children[0]
            this.lightingGroup.remove(child)
            
            // Dispose any resources if needed
            if (child instanceof THREE.Light && child.shadow) {
                child.shadow.dispose()
            }
        }
    }

    public dispose(): void {
        this.clearLights()
        this.debugHelper.dispose()
        this.propRenderer.dispose()
        this.scene.remove(this.lightingGroup)
    }
}