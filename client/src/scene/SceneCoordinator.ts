/**
 * Scene Coordinator - High-Level Scene Setup and Management
 * 
 * This coordinator orchestrates the complete visual system setup with
 * organized visual buckets loaded in    }

    public dispose(): void {nce:
 * 1. Environment (skybox, room structure, spatial foundation)
 * 2. Lighting (illumination systems, shadows, atmosphere)  
 * 3. Props (shelves, games, signage, interactive objects)
 * 
 * This sequential loading creates a smooth transition for players as
 * they see the space build up in logical layers.
 */

import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { EnvironmentRenderer } from './EnvironmentRenderer'
import { LightingRenderer } from './LightingRenderer'
import { StorePropsRenderer } from './StorePropsRenderer'
import { EventManager } from '../core/EventManager'
import { GameEventTypes, CeilingEventTypes, type CeilingToggleEvent } from '../types/InteractionEvents'
import { AppSettings, type LightingQuality } from '../core/AppSettings'

export interface SceneCoordinatorConfig {
    maxGames?: number
    environment?: {
        skyboxPreset?: string
        roomSize?: { width: number, depth: number, height: number }
        proceduralTextures?: boolean
    }
    lighting?: {
        quality?: LightingQuality
        shadowQuality?: number
        ceilingHeight?: number
    }
    props?: {
        enableTestObjects?: boolean
        maxGames?: number
    }
}

export class SceneCoordinator {
    private sceneManager: SceneManager
    private environmentRenderer: EnvironmentRenderer
    private lightingRenderer: LightingRenderer
    private propsRenderer: StorePropsRenderer
    private appSettings: AppSettings

    constructor(sceneManager: SceneManager, config: SceneCoordinatorConfig = {}) {
        this.sceneManager = sceneManager
        this.appSettings = AppSettings.getInstance()
        
        // Initialize visual system renderers
        this.environmentRenderer = new EnvironmentRenderer(this.sceneManager.getScene(), this.appSettings)
        this.lightingRenderer = new LightingRenderer(
            this.sceneManager.getScene(),
            this.sceneManager.getRenderer()
        )
        this.propsRenderer = new StorePropsRenderer(this.sceneManager.getScene())

        // Register for GameStart event to trigger scene setup
        EventManager.getInstance().registerEventHandler(GameEventTypes.Start, () => {
            this.setupCompleteScene(config)
        })

        // Register for ceiling toggle events
        EventManager.getInstance().registerEventHandler(CeilingEventTypes.Toggle, (event: CustomEvent<CeilingToggleEvent>) => {
            this.environmentRenderer.setCeilingVisibility(event.detail.visible)
        })
    }

    async setupCompleteScene(config: SceneCoordinatorConfig = {}): Promise<void> {
        console.log('🏪 Setting up complete VR-optimized store scene...')
        console.log('📋 Loading sequence: Environment → Props → Lighting (for proper shadows)')
        
        try {
            // PHASE 1: Environment Foundation
            console.log('🌍 Phase 1/3: Setting up environment...')
            await this.setupEnvironment(config.environment)
            
            // PHASE 2: Props and Interactive Objects (before lighting for shadows)
            console.log('🎁 Phase 2/3: Setting up props...')
            await this.setupProps(config.props)
            
            // PHASE 3: Lighting Systems (after props for proper shadow casting)
            console.log('💡 Phase 3/3: Setting up lighting...')
            await this.setupLighting(config.lighting)
            
            // Refresh shadows now that all props are in place
            this.lightingRenderer.refreshShadows()
            
            this.logSceneStats()
            console.log('✅ Complete scene setup finished!')
        } catch (error) {
            console.error('❌ Failed to set up scene:', error)
            throw error
        }
    }

    /**
     * Set up environment foundation (Phase 1)
     */
    private async setupEnvironment(config: SceneCoordinatorConfig['environment'] = {}): Promise<void> {
        // Use ceiling height from settings if not explicitly provided
        const ceilingHeight = config.roomSize?.height ?? this.appSettings.getSetting('ceilingHeight')
        
        await this.environmentRenderer.setupEnvironment({
            skyboxPreset: config.skyboxPreset ?? 'aurora',
            roomSize: config.roomSize ?? { 
                width: 22, 
                depth: 16, 
                height: ceilingHeight 
            },
            proceduralTextures: config.proceduralTextures ?? true
        })
    }

    /**
     * Set up lighting systems (Phase 2)  
     */
    private async setupLighting(config: SceneCoordinatorConfig['lighting'] = {}): Promise<void> {
        // Use AppSettings as primary source, fall back to config, then defaults
        const lightingQuality = config.quality ?? this.appSettings.getSetting('lightingQuality')
        const shadowQuality = config.shadowQuality ?? this.appSettings.getSetting('shadowQuality')
        const ceilingHeight = config.ceilingHeight ?? this.appSettings.getSetting('ceilingHeight')

        await this.lightingRenderer.setupLighting({
            quality: lightingQuality,
            shadowQuality: shadowQuality,
            ceilingHeight: ceilingHeight
        })
    }

    /**
     * Set up props and interactive objects (Phase 3)
     */
    private async setupProps(config: SceneCoordinatorConfig['props'] = {}): Promise<void> {
        await this.propsRenderer.setupProps({
            enableTestObjects: config.enableTestObjects ?? false,
            maxGames: config.maxGames ?? 100,
            enableShelves: true,
            enableGameBoxes: true,
            enableSignage: true
        })
    }

    /**
     * Add atmospheric props after main setup
     */
    public async addAtmosphericProps(): Promise<void> {
        await this.propsRenderer.addAtmosphericProps()
    }

    /**
     * Update performance data for all renderers
     * Call this from the render loop
     */
    updatePerformanceData(camera: THREE.Camera): void {
        this.propsRenderer.updatePerformanceData(camera)
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats(): ReturnType<StorePropsRenderer['getPerformanceStats']> {
        return this.propsRenderer.getPerformanceStats()
    }

    /**
     * Get access to renderers for specific needs
     */
    public getEnvironmentRenderer(): EnvironmentRenderer {
        return this.environmentRenderer
    }

    public getLightingRenderer(): LightingRenderer {
        return this.lightingRenderer
    }

    public getPropsRenderer(): StorePropsRenderer {
        return this.propsRenderer
    }

    /**
     * Legacy compatibility - get game box renderer
     */
    getGameBoxRenderer() {
        return this.propsRenderer.getGameBoxRenderer()
    }

    /**
     * Legacy compatibility - get store layout
     */
    getStoreLayout() {
        return this.propsRenderer.getStoreLayout()
    }

    /**
     * Clean up all scene resources
     */
    dispose(): void {
        this.environmentRenderer.dispose()
        this.lightingRenderer.dispose()
        this.propsRenderer.dispose()
    }

    /**
     * Update the maximum games setting for development mode
     */
    updateMaxGames(maxGames: number): void {
        this.propsRenderer.updateMaxGames(maxGames)
    }

    /**
     * Log comprehensive scene statistics
     */
    private logSceneStats(): void {
        const envStats = this.environmentRenderer.getEnvironmentStats()
        const lightStats = this.lightingRenderer.getLightingStats()
        const propsStats = this.propsRenderer.getPropsStats()
        
        console.log('📊 Scene Statistics:')
        console.log(`   🌍 Environment: ${envStats.objectCount} objects, skybox: ${envStats.skyboxActive}`)
        console.log(`   💡 Lighting: ${lightStats.lightCount} lights, quality: ${lightStats.quality}`)
        console.log(`   🎁 Props: ${propsStats.totalProps} objects, shelves: ${propsStats.shelvesGenerated}`)
    }
}
