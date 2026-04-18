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
 * - prefetchArtwork(appid, url, name) → Phase 1: load texture into atlas
 * - placeArtworkInstance(appid, name, position) → Phase 2: stamp artwork GPU instance
 * - placeLabelBox(game, position, side) → Phase 2: stamp label GPU instance
 * - clearPlacements() → wipe all GPU instances before re-sort
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
 * - Decide whether a game gets artwork or a label — that is GameBoxSpawner's job
 * - Select or construct artwork URLs from game metadata
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
import { LOD_LEVEL, LOD_TIER_NAME, type LodLevel } from './instancing/IGameArtworkPipeline'
import type { IGameArtworkPipeline } from './instancing/IGameArtworkPipeline'
import { LodArtworkOrchestratorDebug, type LodConfig } from './instancing/LodArtworkOrchestratorDebug'
import { LodDistanceManagerDebug } from './instancing/LodDistanceManagerDebug'
import { ShelfSide } from '../props/SharedPropsUtils'
import { AppSettings, Setting } from '../../core/AppSettings'
import { Logger } from '../../utils/Logger'
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
    private readonly lodArtworkRenderer: IGameArtworkPipeline
    private readonly lodDistanceManager: LodDistanceManagerDebug

    constructor(maxGames: number = 2000) {
        this.dimensions = { ...GpuGameBoxRenderer.DEFAULT_DIMENSIONS }
        
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

        GpuGameBoxRenderer.logger.lifecycle(`LOD atlas initialized (max ${maxGames}, HIGH slots: ${maxHighSlots}, lazy HIGH enabled)`)
    }

    /**
     * Phase 1: fetch and cache artwork for a game without placing a GPU instance.
     * Call as batches arrive. Idempotent — calling again for the same game is a no-op.
     *
     * Callers are responsible for resolving the artwork URL and for deciding whether
     * this game should get artwork at all. Pass the resolved URL directly.
     */
    public async prefetchArtwork(
        appid: number,
        artworkUrl: string,
        gameName: string
    ): Promise<'prefetched' | 'cached' | 'permanent-failure' | 'error'> {
        return this.lodArtworkRenderer.prefetchArtwork(appid, artworkUrl, gameName)
    }

    /**
     * Phase 2a: materialise a previously prefetched artwork texture at a world position.
     * Returns the GPU instance index, or -1 if the texture is not in the atlas.
     */
    public placeArtworkInstance(
        appid: number,
        gameName: string,
        position: THREE.Vector3,
        rotation?: THREE.Quaternion
    ): number {
        return this.lodArtworkRenderer.placeInstance(appid, gameName, position, rotation)
    }

    /**
     * Phase 2b: place a text-label box at a world position.
     * No artwork fetch is triggered. This is a pure GPU-instancing call.
     */
    public placeLabelBox(
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
     * Clear all GPU instance placements without releasing texture atlas slots.
     * Call before re-sorting; follow with placeArtworkInstance()/placeLabelBox() for each game.
     */
    public clearPlacements(): void {
        this.lodArtworkRenderer.clearPlacements()
        this.instancedLabelRenderer.clear()
    }

    /** @deprecated Use the two-phase prewarm/place flow via GameBoxSpawner instead. */
    public createBatchGameBoxes(_requests: GameBoxRequest[]): void {
        GpuGameBoxRenderer.logger.warn('createBatchGameBoxes called — this legacy path is no longer supported. Use GameBoxSpawner.')
    }

    public getDimensions(): GameBoxDimensions {
        return { ...this.dimensions }
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




