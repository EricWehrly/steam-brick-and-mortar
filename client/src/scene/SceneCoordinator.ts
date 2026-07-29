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
import { SkyboxManager } from './SkyboxManager'
import { LightingRenderer } from './LightingRenderer'
import { RoomManager } from './RoomManager'
import { EventManager } from '../core/EventManager'
import { DataManager } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'
import { StartupEventTracker, StartupPhase } from '../utils/StartupEventTracker'
import { SharedMaterialManager } from '../utils/SharedMaterialManager'
import { SceneSignManager } from './SceneSignManager'
import { ShelfSignPlanner } from './ShelfSignPlanner'
import { LiminalWindowCoordinator } from './liminal/LiminalWindowCoordinator'
import { LiminalBoundaryTracker } from './liminal/LiminalBoundaryTracker'
import { GameSorter } from './categorization/GameSorter'
import type { BootstrapPath } from './bootstrap/BootstrapPath'
import { DefaultBootstrapPath } from './bootstrap/DefaultBootstrapPath'
import { ShowcaseBootstrapPath } from './bootstrap/ShowcaseBootstrapPath'
import { StorePropsEventTypes } from './props'
import { GameEventTypes } from '../types/InteractionEvents'

export class SceneCoordinator {
    private sceneManager: SceneManager
    private skyboxManager: SkyboxManager
    private lightingRenderer: LightingRenderer
    private roomManager: RoomManager
    private dataManager: DataManager
    private gameSorter: GameSorter
    private sceneSignManager: SceneSignManager
    private shelfSignPlanner: ShelfSignPlanner
    private liminalWindowCoordinator: LiminalWindowCoordinator
    private liminalBoundaryTracker: LiminalBoundaryTracker

    constructor(sceneManager?: SceneManager) {
        // TODO: DI tho?
        this.sceneManager = sceneManager ?? new SceneManager()
        this.dataManager = DataManager.getInstance() // Fallback for backward compatibility

        // Store props runtime coordinators are activated explicitly by the default bootstrap path.
        
        // Initialize visual system renderers
        this.skyboxManager = new SkyboxManager()
        this.lightingRenderer = new LightingRenderer(
            this.sceneManager.getScene(),
            this.sceneManager.getRenderer()
        )
        // Initialize room manager for event-driven room structure (retrieves scene from DataManager)
        this.roomManager = new RoomManager()
        this.gameSorter = new GameSorter()
        this.sceneSignManager = SceneSignManager.instance
        this.shelfSignPlanner = new ShelfSignPlanner()
        this.liminalWindowCoordinator = new LiminalWindowCoordinator()
        this.liminalBoundaryTracker = new LiminalBoundaryTracker()

        // Track WorldBuild phase — opens here, closed by each bootstrap path when done
        const tracker = StartupEventTracker.getInstance()
        tracker.phaseStart(StartupPhase.WorldBuild, 'Building 3D environment')

        // NOTE: Scene setup is now DEFERRED - call startSceneSetup() explicitly after controls are ready
        // This allows the user to move around while the world builds in the background

        if(window) {
            (window as any).debugListSceneObjects = this.debugListSceneObjects.bind(this);
        }
    }
    
    /**
     * Start scene setup asynchronously - call this AFTER controls are ready
     * This allows the user to move around while the world builds in the background
     */
    public startSceneSetup(): void {
        // yo do an event registration instead?
        // Use setTimeout(0) to yield to main thread before starting heavy work
        // This ensures the render loop has started and user can see/interact
        setTimeout(() => {
            this.executeBootstrapPath()
        }, 0)
    }

    // TODO: I had wanted showcase to be an alternate scene with alternate logic, but
    // we're creating this explicit bifrocation of loaders that I would prefer be instruction of loaders instead ... eventually
    private async executeBootstrapPath(): Promise<void> {
        const SHOWCASE_MODE_ENABLED = false
        
        const bootstrapPath: BootstrapPath = SHOWCASE_MODE_ENABLED 
            ? new ShowcaseBootstrapPath()
            : new DefaultBootstrapPath()
        
        const eventManager = EventManager.getInstance();
        const tracker = StartupEventTracker.getInstance()

        eventManager.registerEventHandler(StorePropsEventTypes.SetupCompleted, () => {
            tracker.phaseEnd(StartupPhase.WorldBuild)
            tracker.milestone(StartupPhase.WorldBuild, 'Scene fully constructed')
            eventManager.emit(GameEventTypes.SceneReady, {})
        })
        await bootstrapPath.execute()
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
        this.shelfSignPlanner.dispose()
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
