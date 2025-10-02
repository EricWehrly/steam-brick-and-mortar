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
import { GameEventTypes, CeilingEventTypes, SteamEventTypes, type CeilingToggleEvent, type SceneReadyEvent, type SteamDataLoadedEvent } from '../types/InteractionEvents'
import { AppSettings } from '../core/AppSettings'
import { SteamIntegration } from '../steam-integration/SteamIntegration'

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
    private steamIntegration?: SteamIntegration

    constructor(sceneManager: SceneManager, config: SceneCoordinatorConfig = {}, steamIntegration?: SteamIntegration) {
        this.sceneManager = sceneManager
        this.appSettings = AppSettings.getInstance()
        this.steamIntegration = steamIntegration
        
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

        // Register for Steam data loaded events to spawn dynamic shelves
        EventManager.getInstance().registerEventHandler(SteamEventTypes.DataLoaded, (event: CustomEvent<SteamDataLoadedEvent>) => {
            this.onSteamDataLoaded(event.detail)
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

    /**
     * Handle Steam data loaded event by spawning dynamic shelves based on game count
     */
    private async onSteamDataLoaded(eventData: SteamDataLoadedEvent): Promise<void> {
        console.log(`🎮 Steam data loaded: ${eventData.gameCount} games for user ${eventData.userInput}`)
        
        // Analyze all available taxonomies from the loaded games
        this.analyzeTaxonomies(eventData)
        
        try {
            await this.spawnDynamicShelves(eventData.gameCount)
        } catch (error) {  
            console.error('❌ Failed to spawn dynamic shelves:', error)
        }
    }

    /**
     * Analyze all available taxonomies from loaded Steam game data
     */
    private analyzeTaxonomies(eventData: SteamDataLoadedEvent): void {
        console.log(`\n📊 === TAXONOMY ANALYSIS FOR ${eventData.gameCount} GAMES ===`)
        
        // Try to access actual game data from injected steamIntegration
        let games: any[] = []
        
        if (this.steamIntegration) {
            games = this.steamIntegration.getGamesForScene()
            console.log(`✅ Retrieved ${games.length} games for detailed analysis`)
        // }else {
        //     // Fallback: try to access via global app instance
        //     // @ts-ignore - accessing global for game data when direct reference not available
        //     const globalApp = (window as any).steamBrickAndMortarApp
        //     if (globalApp?.steamIntegration) {
        //         games = globalApp.steamIntegration.getGamesForScene()
        //         console.log(`✅ Retrieved ${games.length} games via global access`)
        //     } else {
        //         console.log(`⚠️ No SteamIntegration available - using event data only`)
        //     }
} else { console.log(`⚠️ No SteamIntegration available - using event data only`)
        }
        
        if (games.length > 0) {
            this.analyzeActualGameData(games, eventData)
        } else {
            this.analyzeStructuralTaxonomies(eventData)
        }
        
        console.log(`=== END TAXONOMY ANALYSIS ===\n`)
    }

    /**
     * Analyze taxonomies from actual loaded game data
     */
    private analyzeActualGameData(games: any[], eventData: SteamDataLoadedEvent): void {
        console.log(`\n🎮 ANALYZING ${games.length} LOADED GAMES:`)
        
        // Playtime-based taxonomies
        const playtimeBuckets = {
            unplayed: games.filter(g => g.playtime_forever === 0),
            lightly: games.filter(g => g.playtime_forever > 0 && g.playtime_forever < 600), // < 10 hours (in minutes)
            moderately: games.filter(g => g.playtime_forever >= 600 && g.playtime_forever < 3000), // 10-50 hours
            heavily: games.filter(g => g.playtime_forever >= 3000) // 50+ hours
        }
        
        console.log(`� PLAYTIME CATEGORIES for your ${games.length} games:`)
        console.log(`   • Unplayed: ${playtimeBuckets.unplayed.length} games`)
        console.log(`   • Lightly Played (< 10h): ${playtimeBuckets.lightly.length} games`)
        console.log(`   • Moderately Played (10-50h): ${playtimeBuckets.moderately.length} games`)
        console.log(`   • Heavily Played (50h+): ${playtimeBuckets.heavily.length} games`)
        
        // Recent activity taxonomies
        const recentlyPlayed = games.filter(g => g.playtime_2weeks && g.playtime_2weeks > 0)
        const notRecentlyPlayed = games.filter(g => !g.playtime_2weeks || g.playtime_2weeks === 0)
        
        console.log(`\n⏰ RECENT ACTIVITY for your ${games.length} games:`)
        console.log(`   • Recently Played (last 2 weeks): ${recentlyPlayed.length} games`)
        console.log(`   • Not Recently Played: ${notRecentlyPlayed.length} games`)
        
        // Name-based pattern analysis
        const namePatterns = this.analyzeGameNames(games)
        
        console.log(`\n🏷️ NAME-BASED PATTERNS found in your ${games.length} games:`)
        if (Object.keys(namePatterns.series).length > 0) {
            console.log(`   • Detected Game Series:`)
            Object.entries(namePatterns.series).forEach(([series, gameList]) => {
                console.log(`     - ${series}: ${(gameList as any[]).length} games - [${(gameList as any[]).map(g => g.name).join(', ')}]`)
            })
        }
        
        if (namePatterns.keywords.length > 0) {
            console.log(`   • Common Keywords: [${namePatterns.keywords.join(', ')}]`)
        }
        
        // App ID ranges (can indicate release periods/publishers)
        const appIds = games.map(g => parseInt(g.appid))
        const minAppId = Math.min(...appIds)
        const maxAppId = Math.max(...appIds)
        
        console.log(`\n🆔 APP ID RANGES for your ${games.length} games:`)
        console.log(`   • Oldest game (lowest ID): ${minAppId}`)
        console.log(`   • Newest game (highest ID): ${maxAppId}`)
        console.log(`   • Could group by ID ranges to approximate release eras`)
        
        // List some example games for context
        console.log(`\n📋 SAMPLE GAMES (first 5):`)
        games.slice(0, 5).forEach(game => {
            const hours = Math.round(game.playtime_forever / 60 * 10) / 10
            const recentHours = game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0
            console.log(`   • "${game.name}" - ${hours}h total, ${recentHours}h recent (ID: ${game.appid})`)
        })
    }

    /**
     * Analyze structural taxonomies when no game data is available
     */
    private analyzeStructuralTaxonomies(eventData: SteamDataLoadedEvent): void {
        console.log(`🔍 CURRENT DATA AVAILABLE:`)
        console.log(`   • Game Count: ${eventData.gameCount} total games`)
        console.log(`   • User Input: "${eventData.userInput}"`)
        console.log(`   • Event Timestamp: ${new Date(eventData.timestamp).toISOString()}`)
        
        // console.log(`\n❌ MISSING TAXONOMY DATA (would require API expansion):`)
        // console.log(`   • Steam Store Genres: Action, Adventure, RPG, Strategy, etc.`)
        // console.log(`   • Steam Store Categories: Single-player, Multiplayer, Co-op, etc.`)
        // console.log(`   • Community Tags: Horror, Atmospheric, Pixel Art, Roguelike, etc.`)
        // console.log(`   • Release Date: For chronological categorization`)
        // console.log(`   • Developer/Publisher: For studio-based organization`)
        // console.log(`   • User Reviews: For quality/popularity-based sorting`)
        
        // console.log(`\n💡 RECOMMENDED IMPLEMENTATION:`)
        // console.log(`   1. Expand Steam API lambda to include genres/categories`)
        // console.log(`   2. Add Steam Store API calls for detailed metadata`)
        // console.log(`   3. Implement community tag fetching`)
        // console.log(`   4. Create fallback categorization from playtime data`)
    }

    /**
     * Analyze game names for series and keyword patterns
     */
    private analyzeGameNames(games: any[]): { series: Record<string, any[]>, keywords: string[] } {
        const series: Record<string, any[]> = {}
        const keywords: string[] = []
        const keywordCounts: Record<string, number> = {}
        
        // Common series patterns
        const seriesPatterns = [
            /^(Half-Life|Portal|Counter-Strike|Team Fortress|Left 4 Dead|Dota|The Elder Scrolls|Fallout|Call of Duty|Assassin's Creed|Grand Theft Auto|Civilization|Total War)/i,
        ]
        
        // Common keyword patterns
        const keywordPatterns = [
            /Simulator/i, /Tycoon/i, /Racing/i, /RPG/i, /Strategy/i, /Adventure/i,
            /Puzzle/i, /Action/i, /Indie/i, /Survival/i, /Horror/i, /Fantasy/i
        ]
        
        games.forEach(game => {
            const name = game.name
            
            // Check for series
            seriesPatterns.forEach(pattern => {
                const match = name.match(pattern)
                if (match) {
                    const seriesName = match[1]
                    if (!series[seriesName]) series[seriesName] = []
                    series[seriesName].push(game)
                }
            })
            
            // Check for keywords
            keywordPatterns.forEach(pattern => {
                const match = name.match(pattern)
                if (match) {
                    const keyword = match[0]
                    keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1
                }
            })
        })
        
        // Only include keywords that appear multiple times
        const commonKeywords = Object.entries(keywordCounts)
            .filter(([, count]) => count >= 2)
            .map(([keyword]) => keyword)
        
        return { series, keywords: commonKeywords }
    }

    /**
     * Spawn shelves dynamically based on game count
     */
    private async spawnDynamicShelves(gameCount: number): Promise<void> {
        console.log(`📚 Spawning dynamic shelves for ${gameCount} games`)
        
        const gamesPerShelf = 6 // Default games per shelf (configurable)
        const shelvesNeeded = Math.ceil(gameCount / gamesPerShelf)
        
        console.log(`📊 Calculated: Need ${shelvesNeeded} shelves for ${gameCount} games (${gamesPerShelf} games per shelf)`)
        
        try {
            // Get actual game data for shelf spawning
            let games: any[] = []
            
            if (this.steamIntegration) {
                games = this.steamIntegration.getGamesForScene()
                console.log(`✅ Retrieved ${games.length} games for dynamic shelf spawning`)
            } else {
                // Fallback: try to access via global app instance
                // @ts-ignore - accessing global for game data when direct reference not available
                const globalApp = (window as any).steamBrickAndMortarApp
                if (globalApp?.steamIntegration) {
                    games = globalApp.steamIntegration.getGamesForScene()
                    console.log(`✅ Retrieved ${games.length} games via global access`)
                } else {
                    console.log(`⚠️ No SteamIntegration available - using placeholder boxes`)
                }
            }
            
            // Call propsRenderer to create shelves and place games
            await this.propsRenderer.spawnDynamicShelvesWithGames(shelvesNeeded, gameCount, games)
            console.log(`✅ Dynamic shelf spawning completed successfully`)
        } catch (error) {
            console.error('❌ Failed to spawn dynamic shelves:', error)
            // Don't throw - let the system continue without dynamic shelves
        }
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
