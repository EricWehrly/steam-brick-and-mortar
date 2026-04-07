/**
 * GpuGameBoxRenderer
 * 
 * ROLE: GPU-instanced rendering of game boxes with LOD (Level of Detail) support.
 * Creates and manages instanced meshes for game box geometry and artwork textures.
 * 
 * OWNS:
 * - Game box geometry and materials
 * - InstancedLabelRenderer for text labels
 * - LOD artwork orchestrator for texture management
 * - LOD distance manager for camera-based detail switching
 * - Box instance state (positions, orientations, LOD levels)
 * 
 * RECEIVES:
 * - createGameBox(request) → Creates box instance at position
 * - addToScene(scene) → Attaches instanced meshes to scene
 * - updateLODForCamera(camera) → Adjusts detail levels based on distance
 * - dispose() → Cleans up GPU resources
 * 
 * EMITS:
 * - (none currently - pure rendering)
 * 
 * DELEGATES TO:
 * - InstancedLabelRenderer: Text label rendering on boxes
 * - LodArtworkOrchestratorDebug: Texture loading and LOD management
 * - LodDistanceManagerDebug: Camera distance calculations
 * 
 * DOES NOT:
 * - Know about shelves or layout (receives positions)
 * - Decide which games to display (told what to render)
 * - Handle batch processing (receives individual requests)
 * 
 * RELATED:
 * - GameBoxSpawner: Coordinates game placement and calls this renderer
 * - SharedPropsUtils: Game box dimensions and layout constants
 */

import * as THREE from 'three'
import type { SteamGameData } from './types/GameData'
import type {
    GameBoxDimensions,
    GameBoxTextureOptions
} from './types/GameBoxOptions'
import { InstancedLabelRenderer } from './instancing/InstancedLabelRenderer'
import { LOD_LEVEL, LOD_TIER_NAME, type LodLevel } from './instancing/ILodArtworkRenderer'
import type { ILodArtworkRendererDebug } from './instancing/ILodArtworkRenderer'
import { LodArtworkOrchestratorDebug, type LodConfig } from './instancing/LodArtworkOrchestratorDebug'
import { LodDistanceManagerDebug } from './instancing/LodDistanceManagerDebug'
import { ShelfSide } from '../props/SharedPropsUtils'
import { AppSettings, Setting } from '../../core/AppSettings'
import { EventManager } from '../../core/EventManager'
import { GameEventTypes } from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'
import type { IGameBoxRenderer, GameBoxRequest } from '../IGameBoxRenderer'

// Steam capsule source dimensions (what CDN claims, though actual is ~460×690)
const STEAM_SOURCE_WIDTH = 600
const STEAM_SOURCE_HEIGHT = 900

export class GpuGameBoxRenderer implements IGameBoxRenderer {
    public static logger = Logger.createLogFunctions(GpuGameBoxRenderer.name)

    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.3,   // 30cm width
        height: 0.4,  // 40cm height 
        depth: 0.08   // 8cm depth
    }

    private readonly dimensions: GameBoxDimensions
    private readonly instancedLabelRenderer: InstancedLabelRenderer
    private readonly lodArtworkRenderer: ILodArtworkRendererDebug
    private readonly lodDistanceManager: LodDistanceManagerDebug

    constructor(maxGames: number = 2000) {
        this.dimensions = { ...GpuGameBoxRenderer.DEFAULT_DIMENSIONS }
        
        GpuGameBoxRenderer.logger.debug(`Constructor: using LOD atlas (max ${maxGames})`)
        
        // Create label renderer (fallback for missing/failed artwork)
        this.instancedLabelRenderer = new InstancedLabelRenderer({
            maxInstances: maxGames
        })
        
        // Create LOD artwork renderer with settings-based configuration
        const lodConfigs = this.buildLodConfigsFromSettings()
        const maxHighSlots = AppSettings.get(Setting.LodMaxHighSlots)
        
        this.lodArtworkRenderer = new LodArtworkOrchestratorDebug({
            maxTextures: maxGames,
            maxGames,
            lazyHighTextures: true,  // Memory optimization: load HIGH textures on demand
            boxWidth: this.dimensions.width,
            boxHeight: this.dimensions.height,
            boxDepth: this.dimensions.depth,
            lodConfigs,
            maxHighTextureCache: maxHighSlots
        })
        
        // Create distance manager for automatic LOD switching
        this.lodDistanceManager = new LodDistanceManagerDebug(this.lodArtworkRenderer)

        // Start LOD distance checks once all batches have loaded
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            this.onAllBatchesComplete.bind(this)
        )
        
        GpuGameBoxRenderer.logger.lifecycle(`LOD atlas initialized (max ${maxGames}, HIGH slots: ${maxHighSlots}, lazy HIGH enabled)`)
    }

    
    /**
     * Create game box (legacy interface - delegates to createGameBoxAuto)
     * @deprecated Use createGameBoxAuto() or createGameBoxFromUrl() directly
     */
    public createGameBox(
        game: SteamGameData,
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        _textureOptions?: GameBoxTextureOptions,
        _name?: string,
        side: ShelfSide = ShelfSide.Front
    ): THREE.Mesh | null {
        this.createGameBoxAuto(game, position, side)
        return null
    }

    /**
     * Create game box with artwork by URL - entire fetch+process happens in worker
     * This is the preferred path - keeps main thread completely free
     */
    public createGameBoxFromUrl(
        game: SteamGameData,
        position: THREE.Vector3,
        artworkUrl: string,
        side: ShelfSide = ShelfSide.Front,
        rotation?: THREE.Quaternion
    ): void {
        GpuGameBoxRenderer.logger.debug(`[LOD] Loading artwork for "${game.name}"`)
        
        this.lodArtworkRenderer.setArtworkInstanceFromUrl(
            position,
            game.name,
            artworkUrl,
            typeof game.appid === 'number' ? game.appid : undefined,
            rotation
        ).then((result) => {
            if (!result.success && AppSettings.get(Setting.EnableLabels)) {
                this.createLabelGameBox(game, position, side, rotation)
            }
        }).catch((error) => {
            if (!(error instanceof Error && error.message.includes('Maximum'))) {
                GpuGameBoxRenderer.logger.debug(`Artwork fetch failed for "${game.name}": ${error}`)
            }
            if (AppSettings.get(Setting.EnableLabels)) {
                this.createLabelGameBox(game, position, side, rotation)
            }
        })
    }
    
    /**
     * Create game box with just a label (no artwork)
     */
    public createLabelGameBox(
        game: SteamGameData,
        position: THREE.Vector3,
        side: ShelfSide = ShelfSide.Front,
        rotation?: THREE.Quaternion
    ): void {
        const success = this.instancedLabelRenderer.addLabelInstance(
            position,
            game.name,
            side,
            rotation
        )
        
        if (!success) {
            GpuGameBoxRenderer.logger.debug(`Failed to add label box for "${game.name}"`)
        }
    }
    
    /**
     * Create game box with automatic artwork/label decision
     * This is the preferred entry point - consolidates artwork decision here
     */
    public createGameBoxAuto(
        game: SteamGameData,
        position: THREE.Vector3,
        side: ShelfSide = ShelfSide.Front,
        rotation?: THREE.Quaternion
    ): void {
        const artworkUrl = this.selectBestArtworkUrl(game)
        
        GpuGameBoxRenderer.logger.debug(`createGameBoxAuto "${game.name}": artwork=${!!artworkUrl}`)
        
        if (artworkUrl) {
            this.createGameBoxFromUrl(game, position, artworkUrl, side, rotation)
        } else if (AppSettings.get(Setting.EnableLabels)) {
            this.createLabelGameBox(game, position, side, rotation)
        }
    }
    
    /**
     * Select best artwork URL from game metadata
     * Prioritizes portrait format (library_600x900.jpg) for consistent LOD rendering
     */
    private selectBestArtworkUrl(game: SteamGameData): string | undefined {
        // Priority 1: Use library URL from metadata (portrait format - ideal for game boxes)
        if (game.artwork?.library) {
            return game.artwork.library
        }
        
        // Priority 2: Use header URL from metadata (landscape - fallback)
        if (game.artwork?.header) {
            return game.artwork.header
        }
        
        // Priority 3: Construct portrait URL as last resort
        // Only fire if game has an artwork object — if artwork is explicitly absent,
        // the caller wants label-only rendering (e.g. demo/test fixtures).
        if (game.appid) {
            GpuGameBoxRenderer.logger.debug(`No artwork URLs in metadata for "${game.name}" - using constructed URL`)
            return `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
        }
        
        return undefined
    }

    public createBatchGameBoxes(requests: GameBoxRequest[]): THREE.Mesh[] {
        requests.forEach(request => {
            this.createGameBoxAuto(
                request.game,
                request.position,
                request.side
            )
        })
        
        return []
    }

    public hasInstancedLabelRenderer(): boolean {
        return this.instancedLabelRenderer.isReady()
    }

    public getDimensions(): GameBoxDimensions {
        return { ...this.dimensions }
    }

    private onAllBatchesComplete(): void {
        this.lodDistanceManager.syncInstances()
        this.lodDistanceManager.startAutoUpdate()
        GpuGameBoxRenderer.logger.lifecycle('LOD distance manager started after all batches complete')
    }

    public dispose(): void {
        GpuGameBoxRenderer.logger.lifecycle('Disposing')
        
        this.lodDistanceManager.dispose()
        this.instancedLabelRenderer.dispose()
        this.lodArtworkRenderer.dispose()
        
        // Remove global reference if present
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).lodArtworkRenderer = null
        
        GpuGameBoxRenderer.logger.lifecycle('Disposed')
    }
    
    /**
     * Set global LOD level for all artwork instances
     */
    public setGlobalLod(lodLevel: LodLevel): void {
        this.lodArtworkRenderer.setGlobalLod(lodLevel)
    }
    
    /**
     * Get the LOD renderer for advanced control
     */
    public getLodRenderer(): ILodArtworkRendererDebug {
        return this.lodArtworkRenderer
    }
    
    /**
     * Get memory stats
     */
    public getMemoryStats() {
        return this.lodArtworkRenderer.getMemoryStats()
    }
    
    /**
     * Log memory stats to console
     */
    public logMemoryStats(): void {
        this.lodArtworkRenderer.logMemoryStats()
    }
    
    /**
     * Build LOD configs from AppSettings
     * This allows user to control texture resolutions and VRAM usage
     */
    private buildLodConfigsFromSettings(): LodConfig[] {
        const highRatio = AppSettings.get(Setting.LodHighReductionRatio)
        const medRatio = AppSettings.get(Setting.LodMedReductionRatio)
        const maxHighSlots = AppSettings.get(Setting.LodMaxHighSlots)
        
        // Calculate dimensions from ratios
        const highWidth = Math.floor(STEAM_SOURCE_WIDTH * highRatio)
        const highHeight = Math.floor(STEAM_SOURCE_HEIGHT * highRatio)
        const medWidth = Math.floor(STEAM_SOURCE_WIDTH * medRatio)
        const medHeight = Math.floor(STEAM_SOURCE_HEIGHT * medRatio)
        
        GpuGameBoxRenderer.logger.info(`LOD config: HIGH ${highWidth}×${highHeight} (${maxHighSlots} slots), MED ${medWidth}×${medHeight}`)
        
        return [
            { level: LOD_LEVEL.HIGH, textureWidth: highWidth, textureHeight: highHeight, name: LOD_TIER_NAME.HIGH, maxDepth: maxHighSlots },
            { level: LOD_LEVEL.MID, textureWidth: medWidth, textureHeight: medHeight, name: LOD_TIER_NAME.MID }
        ]
    }
}
