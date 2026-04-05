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
import { RoomManager } from './RoomManager'
import { EventManager } from '../core/EventManager'
import { GameEventTypes, type SceneReadyEvent } from '../types/InteractionEvents'
import { AppSettings } from '../core/AppSettings'
import { DataManager } from '../core/data'
// Initialize store props system (self-registering module with dedicated events)
import { StorePropsEventTypes, type StorePropsSetupRequestEvent, type StorePropsSetupCompletedEvent } from './props'
import type { SteamGameData } from './game-box/types/GameData'
import { StartupEventTracker, StartupPhase } from '../utils/StartupEventTracker'
import { SharedMaterialManager } from '../utils/SharedMaterialManager'

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
    private roomManager: RoomManager
    private dataManager: DataManager
    private eventManager: EventManager
    // Enhanced functionality is added to eventManager via extensions
    private config: SceneCoordinatorConfig

    constructor(
        sceneManager: SceneManager, 
        config: SceneCoordinatorConfig = {}, 
        appSettings?: AppSettings,
        dataManager?: DataManager,
        eventManager?: EventManager
    ) {
        // Store config for later use
        this.config = config
        
        // TODO: DI tho?
        this.sceneManager = sceneManager
        this.dataManager = dataManager || DataManager.getInstance() // Fallback for backward compatibility
        this.eventManager = eventManager || EventManager.getInstance() // DI injection with fallback
        
        // Store props handlers are now self-registering via module import
        
        // Initialize visual system renderers
        this.skyboxManager = new SkyboxManager()
        this.lightingRenderer = new LightingRenderer(
            this.sceneManager.getScene(),
            this.sceneManager.getRenderer()
        )
        // Initialize room manager for event-driven room structure (retrieves scene from DataManager)
        this.roomManager = new RoomManager()

        // Track WorldBuild phase — opens here, closes when props complete
        const tracker = StartupEventTracker.getInstance()
        tracker.phaseStart(StartupPhase.WorldBuild, 'Building 3D environment')
        
        // Listen for props setup completion to end WorldBuild and emit SceneReady
        this.eventManager.registerEventHandler(StorePropsEventTypes.SetupCompleted, async () => {
            tracker.phaseEnd(StartupPhase.WorldBuild)
            tracker.milestone(StartupPhase.WorldBuild, 'Scene fully constructed')
            
            // Lighting upgrades automatically via SetupCompleted handler natively
            
            this.eventManager.emit(GameEventTypes.SceneReady, {})
        })

        // NOTE: Scene setup is now DEFERRED - call startSceneSetup() explicitly after controls are ready
        // This allows the user to move around while the world builds in the background

        if(window) {
            (window as any).debugListSceneObjects = this.debugListSceneObjects.bind(this);
            (window as any).toggleShelfIndices = this.toggleShelfIndices.bind(this);
        }
    }
    
    /**
     * Toggle shelf unit index display
     * Call from console: toggleShelfIndices()
     */
    public toggleShelfIndices(): void {
        // Emit event to toggle shelf unit indices
        this.eventManager.emit('store-props:toggle-shelf-indices', {})
        console.log('🔍 Shelf unit indices toggled')
    }

    /**
     * Start scene setup asynchronously - call this AFTER controls are ready
     * This allows the user to move around while the world builds in the background
     */
    public startSceneSetup(): void {
        // Use setTimeout(0) to yield to main thread before starting heavy work
        // This ensures the render loop has started and user can see/interact
        setTimeout(() => {
            this.loadEnhancedScene(this.config.environment)
        }, 0)
    }

    private async loadEnhancedScene(config: SceneCoordinatorConfig['environment'] = {}): Promise<void> {
        const tracker = StartupEventTracker.getInstance()

        // Kick off procedural material generation now, fire-and-forget.
        // RoomManager and shelf renderers will receive flat-colour fallback materials
        // immediately via getMaterial(), and upsertMaterial() will swap in the textured
        // version once the worker resolves — no blocking, no warning.
        SharedMaterialManager.getInstance().prewarm()
        
        try {
            // TODO: Skyboxmanager responds to ready event itself
            tracker.milestone(StartupPhase.WorldBuild, 'Creating sky')
            const presetName = config.skyboxPreset ?? 'aurora'
            const preset = (SkyboxPresets as any)[presetName] || SkyboxPresets.aurora
            await this.skyboxManager.applySkybox(preset)
            
        } catch (error) {
            console.warn('⚠️ Skybox loading failed:', error)
        }

        // 🏪 Props (room, shelves, games — the heavy stuff)
        tracker.milestone(StartupPhase.WorldBuild, 'Building store')
        this.requestPropsSetup()
        
    }

    private requestPropsSetup(): void {
        // Simply emit the setup request - handlers will get dependencies themselves
        this.eventManager.emit<StorePropsSetupRequestEvent>(StorePropsEventTypes.SetupRequest, {
            config: {
                enableShelves: true,
                enableGameBoxes: true,
                enableSignage: true
            }
        })
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
}
