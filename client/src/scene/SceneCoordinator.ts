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
import { EventManager, EventSource } from '../core/EventManager'
import { GameEventTypes, CeilingEventTypes, type CeilingToggleEvent, type SceneReadyEvent } from '../types/InteractionEvents'
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

        // 🎬 EVENT-DRIVEN STARTUP: Setup scene and emit SceneReady when basic navigation is ready
        // This is a prerequisite for GameStart - scene must be navigable before game can start

        this.setupSceneAsPrerequisite(config).catch(error => {
            console.error('❌ Failed to set up scene prerequisite:', error)
            // Emit SceneReady anyway so GameStart can proceed even if scene setup fails
            console.log('⚠️ Emitting SceneReady despite setup failure to unblock GameStart')
            this.emitSceneReadyEvent()
        })

        // Register for ceiling toggle events
        EventManager.getInstance().registerEventHandler(CeilingEventTypes.Toggle, (event: CustomEvent<CeilingToggleEvent>) => {
            this.environmentRenderer.setCeilingVisibility(event.detail.visible)
        })
    }

    /**
     * Setup scene as prerequisite for GameStart - emits SceneReady when basic navigation is ready
     */
    async setupSceneAsPrerequisite(config: SceneCoordinatorConfig = {}): Promise<void> {

        
        try {
            // 🚀 PRIORITY: Basic navigable environment (prerequisite for GameStart)

            await this.setupBasicEnvironment(config.environment)
            console.log('✅ Basic environment ready - user can now move around!')
            
            // 📡 EMIT SceneReady - this scene is now a satisfied prerequisite for GameStart
            this.emitSceneReadyEvent()
            
            // 🎯 BACKGROUND: Enhanced details (non-blocking - continues while game starts)

            this.setupEnhancedScene(config).catch(error => {
                console.error('❌ Background scene enhancement failed:', error)
            })
            
        } catch (error) {
            console.error('❌ Failed to set up scene prerequisite:', error)
            throw error
        }
    }

    /**
     * Legacy method for backward compatibility - now delegates to prerequisite setup
     */
    async setupCompleteScene(config: SceneCoordinatorConfig = {}): Promise<void> {
        return this.setupSceneAsPrerequisite(config)
    }

    /**
     * Setup minimal environment needed for user navigation (blocking)
     */
    private async setupBasicEnvironment(config: SceneCoordinatorConfig['environment'] = {}): Promise<void> {
        // Use ceiling height from settings if not explicitly provided
        const ceilingHeight = config.roomSize?.height ?? this.appSettings.getSetting('ceilingHeight')
        
        console.log('🏗️ Starting basic environment setup...')
        
        try {
            await this.environmentRenderer.setupEnvironment({
                roomSize: {
                    width: config.roomSize?.width ?? 22,
                    depth: config.roomSize?.depth ?? 16,
                    height: ceilingHeight
                },
                skyboxPreset: config.skyboxPreset ?? 'aurora',
                proceduralTextures: config.proceduralTextures ?? true
            })
            console.log('✅ Basic environment setup completed successfully')
        } catch (error) {
            console.error('❌ Basic environment setup failed:', error)
            // Still allow SceneReady to be emitted - basic scene is functional even if enhanced setup fails
        }
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
     * Emit SceneReady event - signals that basic scene navigation is ready (prerequisite for GameStart)
     */
    private emitSceneReadyEvent(): void {
        const envStats = this.environmentRenderer.getEnvironmentStats()
        const lightStats = this.lightingRenderer.getLightingStats()
        
        console.log('📡 Emitting SceneReady event - basic navigation is ready')
        
        EventManager.getInstance().emit<SceneReadyEvent>(GameEventTypes.SceneReady, {
            source: EventSource.System,
            timestamp: Date.now(),
            sceneStats: {
                environmentObjectCount: envStats.objectCount,
                lightsReady: lightStats.lightCount > 0,
                basicNavigationReady: true
            }
        })
    }

    /**
     * Log comprehensive scene statistics
     */
    private logSceneStats(): void {
        const envStats = this.environmentRenderer.getEnvironmentStats()
        const lightStats = this.lightingRenderer.getLightingStats()
        const propsStats = this.propsRenderer.getPropsStats()
        

    }
}
