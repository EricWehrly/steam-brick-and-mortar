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
import { AppSettings, LIGHTING_QUALITY, type LightingQuality } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { LightingEventTypes, type LightingToggleEvent, type LightingDebugToggleEvent, type LightingQualityChangedEvent } from '../types/InteractionEvents'
import { LightFactory } from '../lighting/LightFactory'

// Lighting configuration constants
const LIGHT_NAMES = {
    AMBIENT: 'ambient-light',
    MAIN_DIRECTIONAL: 'main-directional-light', 
    FILL: 'window-fill-light',
    RIM_LIGHT: 'rim-light',
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
    /** Shadow quality (0=off, 1=low, 2=medium, 3=high, 4=ultra) */
    shadowQuality?: number
    /** Shadow map resolution (derived from shadowQuality) */
    shadowMapSize?: number
    /** Lighting quality level */
    quality?: LightingQuality
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
        
        // Listen for lighting quality change events
        this.eventManager.registerEventHandler(LightingEventTypes.QualityChanged, (event: CustomEvent<LightingQualityChangedEvent>) => {
            this.updateLightingQuality(event.detail.quality)
        })
    }

    public async setupLighting(config: LightingConfig = {}): Promise<void> {
        this.config = { ...this.getCurrentConfig(), ...config }
        
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

    private getCurrentConfig(): LightingConfig {
        const appSettings = AppSettings.getInstance()
        const shadowQuality = appSettings.getSetting('shadowQuality')
        return {
            ambientIntensity: 0.02, // Much lower, disabled by default
            directionalIntensity: 0.15, // Reduced by 50% 
            fillLightIntensity: 0.12, // Reduced by 40%
            ceilingHeight: appSettings.getSetting('ceilingHeight'),
            shadowQuality: shadowQuality,
            shadowMapSize: this.getShadowMapSizeForQuality(shadowQuality),
            quality: appSettings.getSetting('lightingQuality')
        }
    }

    private configureShadows(): void {
        const shadowQuality = this.config.shadowQuality || 0
        
        if (shadowQuality === 0) {
            this.renderer.shadowMap.enabled = false
            return
        }
        
        this.renderer.shadowMap.enabled = true
        
        // Set shadow map type based on quality
        if (shadowQuality >= 4) {
            this.renderer.shadowMap.type = THREE.VSMShadowMap // Ultra quality
        } else {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap // Standard quality
        }
    }

    private getShadowMapSizeForQuality(shadowQuality: number): number {
        switch (shadowQuality) {
            case 0: return 0 // Shadows disabled
            case 1: return SHADOW_MAP_SIZES.LOW    // 512
            case 2: return SHADOW_MAP_SIZES.MEDIUM // 1024
            case 3: return SHADOW_MAP_SIZES.HIGH   // 2048
            case 4: return SHADOW_MAP_SIZES.ULTRA  // 4096
            default: return SHADOW_MAP_SIZES.MEDIUM
        }
    }

    private async setupLightsByQuality(): Promise<void> {
        switch (this.config.quality) {
            case LIGHTING_QUALITY.SIMPLE:
                await this.setupSimpleLighting()
                break
            case LIGHTING_QUALITY.ENHANCED:
                await this.setupEnhancedLighting()
                break
            case LIGHTING_QUALITY.ADVANCED:
                await this.setupAdvancedLighting()
                break
            case LIGHTING_QUALITY.OUCH_MY_EYES:
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
        console.log('💡 Setting up ENHANCED lighting - optimized retail atmosphere')
        
        // Ambient light: disabled by default, toggleable in panel
        const ambientLight = this.lightFactory.createAmbientLight(0xFFF8E7, this.config.ambientIntensity, {
            name: LIGHT_NAMES.AMBIENT,
            parent: this.lightingGroup
        })
        // Start disabled - user can toggle on via lighting panel
        ambientLight.visible = false
        
        // Window fill light: simulates natural light from storefront
        // Positioned from front-left at angle to create depth
        this.lightFactory.createDirectionalLight(0xFFF5E6, this.config.fillLightIntensity, {
            name: LIGHT_NAMES.FILL,
            parent: this.lightingGroup,
            position: [-8, this.config.ceilingHeight! - 1, 8]
        })
        
        // Subtle rim light: defines edges, prevents flat lighting
        // Cool temperature, very low intensity, non-shadow casting
        const rimLight = this.lightFactory.createDirectionalLight(BlockbusterColors.fluorescentCool, 0.08, {
            name: 'rim-light',
            parent: this.lightingGroup,
            position: [3, this.config.ceilingHeight! + 1, -5]
        })
        // Rim light doesn't cast shadows for performance
        rimLight.castShadow = false
        
        // Primary illumination: RectAreaLights from ceiling fixtures
        await this.setupFluorescentFixtures()
        
        console.log(`✅ Enhanced lighting: ${this.lightingGroup.children.length} lights/groups added (ambient disabled by default)`)
    }

    private async setupAdvancedLighting(): Promise<void> {
        console.log('💡 Setting up ADVANCED lighting - enhanced + point lights + better shadows')
        
        await this.setupEnhancedLighting()
        this.addPointLights()
        
        console.log(`✅ Advanced lighting: ${this.lightingGroup.children.length} lights/groups added`)
    }

    private async setupOuchMyEyesLighting(): Promise<void> {
        console.log('💡 Setting up OUCH-MY-EYES lighting - maximum visual fidelity + dramatic effects')
        
        await this.setupAdvancedLighting()
        this.addDramaticLighting()
        
        console.log(`✅ Ouch-my-eyes lighting: ${this.lightingGroup.children.length} lights/groups added`)
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
                emissiveIntensity: 0.6, // Reduced from 0.8 for comfort
                rows: 2,
                fixturesPerRow: 4
            }
        )
        
        fixtures.name = LIGHT_NAMES.FLUORESCENT_FIXTURES
        this.lightingGroup.add(fixtures)
    }

    private addPointLights(): void {
        // Strategic accent lights for special displays and atmosphere
        // Positioned to highlight key areas without overwhelming
        const pointLightPositions = [
            { x: -6, y: 1.8, z: 6, color: 0xFFE4B5, intensity: 0.2 }, // Warm accent - front left
            { x: 6, y: 1.8, z: 6, color: 0xFFE4B5, intensity: 0.2 },  // Warm accent - front right
            { x: 0, y: 2.2, z: -7, color: BlockbusterColors.fluorescentCool, intensity: 0.15 } // Cool back wall accent
        ]
        
        pointLightPositions.forEach((light, index) => {
            const pointLight = this.lightFactory.createPointLight(light.color, light.intensity, 8, 2, {
                name: `${LIGHT_NAMES.ACCENT_LIGHT}-${index}`,
                parent: this.lightingGroup,
                position: [light.x, light.y, light.z]
            })
            // Accent lights don't cast shadows for performance
            pointLight.castShadow = false
        })
        
        console.log('💡 Added strategic accent lighting for atmosphere')
    }

    private addDramaticLighting(): void {
        const spotLight1 = this.lightFactory.createSpotLight(0xffffff, 1.0, 15, Math.PI / 6, 0.2, 1, {
            name: LIGHT_NAMES.DRAMATIC_SPOTLIGHT,
            parent: this.lightingGroup,
            position: [0, 8, 0]
        })
        spotLight1.target.position.set(0, 0, 0)
        if ((this.config.shadowQuality || 0) > 0) {
            spotLight1.castShadow = true
            const shadowMapSize = this.getShadowMapSizeForQuality(this.config.shadowQuality || 0)
            spotLight1.shadow.mapSize.width = shadowMapSize
            spotLight1.shadow.mapSize.height = shadowMapSize
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

    public async updateLightingQuality(quality: LightingQuality): Promise<void> {
        this.debugHelper.clearHelpers()
        this.clearLights()
        
        // Refresh full config from AppSettings to get updated shadows/ceiling height too
        this.config = { ...this.getCurrentConfig(), quality }
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



    /**
     * Toggle specific light by name on/off
     */
    public toggleLightByName(lightName: string, enabled: boolean): void {
        const light = this.lightingGroup.getObjectByName(lightName) as THREE.Light
        if (light) {
            light.visible = enabled
            console.log(`💡 ${lightName} light ${enabled ? 'enabled' : 'disabled'}`)
        } else {
            console.warn(`⚠️ Light '${lightName}' not found for toggle`)
        }
    }

    /**
     * Toggle ambient light on/off (convenience method)
     */
    public toggleAmbientLight(enabled: boolean): void {
        this.toggleLightByName(LIGHT_NAMES.AMBIENT, enabled)
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
            quality: this.config.quality ?? LIGHTING_QUALITY.ENHANCED,
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