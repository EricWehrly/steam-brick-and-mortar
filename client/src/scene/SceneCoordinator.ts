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

        // 🚀 OPTIMIZATION: Start scene setup immediately for faster interactivity
        // Don't wait for GameStart event - user should be able to move ASAP
        this.setupCompleteScene(config).catch(error => {
            console.error('❌ Failed to set up scene during construction:', error)
        })

        // Register for ceiling toggle events
        EventManager.getInstance().registerEventHandler(CeilingEventTypes.Toggle, (event: CustomEvent<CeilingToggleEvent>) => {
            this.environmentRenderer.setCeilingVisibility(event.detail.visible)
        })
    }

    async setupCompleteScene(config: SceneCoordinatorConfig = {}): Promise<void> {
        console.log('🏪 Setting up VR-optimized store scene with priority for user interaction...')
        
        try {
            // 🚀 PRIORITY PHASE: Basic navigable environment (blocking - user needs this to move around)
            console.log('🌍 Priority: Setting up basic environment for navigation...')
            await this.setupBasicEnvironment(config.environment)
            console.log('✅ Basic environment ready - user can now move around!')
            
            // 🎯 ASYNC PHASES: Enhanced details (non-blocking - user can move while these load)
            console.log('📋 Background loading: Props → Lighting → Polish...')
            
            // Don't await these - let them complete in background while user moves around
            this.setupEnhancedScene(config).catch(error => {
                console.error('❌ Background scene enhancement failed:', error)
            })
            
        } catch (error) {
            console.error('❌ Failed to set up basic scene:', error)
            throw error
        }
    }

    /**
     * Setup minimal environment needed for user navigation (blocking)
     */
    private async setupBasicEnvironment(config: SceneCoordinatorConfig['environment'] = {}): Promise<void> {
        // Use ceiling height from settings if not explicitly provided
        const ceilingHeight = config.roomSize?.height ?? this.appSettings.getSetting('ceilingHeight')
        
        await this.environmentRenderer.setupEnvironment({
            roomSize: {
                width: config.roomSize?.width ?? 22,
                depth: config.roomSize?.depth ?? 16,
                height: ceilingHeight
            },
            skyboxPreset: config.skyboxPreset ?? 'aurora',
            proceduralTextures: config.proceduralTextures ?? true
        })
    }

    /**
     * Setup enhanced scene elements in background (non-blocking)
     */
    private async setupEnhancedScene(config: SceneCoordinatorConfig): Promise<void> {
        try {
            // PHASE 1: Props and Interactive Objects
            console.log('🎁 Background: Setting up props...')
            await this.setupProps(config.props)
            
            // PHASE 2: Lighting Systems (after props for proper shadow casting)
            console.log('💡 Background: Setting up lighting...')            
            await this.lightingRenderer.setupLighting()
            
            // Refresh shadows now that all props are in place
            this.lightingRenderer.refreshShadows()
            
            this.logSceneStats()
            console.log('✅ Enhanced scene setup completed!')
        } catch (error) {
            console.error('❌ Enhanced scene setup failed:', error)
            // Don't throw - basic scene is still functional
        }
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
