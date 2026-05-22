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
import { AppSettings, LIGHTING_QUALITY, Setting, type LightingQuality, type SettingChangedEvent } from '../core/AppSettings'
import { EventManager, EventSource } from '../core/EventManager'
import { LightingEventTypes, type LightingToggleEvent, type LightingDebugToggleEvent, type LightingQualityChangedEvent } from '../types/LightingEvents'
import { RoomEventTypes, type RoomResizedEvent, AppSettingsEventTypes } from '../types/InteractionEvents'
import { StorePropsEventTypes } from './props/PropsEvents'
import { LightFactory } from '../lighting/LightFactory'
import { LightRegistry } from '../lighting/LightRegistry'
import { applyRendererShadowPolicy, applyLightShadowPolicy, applyShadowContactTuning, configureDirectionalShadow, configureDirectionalShadowForShelfContact, refitDirectionalShadowCameras } from '../lighting/ShadowPolicy'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor } from '../utils/PerformanceMonitor'
import { GameSpotlight } from '../debug/GameSpotlight'

// Lighting configuration constants
const LIGHT_NAMES = {
    AMBIENT: 'ambient-light',
    MAIN_DIRECTIONAL: 'main-directional-light', 
    FILL: 'window-fill-light',
    RIM_LIGHT: 'rim-light',
    EXTERIOR_AMBIENT: 'exterior-ambient-light',
    ENTRANCE_SPOTLIGHT: 'entrance-spotlight',
    DRAMATIC_SPOTLIGHT: 'dramatic-spotlight',
    POINT_LIGHT: 'point-light',
    ACCENT_LIGHT: 'accent-light'
} as const

// Room dimensions - will be updated dynamically via room events
const CURRENT_ROOM_DIMENSIONS = {
    WIDTH: 22,
    DEPTH: 16
}

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
    /** Global renderer shadow map toggle */
    shadowMapEnabled?: boolean
    /** Lighting quality level */
    quality?: LightingQuality
}

export class LightingRenderer {
    private scene: THREE.Scene
    private renderer: THREE.WebGLRenderer
    private propRenderer: PropRenderer | null = null
    private lightingGroup: THREE.Group
    private debugHelper: LightingDebugHelper
    private registry: LightRegistry
    private config: LightingConfig = {}
    private eventManager: EventManager
    private lightFactory: LightFactory
    private currentShelfLayout?: { rows: number; shelvesPerRow?: number }
    private currentFixtures: THREE.Group | null = null
    private lightingUpgradeStarted = false
    public static logger = Logger.createLogFunctions(LightingRenderer.name)

    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
        this.scene = scene
        this.renderer = renderer
        // PropRenderer creation deferred to first use
        this.registry = LightRegistry.getInstance()
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

        this.eventManager.registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            this.onAppSettingsChanged.bind(this)
        )

        // Listen for room resizing events to update lighting, including initial room build.
        this.eventManager.registerEventHandler(RoomEventTypes.Resized, (event: CustomEvent<RoomResizedEvent>) => {
            this.updateRoomDimensions(event.detail.dimensions, event.detail.shelfLayout, event.detail.centerOffset) 
        })

        // Observe store-props lifecycle to drive lighting phases.
        // Use plain registerEventHandler (not override) so these fire alongside
        // StorePropsCoordinator which holds the override slot.
        // Lighting is a side-effect observer of the scene lifecycle, not the owner.
        this.eventManager.registerEventHandler(
            StorePropsEventTypes.SetupRequest,
            this.setupInitialLighting.bind(this)
        )

        this.eventManager.registerEventHandler(
            StorePropsEventTypes.SetupCompleted,
            this.upgradeLighting.bind(this)
        )
        // PointLightRequested is handled by LightFactory directly — it self-registers
        // in its constructor so the factory owns all light creation, including event-driven requests.
    }

    /**
     * Setup initial lighting fast - just ambient + directional
     * This lets the scene become visible quickly without expensive fixtures
     */
    private setupInitialLighting(): void {
        if (this.lightingUpgradeStarted) {
            LightingRenderer.logger.debug('Skipping initial lighting because upgrade has already started')
            return
        }

        this.config = this.getCurrentConfig()
        
        LightingRenderer.logger.lifecycle(`💡 Setting up initial lighting (fast pass)...`)
        
        // No shadows for fast startup
        this.renderer.shadowMap.enabled = false
        
        // Basic ambient + directional illumination
        LightingRenderer.logger.lifecycle('💡 Setting up basic illumination - ambient + directional light')
        this.setupAmbientAndMainDirectionalLighting()
        LightingRenderer.logger.debug(`✅ Basic lighting: ${this.lightingGroup.children.length} lights added`)

        if (this.lightingUpgradeStarted) {
            LightingRenderer.logger.debug('Skipping remaining lighting work because upgrade started mid-pass')
            return
        }

        // Create GameSpotlight pool BEFORE room geometry renders, so its SpotLight
        // is counted in the initial light-hash. Materials compile once with the
        // full light count during startup instead of recompiling on first click.
        new GameSpotlight()
    }

    /**
     * Reconfigure lights with current config and quality settings
     * Apply shadow policy and setup lights for the current quality level.
     */
    private reconfigureWithQuality(): void {
        applyRendererShadowPolicy(this.renderer, this.config)
        this.setupLightsByQuality()
    }

    /**
     * Upgrade to full lighting system - called asynchronously after scene is visible
     * 
     * TODO: Currently disabled in SceneCoordinator (suspected startup hitch).
    * Re-evaluate: this clears all lights then rebuilds from scratch, which forces
    * a full shader recompile of every MeshStandardMaterial in the scene. If lights
    * are already set up correctly in setupInitialLighting(), this method may be
     * unnecessary — or should be restructured to add lights incrementally rather
     * than clear-and-rebuild.
     */
    private upgradeLighting(): void {
        this.lightingUpgradeStarted = true
        const monitor = PerformanceMonitor.start('lighting-upgrade', LightingRenderer.logger)
        const startTime = window.performance.now()
        this.config = this.getCurrentConfig()
        
        LightingRenderer.logger.lifecycle(`💡 Upgrading to ${this.config.quality} lighting...`)
        
        try {
            // Now do full setup with shadows and fixtures
            this.reconfigureWithQuality()
            monitor.end({ quality: this.config.quality })
            
            // Check current settings for debug helpers and lighting state
            const appSettings = AppSettings.getInstance()
            
            // Only show debug helpers if setting is enabled
            if (appSettings.getSetting('showLightingDebug')) {
                this.debugHelper.addHelpersForRegisteredLights()
            }
            
            // Don't call toggleLighting() here - it would overwrite individual visibility states
            // Each light type has its own visibility set in setupEnhancedLighting()
            // toggleLighting() is only for user-triggered master on/off via UI
            
            const duration = window.performance.now() - startTime
            LightingRenderer.logger.debug(`✅ Advanced lighting setup complete in ${duration.toFixed(1)}ms!`)
            
            // Emit system ready event for UI components
            this.eventManager.emit(LightingEventTypes.SystemReady, {
                scene: this.scene,
                quality: this.config.quality,
                timestamp: Date.now(),
                source: EventSource.System
            })
        } catch (error) {
            LightingRenderer.logger.error('❌ Failed to upgrade lighting:', error)
            // Keep basic lighting - better than nothing
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
            shadowMapEnabled: appSettings.getSetting('shadowMapEnabled'),
            quality: appSettings.getSetting('lightingQuality')
        }
    }

    private currentFootprint(): { width: number; depth: number } {
        return { width: CURRENT_ROOM_DIMENSIONS.WIDTH, depth: CURRENT_ROOM_DIMENSIONS.DEPTH }
    }

    private attachDirectionalTarget(light: THREE.DirectionalLight, position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
        light.target.position.copy(position)
        if (light.target.parent !== this.lightingGroup) {
            this.lightingGroup.add(light.target)
        }
    }

    private setupAmbientAndMainDirectionalLighting(): void {
        this.lightFactory.createAmbientLight(0xffffff, 0.3, {
            name: LIGHT_NAMES.AMBIENT,
            parent: this.lightingGroup
        })
        this.lightFactory.createDirectionalLight(0xffffff, 0.95, {
            name: LIGHT_NAMES.MAIN_DIRECTIONAL,
            parent: this.lightingGroup,
            position: [0, 10, 0]
        })
        const mainDirectional = this.lightingGroup.getObjectByName(LIGHT_NAMES.MAIN_DIRECTIONAL)
        if (mainDirectional instanceof THREE.DirectionalLight) {
            this.attachDirectionalTarget(mainDirectional)
            configureDirectionalShadowForShelfContact(mainDirectional, this.config, this.currentFootprint(), {
                bias: AppSettings.get('shadowContactBias'),
                normalBias: AppSettings.get('shadowContactNormalBias')
            })
        }
    }

    private onAppSettingsChanged(event: CustomEvent<SettingChangedEvent>): void {
        if (
            event.detail.settingName !== Setting.ShadowContactBias
            && event.detail.settingName !== Setting.ShadowContactNormalBias
        ) {
            return
        }

        const mainDirectional = this.lightingGroup.getObjectByName(LIGHT_NAMES.MAIN_DIRECTIONAL)
        if (!(mainDirectional instanceof THREE.DirectionalLight)) return

        applyShadowContactTuning(mainDirectional, {
            bias: AppSettings.get(Setting.ShadowContactBias),
            normalBias: AppSettings.get(Setting.ShadowContactNormalBias),
        })
        this.renderer.shadowMap.needsUpdate = true
    }

    private setupLightsByQuality(): void {
        const quality = this.config.quality ?? LIGHTING_QUALITY.ENHANCED
        
        if (quality === LIGHTING_QUALITY.SIMPLE) {
            // Fallback/minimal tier: ambient + directional only.
            // ENHANCED and above are the normal retail-profile lighting levels.
            LightingRenderer.logger.lifecycle('💡 Setting up FALLBACK lighting (SIMPLE tier) - minimal illumination only')
            this.setupAmbientAndMainDirectionalLighting()
            LightingRenderer.logger.debug(`✅ Simple lighting: ${this.lightingGroup.children.length} lights added`)
        } else {
            // Quality >= ENHANCED: baseline retail profile with optional feature escalation
            LightingRenderer.logger.lifecycle(`💡 Setting up ${quality} lighting - retail core + optional features`)
            
            this.setupRetailCoreLighting()
            
            // Feature escalation by numeric threshold
            if (quality >= LIGHTING_QUALITY.ADVANCED) {
                this.addPointLights()
            }
            if (quality >= LIGHTING_QUALITY.OUCH_MY_EYES) {
                this.addDramaticLighting()
            }
            
            this.applyRetailProfileDefaults()
            LightingRenderer.logger.debug(`✅ ${quality} lighting: ${this.lightingGroup.children.length} lights/groups added`)
        }
    }

    private setupRetailCoreLighting(): void {
        // Ambient light — warm retail white, noticeable brightness.
        // ambientIntensity in config is near-zero by design (keeps specular bias down),
        // but ambient *base* must be high enough to see the room before fixtures kick in.
        const ambientLight = this.lightFactory.createAmbientLight(0xFFF8E7, 0.32, {
            name: LIGHT_NAMES.AMBIENT,
            parent: this.lightingGroup
        })
        ambientLight.visible = true

        // Main exterior light: Combined moonlight + street light as single directional
        // Positioned high and forward with warmer tone (mix of cool moonlight + warm street light)
        const exteriorHeight = (this.config.ceilingHeight) + 2
        const exteriorLight = this.lightFactory.createDirectionalLight(0xD4DFF2, 0.52, {
            name: LIGHT_NAMES.EXTERIOR_AMBIENT,
            parent: this.lightingGroup,
            position: [1, exteriorHeight, 10]
        })
        this.attachDirectionalTarget(exteriorLight)
        configureDirectionalShadow(exteriorLight, this.config, this.currentFootprint())
        exteriorLight.visible = false

        // Entrance spotlight: Creates inviting bright area at storefront that fades inward
        // Positioned outside looking in, warm welcoming glow
        const entranceSpot = this.lightFactory.createSpotLight(
            0xFFE4B5,
            0.82,
            12,
            Math.PI / 5,
            0.3,
            1.5,
            {
                name: LIGHT_NAMES.ENTRANCE_SPOTLIGHT,
                parent: this.lightingGroup,
                position: [0, exteriorHeight - 0.5, CURRENT_ROOM_DIMENSIONS.DEPTH / 2 + 2]
            }
        )
        entranceSpot.target.position.set(0, 0, CURRENT_ROOM_DIMENSIONS.DEPTH / 2 - 3)
        entranceSpot.castShadow = false
        entranceSpot.visible = false
        this.lightingGroup.add(entranceSpot.target)

        // Subtle rim light: defines edges from back, prevents flat lighting
        // Cool temperature, very low intensity, non-shadow casting
        const rimLightHeight = (this.config.ceilingHeight) + 1
        const rimLight = this.lightFactory.createDirectionalLight(BlockbusterColors.fluorescentCool, 0.14, {
            name: LIGHT_NAMES.RIM_LIGHT,
            parent: this.lightingGroup,
            position: [3, rimLightHeight, -5]
        })
        rimLight.castShadow = false
        rimLight.visible = false
    }

    private applyRetailProfileDefaults(): void {
        // Ensure proper state when retail-profile lighting takes over.
        this.toggleLighting(true)
        this.toggleDebugVisualization(false)
    }

    private setupFluorescentFixtures(shelfLayout?: { rows: number; shelvesPerRow?: number }): void {
        const monitor = PerformanceMonitor.start('ceiling-fixtures-setup', LightingRenderer.logger)
        
        if (!this.propRenderer) {
            this.propRenderer = new PropRenderer(this.scene)
        }
        
        // Use provided layout, stored layout, or fall back to defaults
        // Place fixtures for every OTHER shelf row for better lighting coverage and performance
        const layout = shelfLayout ?? this.currentShelfLayout
        const shelfRows = layout?.rows ?? 2
        const fixtureRows = Math.max(1, Math.ceil(shelfRows / 2)) // One light per 2 shelf rows
        const fixturesPerRow = layout?.shelvesPerRow ?? 4
        const ceilingHeight = this.config.ceilingHeight
        
        const fixtures = this.propRenderer.createCeilingLightFixtures(
            ceilingHeight,
            CURRENT_ROOM_DIMENSIONS.WIDTH,
            CURRENT_ROOM_DIMENSIONS.DEPTH,
            {
                width: 4,
                height: 0.15,
                depth: 0.6,
                emissiveIntensity: 0.6, // Reduced from 0.8 for comfort
                rows: fixtureRows,
                fixturesPerRow: fixturesPerRow
            }
        )
        
        this.scene.add(fixtures)
        this.currentFixtures = fixtures
        
        monitor.end({ fixtureCount: fixtureRows * fixturesPerRow, shelfRows })
        LightingRenderer.logger.debug(`💡 Created ${fixtureRows * fixturesPerRow} ceiling fixtures (${fixtureRows} rows x ${fixturesPerRow} per row) for ${shelfRows} shelf rows`)
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
            pointLight.visible = false // Disabled by default - toggleable in lighting panel
        })
        
        LightingRenderer.logger.debug('💡 Added strategic accent lighting for atmosphere (disabled by default)')
    }

    private addDramaticLighting(): void {
        const spotLight1 = this.lightFactory.createSpotLight(0xffffff, 1.0, 15, Math.PI / 6, 0.2, 1, {
            name: LIGHT_NAMES.DRAMATIC_SPOTLIGHT,
            parent: this.lightingGroup,
            position: [0, 8, 0]
        })
        spotLight1.target.position.set(0, 0, 0)
        applyLightShadowPolicy(spotLight1, this.config)
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

    private updateLightingQuality(quality: LightingQuality): void {
        this.debugHelper.clearHelpers()
        
        // Refresh full config from AppSettings to get updated shadows/ceiling height too
        this.config = { ...this.getCurrentConfig(), quality }
        this.reconfigureWithQuality()
        this.forceShadowStateRefresh()
        
        // Only show debug helpers if setting is enabled
        const appSettings = AppSettings.getInstance()
        if (appSettings.getSetting('showLightingDebug')) {
            this.debugHelper.addHelpersForRegisteredLights()
        }
        
        // Emit system ready event for UI components
        this.eventManager.emit(LightingEventTypes.SystemReady, {
            scene: this.scene,
            quality: this.config.quality,
            timestamp: Date.now(),
            source: EventSource.System
        })
    }

    private applyRoomFootprint(width: number, depth: number): boolean {
        const previousWidth = CURRENT_ROOM_DIMENSIONS.WIDTH
        const previousDepth = CURRENT_ROOM_DIMENSIONS.DEPTH
        CURRENT_ROOM_DIMENSIONS.WIDTH = width
        CURRENT_ROOM_DIMENSIONS.DEPTH = depth
        return previousWidth !== width || previousDepth !== depth
    }

    private applyLightingGroupOffset(centerOffset?: { x: number; y: number; z: number }): void {
        if (centerOffset) {
            this.lightingGroup.position.set(centerOffset.x, centerOffset.y, centerOffset.z)
            LightingRenderer.logger.debug(`💡 Lighting group positioned at: (${centerOffset.x}, ${centerOffset.y}, ${centerOffset.z.toFixed(1)})`)
        }
    }

    private refreshFixturesAndShadowFrustum(
        ceilingHeightChanged: boolean,
        roomFootprintChanged: boolean,
        shelfLayout?: { rows: number; shelvesPerRow?: number }
    ): void {
        const layoutForFixtures = shelfLayout ?? this.currentShelfLayout
        const shouldRefreshFixtures = Boolean(layoutForFixtures) && (
            Boolean(shelfLayout) ||
            (ceilingHeightChanged && Boolean(this.currentFixtures))
        )

        if (shouldRefreshFixtures && layoutForFixtures) {
            if (this.currentFixtures) {
                LightingRenderer.logger.debug('💡 Updating existing ceiling fixtures for room changes...')
                this.scene.remove(this.currentFixtures)
                this.currentFixtures = null
            } else {
                LightingRenderer.logger.debug('💡 Adding ceiling fixtures for shelf layout...')
            }

            this.setupFluorescentFixtures(layoutForFixtures)
        }

        if (roomFootprintChanged) {
            refitDirectionalShadowCameras(this.lightingGroup, this.currentFootprint())
        }
    }

    private updateRoomDimensions(
        dimensions: { width: number; depth: number; height: number },
        shelfLayout?: { rows: number; shelvesPerRow?: number },
        centerOffset?: { x: number; y: number; z: number }
    ): void {
        LightingRenderer.logger.debug(`💡 Updating lighting for room dimensions: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
        
        const roomFootprintChanged = this.applyRoomFootprint(dimensions.width, dimensions.depth)
        
        const previousCeilingHeight = this.config.ceilingHeight
        const ceilingHeightChanged = previousCeilingHeight !== dimensions.height

        if (ceilingHeightChanged) {
            this.config.ceilingHeight = dimensions.height
        }
        
        // Store shelf layout for use during lighting upgrades
        if (shelfLayout) {
            this.currentShelfLayout = shelfLayout
            LightingRenderer.logger.debug(`💡 Stored shelf layout: ${shelfLayout.rows} rows x ${shelfLayout.shelvesPerRow} shelves per row`)
        }
        
        this.applyLightingGroupOffset(centerOffset)
        this.refreshFixturesAndShadowFrustum(ceilingHeightChanged, roomFootprintChanged, shelfLayout)
    }

    private toggleLighting(enabled: boolean): void {
        LightingRenderer.logger.debug(`💡 ${enabled ? 'Enabling' : 'Disabling'} all lights`)
        
        for (const [, lights] of this.registry.getLightsGroupedByType()) {
            for (const light of lights) {
                light.visible = enabled
            }
        }
    }

    private toggleDebugVisualization(enabled: boolean): void {
        LightingRenderer.logger.debug(`🔍 ${enabled ? 'Showing' : 'Hiding'} light debug visualization`)
        
        if (enabled) {
            this.debugHelper.addHelpersForRegisteredLights()
        } else {
            this.debugHelper.clearHelpers()
        }
    }

    private clearLights(): void {
        // Clear registry first so the controls panel doesn't see stale entries
        this.registry.clear()
        
        // Remove all lights from lighting group
        while (this.lightingGroup.children.length > 0) {
            const child = this.lightingGroup.children[0]
            this.lightingGroup.remove(child)
            
            // Dispose any resources if needed
            if (child instanceof THREE.Light) {
                const shadowLight = child as THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight
                if ('shadow' in shadowLight && shadowLight.shadow) {
                    shadowLight.shadow.dispose()
                }
            }
        }
    }

    private forceShadowStateRefresh(): void {
        this.renderer.shadowMap.needsUpdate = true

        this.scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return

            if (Array.isArray(object.material)) {
                for (const material of object.material) {
                    material.needsUpdate = true
                }
                return
            }

            object.material.needsUpdate = true
        })
    }

    public dispose(): void {
        this.clearLights()
        if (this.currentFixtures) {
            this.scene.remove(this.currentFixtures)
            this.currentFixtures = null
        }
        this.debugHelper.dispose()
        if (this.propRenderer) {
            this.propRenderer.dispose()
        }
        this.scene.remove(this.lightingGroup)
    }
}

