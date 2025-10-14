/**
 * Scene Coordinator - High-Level Scene Setup and Management
 * 
 * This coordinator orchestrates the complete visual system setup with
 * organized visual buckets loaded in
 * 1. Environment (skybox, room structure, spatial found            // Emit room:resize event to trigger proper event-driven room expansion
            // RoomManager will calculate dimensions and handle room structure
            // StorePropsRenderer will listen for room:resized and spawn shelves accordingly
            console.debug(`🗂️ Requesting room resize for ${eventData.gameCount} games`)
            EventManager.getInstance().emit('room:resize', {
                gameCount: eventData.gameCount,
                timestamp: Date.now(),
                source: 'SceneCoordinator',
                games: this.getGamesForShelfSpawning()
            } as any)2. Lighting (illumination systems, shadows, atmosphere)  
 * 3. Props (shelves, games, signage, interactive objects)
 * 
 * This sequential loading creates a smooth transition for players as
 * they see the space build up in logical layers.
 */

import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { SkyboxManager, SkyboxPresets } from './SkyboxManager'
import { LightingRenderer } from './LightingRenderer'
import { StorePropsRenderer } from './StorePropsRenderer'
import { RoomManager } from './RoomManager'
import { EventManager, EventSource } from '../core/EventManager'
import { GameEventTypes, CeilingEventTypes, SteamEventTypes, type CeilingToggleEvent, type SceneReadyEvent, type SteamDataLoadedEvent } from '../types/InteractionEvents'
import { AppSettings } from '../core/AppSettings'
import { DataManager } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'
import { GameBoxRenderer } from './GameBoxRenderer'

export interface SceneCoordinatorConfig {
    environment?: {
        skyboxPreset?: string
        roomSize?: { width: number, depth: number, height: number }
        proceduralTextures?: boolean
    }
    props?: {
        enableTestObjects?: boolean
    }
    tests?: Record<string, string>
}

export class SceneCoordinator {
    private sceneManager: SceneManager
    private skyboxManager: SkyboxManager
    private lightingRenderer: LightingRenderer
    private propsRenderer: StorePropsRenderer
    private roomManager: RoomManager
    private appSettings: AppSettings
    private dataManager: DataManager
    private eventManager: EventManager
    private config: SceneCoordinatorConfig

    constructor(
        sceneManager: SceneManager, 
        config: SceneCoordinatorConfig = {}, 
        storePropsRenderer?: StorePropsRenderer,
        appSettings?: AppSettings,
        dataManager?: DataManager,
        eventManager?: EventManager
    ) {
        // Store config for later use
        this.config = config
        
        // TODO: DI tho?
        this.sceneManager = sceneManager
        this.appSettings = appSettings || AppSettings.getInstance() // Fallback for backward compatibility
        this.dataManager = dataManager || DataManager.getInstance() // Fallback for backward compatibility
        this.eventManager = eventManager || EventManager.getInstance() // DI injection with fallback
        
        // Initialize visual system renderers
        this.skyboxManager = new SkyboxManager(this.sceneManager.getScene())
        this.lightingRenderer = new LightingRenderer(
            this.sceneManager.getScene(),
            this.sceneManager.getRenderer()
        )
        // Initialize room manager for event-driven room structure (no longer needs EnvironmentRenderer)
        this.roomManager = new RoomManager(this.sceneManager.getScene(), this.dataManager, this.eventManager)
        
        // Use DI-injected StorePropsRenderer or create one for backward compatibility
        this.propsRenderer = storePropsRenderer || new StorePropsRenderer(this.sceneManager.getScene(), this.dataManager, GameBoxRenderer.Instance)

        // 🎬 EVENT-DRIVEN STARTUP: Setup scene and emit SceneReady when basic navigation is ready
        // This is a prerequisite for GameStart - scene must be navigable before game can start

        this.setupSceneAsPrerequisite(config).catch(error => {
            console.error('❌ Failed to set up scene prerequisite:', error)
            // Emit SceneReady anyway so GameStart can proceed even if scene setup fails
            console.log('⚠️ Emitting SceneReady despite setup failure to unblock GameStart')
            this.emitSceneReadyEvent()
        })

        // Register for Steam data loaded events to spawn dynamic shelves  
        this.eventManager.registerEventHandler(SteamEventTypes.DataLoaded, (event: CustomEvent<SteamDataLoadedEvent>) => {
            // this.analyzeTaxonomies();
        })
        console.debug('✅ Steam data loaded event handler restored - games will spawn on shelves')

        if(window) {
            (window as any).debugListSceneObjects = this.debugListSceneObjects.bind(this);
        }
    }

    async setupSceneAsPrerequisite(config: SceneCoordinatorConfig = {}): Promise<void> {
        try {
            
            // 🚀 PRIORITY: Minimal navigable scene (just camera position - everything else can wait)
            await this.setupMinimalScene(config.environment)
            
            console.log('✅ Minimal scene ready - user can now move around!')
            
            // 📡 EMIT SceneReady immediately - basic navigation works
            this.emitSceneReadyEvent()

            // 🎨 Everything else happens asynchronously (skybox, lighting, props)
            this.setupEnhancedSceneAsync(config.environment)
            
        } catch (error) {
            console.error('❌ Failed to set up scene prerequisite:', error)
            // Still emit SceneReady so controls work
            this.emitSceneReadyEvent()
        }
    }

    /**
     * Setup absolutely minimal scene - just enough for navigation to work
     * This should complete in <10ms to get controls working ASAP
     */
    private async setupMinimalScene(config: SceneCoordinatorConfig['environment'] = {}): Promise<void> {
        // Literally nothing - just camera position is handled by SceneManager
        // User can move around in a void, which is fine temporarily
        console.log('📦 Minimal scene ready - void navigation enabled')
    }

    /**
     * Setup enhanced scene asynchronously - skybox, lighting, props
     * This doesn't block user interaction
     */
    private setupEnhancedSceneAsync(config: SceneCoordinatorConfig['environment'] = {}): void {
        // Don't await - let this happen in the background
        this.loadEnhancedScene(config).catch(error => {
            console.error('⚠️ Enhanced scene loading failed:', error)
            // Don't throw - basic scene still works
        })
    }

    private async loadEnhancedScene(config: SceneCoordinatorConfig['environment'] = {}): Promise<void> {
        try {
            
            // 🌌 STEP 1: Skybox (visual context)
            const presetName = config.skyboxPreset ?? 'aurora'
            const preset = (SkyboxPresets as any)[presetName] || SkyboxPresets.aurora
            await this.skyboxManager.applySkybox(preset)
            
            console.log('🌌 Skybox loaded')

            
            // 💡 STEP 2: Lighting (makes everything visible)
            await this.lightingRenderer.setupLighting()
            this.lightingRenderer.refreshShadows()
            
            console.log('💡 Lighting ready')

            
            // 🏪 STEP 3: Props (room, shelves, games - the heavy stuff)
            await this.setupProps()
            
            console.log('🏪 Props loaded - store environment complete!')

        } catch (error) {
            console.error('❌ Enhanced scene loading failed:', error)
            // Don't throw - basic navigation still works
        }
    }

    private async setupBasicEnvironment(config: SceneCoordinatorConfig['environment'] = {}): Promise<void> {
        // This method is now replaced by setupMinimalScene + loadEnhancedScene
        // Keeping for backward compatibility
    }

    private async setupEnhancedScene(): Promise<void> {
        // This method is now replaced by loadEnhancedScene  
        // Keeping for backward compatibility
    }

    private async setupProps(): Promise<void> {
        await this.propsRenderer.setupProps({
            enableShelves: true,
            enableGameBoxes: true,
            enableSignage: true,
            tests: this.config.tests
        })
    }

    public async addAtmosphericProps(): Promise<void> {
        await this.propsRenderer.addAtmosphericProps()
    }

    updatePerformanceData(camera: THREE.Camera): void {
        this.propsRenderer.updatePerformanceData(camera)
    }

    /**
     * Debug function to list all objects in the scene by name
     * Useful for hunting down duplicate environment objects
     */
    public debugListSceneObjects(): void {
        console.log('\n🔍 === SCENE OBJECT DEBUG LIST ===')
        console.log(`📊 Total scene children: ${this.sceneManager.getScene().children.length}`)
        
        const listObjects = (obj: THREE.Object3D, indent: string = '') => {
            const name = obj.name || `<unnamed-${obj.type}>`
            const type = obj.type
            const childCount = obj.children.length
            const position = `(${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)})`
            
            console.log(`${indent}📦 ${name} [${type}] ${position} ${childCount > 0 ? `(${childCount} children)` : ''}`)
            
            if (obj.children.length > 0) {
                obj.children.forEach(child => {
                    listObjects(child, indent + '  ')
                })
            }
        }
        
        this.sceneManager.getScene().children.forEach(obj => {
            listObjects(obj)
        })
        
        console.log('=== END SCENE OBJECT LIST ===\n')
    }

    dispose(): void {
        this.skyboxManager.dispose()
        this.lightingRenderer.dispose()
        this.propsRenderer.dispose()
        this.roomManager.dispose()
    }

    private analyzeTaxonomies(): void {
        // Get game data from DataManager instead of event
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        
        // Playtime-based taxonomies
        const playtimeBuckets = {
            unplayed: games.filter(g => g.playtime_forever === 0),
            lightly: games.filter(g => g.playtime_forever > 0 && g.playtime_forever < 600), // < 10 hours (in minutes)
            moderately: games.filter(g => g.playtime_forever >= 600 && g.playtime_forever < 3000), // 10-50 hours
            heavily: games.filter(g => g.playtime_forever >= 3000) // 50+ hours
        }
        
        console.log(`PLAYTIME CATEGORIES for your ${games.length} games:`)
        console.log(`   • Unplayed: ${playtimeBuckets.unplayed.length} games`)
        console.log(`   • Lightly Played (< 10h): ${playtimeBuckets.lightly.length} games`)
        console.log(`   • Moderately Played (10-50h): ${playtimeBuckets.moderately.length} games`)
        console.log(`   • Heavily Played (50h+): ${playtimeBuckets.heavily.length} games`)
        
        // Recent activity taxonomies
        const recentlyPlayed = games.filter(g => g.playtime_2weeks && g.playtime_2weeks > 0)
        
        console.log(`   • Recently Played (last 2 weeks): ${recentlyPlayed.length} games`)
                
        // App ID ranges (can indicate release periods/publishers)
        const appIds = games.map(g => typeof g.appid === 'number' ? g.appid : parseInt(g.appid))
        const minAppId = Math.min(...appIds)
        const maxAppId = Math.max(...appIds)
        
        console.log(`   • Oldest game (lowest ID): ${minAppId}`)
        console.log(`   • Newest game (highest ID): ${maxAppId}`)
        
        // List some example games for context
        console.log(`\n📋 SAMPLE GAMES (first 5):`)
        games.slice(0, 5).forEach(game => {
            const hours = Math.round(game.playtime_forever / 60 * 10) / 10
            const recentHours = game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0
            console.log(`   • "${game.name}" - ${hours}h total, ${recentHours}h recent (ID: ${game.appid})`)
        })
    }

    private emitSceneReadyEvent(): void {
        console.log('📡 Emitting SceneReady event - basic navigation is ready')
        
        this.eventManager.emit<SceneReadyEvent>(GameEventTypes.SceneReady, {
            source: EventSource.System,
            timestamp: Date.now(),
            sceneStats: {
                basicNavigationReady: true
            }
        })
    }
}
