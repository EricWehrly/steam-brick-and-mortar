// TD: legacy-atlas-removal
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
 * - LodArtworkOrchestratorDebug: Texture loading, LOD management, devtools console commands
 * - LodDistanceManagerDebug: Camera distance calculations, LOD distribution diagnostics
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
import type { ILodArtworkRenderer } from './instancing/ILodArtworkRenderer'
import { LodArtworkOrchestratorDebug, type LodConfig } from './instancing/LodArtworkOrchestratorDebug'
import { LodDistanceManagerDebug } from './instancing/LodDistanceManagerDebug'
import { ShelfSide } from '../props/SharedPropsUtils'
import { AppSettings, Setting } from '../../core/AppSettings'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import { StorePropsEventTypes, type GameBoxSpawnedEvent } from '../../types/InteractionEvents'
import type { IGameBoxRenderer, GameBoxRequest } from '../IGameBoxRenderer'

// Steam capsule source dimensions (what CDN claims, though actual is ~460×690)
/**
 * Steam library image CDN reality check
 *
 * The URL path is `library_600x900.jpg` but the CDN actually serves 300×450 pixels
 * for the vast majority of titles (older games that were never re-uploaded at full
 * resolution). Only a minority of newer titles genuinely ship at 600×900.
 *
 * Source: https://steamcommunity.com/discussions/forum/1/4202490864582293420/
 * Quote: "the ones that appear in librarycache are labelled as 600x900
 *          but are 300x450px big."
 *
 * NORMALIZATION DECISION: we treat 300×450 as the effective source ceiling.
 * Going above it with lodHighReductionRatio > 0.5 produces bilinear upscaling
 * artefacts and wastes VRAM. Going to exactly 0.5 gives 1:1 pixels for most
 * games, which is the true maximum fidelity available.
 *
 * If you change this, read the comment above first.
 */
const STEAM_SOURCE_WIDTH = 600   // Nominal — see comment above
const STEAM_SOURCE_HEIGHT = 900  // Nominal — see comment above
const STEAM_EFFECTIVE_MAX_WIDTH = 300   // Actual CDN resolution (majority of titles)
const STEAM_EFFECTIVE_MAX_HEIGHT = 450  // Actual CDN resolution (majority of titles)

export class GpuGameBoxRenderer implements IGameBoxRenderer {
    public static logger = Logger.createLogFunctions(GpuGameBoxRenderer.name)

    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.3,   // 30cm width
        height: 0.4,  // 40cm height 
        depth: 0.08   // 8cm depth
    }

    private readonly dimensions: GameBoxDimensions
    private readonly instancedLabelRenderer: InstancedLabelRenderer
    private readonly lodArtworkRenderer: ILodArtworkRenderer
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

        // Self-subscribe: renderer owns the GameBoxSpawned → createGameBoxAuto wiring.
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.GameBoxSpawned,
            this.handleGameBoxSpawned.bind(this)
        )
        
        GpuGameBoxRenderer.logger.lifecycle(`LOD atlas initialized (max ${maxGames}, HIGH slots: ${maxHighSlots}, lazy HIGH enabled)`)
    }

    private handleGameBoxSpawned(event: CustomEvent<GameBoxSpawnedEvent>): void {
        const { game, position, side, rotation } = event.detail
        this.createGameBoxAuto(
            game as SteamGameData,
            position as THREE.Vector3,
            side as ShelfSide,
            rotation as THREE.Quaternion
        )
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
            if (!result.success) {
                GpuGameBoxRenderer.logger.debug(`Artwork not placed for "${game.name}" — no fallback label`)
            }
        }).catch((error) => {
            if (!(error instanceof Error && error.message.includes('Maximum'))) {
                GpuGameBoxRenderer.logger.debug(`Artwork fetch failed for "${game.name}": ${error}`)
            }
        })
    }
    
    public createLabelGameBox(
        game: SteamGameData,
        position: THREE.Vector3,
        side: ShelfSide = ShelfSide.Front,
        rotation?: THREE.Quaternion
    ): void {
        const success = this.instancedLabelRenderer.addLabelInstance(
            position,
            game.name,
            typeof game.appid === 'number' ? game.appid : undefined,
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
        } else {
            GpuGameBoxRenderer.logger.debug(`No artwork URL for "${game.name}" — game will not materialize`)
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
        if (game.appid) {
            GpuGameBoxRenderer.logger.debug(`No artwork URLs in metadata for "${game.name}" - using constructed URL`)
            return `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
        }
        
        return undefined
    }

    public createBatchGameBoxes(requests: GameBoxRequest[]) {
        requests.forEach(request => {
            this.createGameBoxAuto(
                request.game,
                request.position,
                request.side
            )
        })
    }

    public getDimensions(): GameBoxDimensions {
        return { ...this.dimensions }
    }

    public dispose(): void {
        GpuGameBoxRenderer.logger.lifecycle('Disposing')
        
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.GameBoxSpawned,
            this.handleGameBoxSpawned.bind(this)
        )

        this.lodDistanceManager.dispose()
        this.instancedLabelRenderer.dispose()
        this.lodArtworkRenderer.dispose()
        
        // Remove global reference if present
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).lodArtworkRenderer = null
        
        GpuGameBoxRenderer.logger.lifecycle('Disposed')
    }
    
    /**
     * Build LOD configs from AppSettings
     * This allows user to control texture resolutions and VRAM usage
     */
    private buildLodConfigsFromSettings(): LodConfig[] {
        const highRatio = AppSettings.get(Setting.LodHighReductionRatio)
        const medRatio = AppSettings.get(Setting.LodMedReductionRatio)
        const maxHighSlots = AppSettings.get(Setting.LodMaxHighSlots)
        
        // Calculate dimensions from ratios, then clamp HIGH to the effective CDN ceiling.
        // Most Steam library images are physically 300×450 despite the "600x900" URL path.
        // Requesting above that produces bilinear upscaling artefacts, not extra detail.
        // See STEAM_EFFECTIVE_MAX_WIDTH/HEIGHT for the source and rationale.
        const highWidthRaw = Math.floor(STEAM_SOURCE_WIDTH * highRatio)
        const highHeightRaw = Math.floor(STEAM_SOURCE_HEIGHT * highRatio)
        const highWidth = Math.min(highWidthRaw, STEAM_EFFECTIVE_MAX_WIDTH)
        const highHeight = Math.min(highHeightRaw, STEAM_EFFECTIVE_MAX_HEIGHT)
        const medWidth = Math.floor(STEAM_SOURCE_WIDTH * medRatio)
        const medHeight = Math.floor(STEAM_SOURCE_HEIGHT * medRatio)

        if (highWidthRaw > STEAM_EFFECTIVE_MAX_WIDTH || highHeightRaw > STEAM_EFFECTIVE_MAX_HEIGHT) {
            GpuGameBoxRenderer.logger.warn(
                `LOD HIGH ratio ${highRatio} would produce ${highWidthRaw}×${highHeightRaw} ` +
                `— clamped to ${highWidth}×${highHeight} (CDN effective max). ` +
                `Upscaling above this wastes VRAM without adding detail for most titles.`
            )
        }
        
        GpuGameBoxRenderer.logger.info(`LOD config: HIGH ${highWidth}×${highHeight} (${maxHighSlots} slots), MED ${medWidth}×${medHeight}`)
        
        return [
            { level: LOD_LEVEL.HIGH, textureWidth: highWidth, textureHeight: highHeight, tierName: LOD_TIER_NAME.HIGH, name: LOD_TIER_NAME.HIGH, maxDepth: maxHighSlots },
            { level: LOD_LEVEL.MID, textureWidth: medWidth, textureHeight: medHeight, tierName: LOD_TIER_NAME.MID, name: LOD_TIER_NAME.MID }
        ]
    }
}
