/**
 * Scene Coordinator - High-Level Scene Setup and Management
 * 
 * This coordinator orchestrates the complete visual system setup with
 * organized visual buckets loaded in
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
import { AppSettings } from '../core/AppSettings'

export interface SceneCoordinatorConfig {
    environment?: {
        skyboxPreset?: string
        roomSize?: { width: number, depth: number, height: number }
        proceduralTextures?: boolean
    }
    props?: {
        enableTestObjects?: boolean
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

    private async setupEnhancedScene(config: SceneCoordinatorConfig): Promise<void> {
        try {
            await this.setupProps(config.props)
            
            await this.lightingRenderer.setupLighting()
            
            this.lightingRenderer.refreshShadows()

        } catch (error) {
            console.error('❌ Enhanced scene setup failed:', error)
            // Don't throw - basic scene is still functional
        }
    }

    private async setupProps(config: SceneCoordinatorConfig['props'] = {}): Promise<void> {
        await this.propsRenderer.setupProps({
            enableTestObjects: config.enableTestObjects ?? false,
            enableShelves: true,
            enableGameBoxes: true,
            enableSignage: true
        })
    }

    public async addAtmosphericProps(): Promise<void> {
        await this.propsRenderer.addAtmosphericProps()
    }

    updatePerformanceData(camera: THREE.Camera): void {
        this.propsRenderer.updatePerformanceData(camera)
    }

    getPerformanceStats(): ReturnType<StorePropsRenderer['getPerformanceStats']> {
        return this.propsRenderer.getPerformanceStats()
    }

    /**
     * Legacy compatibility - get game box renderer
     */
    getGameBoxRenderer() {
        return this.propsRenderer.getGameBoxRenderer()
    }

    dispose(): void {
        this.environmentRenderer.dispose()
        this.lightingRenderer.dispose()
        this.propsRenderer.dispose()
    }

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
}
