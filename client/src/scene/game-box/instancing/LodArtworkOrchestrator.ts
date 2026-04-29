/**
 * LOD Artwork Orchestrator - Coordinates artwork loading pipeline
 *
 * This orchestrator wires together:
 * - GameArtworkProvider: URL strategy and fetch coordination
 * - LodTextureArrayManager: Texture array creation and population
 * - LodGameArtworkRenderer: GPU rendering with LOD support
 *
 * Provides the primary API for game artwork loading (setArtworkInstanceFromUrl)
 * and implements IGameArtworkPipeline for consumers like LodDistanceManager.
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { EventManager } from '../../../core/EventManager'
import {
    GameEventTypes,
    GameRenderEventTypes,
    AppEventTypes,
    type PlacementRunResetRequestedEvent,
} from '../../../types/InteractionEvents'
import type { VisibilityChangedEvent } from '../../../types/InteractionEvents'
import type { SomeBatchesCompleteEvent } from '../../../types/EnvironmentEvents'
import { Logger } from '../../../utils/Logger'
import { AppSettings, Setting } from '../../../core/AppSettings'
import { GameArtworkProvider, type GameArtwork } from './GameArtworkProvider'
import { LodTextureArrayManager, type LodTierConfig } from './LodTextureArrayManager'
import {
    LodGameArtworkRenderer,
    LOD_LEVEL,
    type LodLevel,
    type LodGameArtworkRendererConfig,
} from './LodGameArtworkRenderer'
import { LOD_TIER_NAME, type InstanceLodData, type IGameArtworkPipeline } from './IGameArtworkPipeline'
import {
    buildRuntimeTierSpecs,
    findTierByLevel,
    getDefaultLodTierSpecs,
    type LodTierSpec,
    type RendererTextureSources,
} from './LodTypes'
import type { PrewarmingConfig } from './SpatialPrewarmingManager'
import type { InstanceMetadata } from '../../../debug/GameFinder'

// Class-scoped logger will be attached to the class

// Re-export for backward compatibility
export { LOD_LEVEL, LOD_TIER_NAME, type LodLevel }

/** Steam library capsule dimensions */
export const STEAM_CAPSULE_WIDTH = 300
export const STEAM_CAPSULE_HEIGHT = 450

export const DEFAULT_BOX_WIDTH = 0.2
export const DEFAULT_BOX_HEIGHT = 0.3

export const DEFAULT_LOD_CONFIGS: LodTierSpec[] = getDefaultLodTierSpecs().map(spec => ({
    ...spec,
    textureWidth: spec.level === LOD_LEVEL.HIGH ? STEAM_CAPSULE_WIDTH : spec.textureWidth,
    textureHeight: spec.level === LOD_LEVEL.HIGH ? STEAM_CAPSULE_HEIGHT : spec.textureHeight,
}))

/** Config matching old LodArtworkConfig */
export interface LodArtworkConfig {
    maxTextures?: number
    maxInstances?: number
    lodConfigs?: LodTierSpec[]
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
    defaultLod?: LodLevel
    lazyHighTextures?: boolean
    maxHighTextureCache?: number
    prewarmingConfig?: Partial<PrewarmingConfig>
}

/**
 * Steam library image CDN reality check
 *
 * The URL path is `library_600x900.jpg` but the CDN actually serves 300×450 pixels
 * for the vast majority of titles. Only a minority of newer titles genuinely ship
 * at 600×900.
 *
 * Source: https://steamcommunity.com/discussions/forum/1/4202490864582293420/
 *
 * NORMALIZATION DECISION: treat 300×450 as the effective source ceiling.
 * Going above it produces bilinear upscaling artefacts and wastes VRAM.
 */
const STEAM_SOURCE_WIDTH = 600
const STEAM_SOURCE_HEIGHT = 900
const STEAM_EFFECTIVE_MAX_WIDTH = 300
const STEAM_EFFECTIVE_MAX_HEIGHT = 450

/**
 * Orchestrates the complete artwork loading and rendering pipeline.
 * Implements IGameArtworkPipeline for use by LodDistanceManager.
 */
export class LodArtworkOrchestrator implements IGameArtworkPipeline {
    public static logger = Logger.createLogFunctions(LodArtworkOrchestrator.name)

    /**
     * Factory: construct with LOD config derived from AppSettings.
     * Reads LodHighReductionRatio, LodMedReductionRatio, LodMaxHighSlots.
     */
    public static fromAppSettings(maxTextures: number, maxInstances: number = maxTextures): LodArtworkOrchestrator {
        return new LodArtworkOrchestrator(LodArtworkOrchestrator.buildAppSettingsConfig(maxTextures, maxInstances))
    }

    /**
     * Builds a LodArtworkConfig from AppSettings.
     * Extracted so debug subclasses can reuse it in their own fromAppSettings override.
     */
    protected static buildAppSettingsConfig(maxTextures: number, maxInstances: number = maxTextures): LodArtworkConfig {
        const highRatio = AppSettings.get(Setting.LodHighReductionRatio)
        const medRatio = AppSettings.get(Setting.LodMedReductionRatio)
        const maxHighSlots = AppSettings.get(Setting.LodMaxHighSlots)

        const highWidthRaw = Math.floor(STEAM_SOURCE_WIDTH * highRatio)
        const highHeightRaw = Math.floor(STEAM_SOURCE_HEIGHT * highRatio)
        const highWidth = Math.min(highWidthRaw, STEAM_EFFECTIVE_MAX_WIDTH)
        const highHeight = Math.min(highHeightRaw, STEAM_EFFECTIVE_MAX_HEIGHT)
        const medWidth = Math.floor(STEAM_SOURCE_WIDTH * medRatio)
        const medHeight = Math.floor(STEAM_SOURCE_HEIGHT * medRatio)

        if (highWidthRaw > STEAM_EFFECTIVE_MAX_WIDTH || highHeightRaw > STEAM_EFFECTIVE_MAX_HEIGHT) {
            LodArtworkOrchestrator.logger.warn(
                `LOD HIGH ratio ${highRatio} would produce ${highWidthRaw}×${highHeightRaw} ` +
                `— clamped to ${highWidth}×${highHeight} (CDN effective max). ` +
                `Upscaling above this wastes VRAM without adding detail for most titles.`
            )
        }

        LodArtworkOrchestrator.logger.info(`LOD config: HIGH ${highWidth}×${highHeight} (${maxHighSlots} slots), MED ${medWidth}×${medHeight}`)

        return {
            maxTextures,
            maxInstances,
            lazyHighTextures: true,
            boxWidth: 0.3,
            boxHeight: 0.4,
            boxDepth: 0.08,
            lodConfigs: [
                { level: LOD_LEVEL.HIGH, textureWidth: highWidth, textureHeight: highHeight, tierName: LOD_TIER_NAME.HIGH, name: LOD_TIER_NAME.HIGH, maxDepth: maxHighSlots },
                { level: LOD_LEVEL.MID, textureWidth: medWidth, textureHeight: medHeight, tierName: LOD_TIER_NAME.MID, name: LOD_TIER_NAME.MID },
            ],
            maxHighTextureCache: maxHighSlots,
        }
    }
    private artworkProvider: GameArtworkProvider
    private textureManager: LodTextureArrayManager
    protected renderer: LodGameArtworkRenderer

    private readonly maxTextures: number
    private readonly maxInstances: number
    private readonly lodConfigs: LodTierSpec[]
    private readonly lazyHighTextures: boolean

    // Track game names to texture indices
    // TD: Why use names and not appIds?
    private gameNameToTextureIndex: Map<string, number> = new Map()
    private textureIndexToGameName: Map<number, string> = new Map()
    private instanceMetadata: Map<number, InstanceMetadata> = new Map()

    // Track failed artwork (for backward compat)
    private failedArtwork: Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> = new Map()

    // Resolved artwork URLs for prefetched games, keyed by game name.
    // Used by placeInstance() to pass the final CDN URL to the renderer.
    private prefetchedArtworkUrl: Map<string, string> = new Map()

    // Prevent ArtworkSettled from firing before AllBatchesComplete.
    // prefetchArtwork requests can settle transiently between batch waves
    // (e.g. cached games finish before network-fetch games arrive).
    // Compact must only run after the full library's artwork opportunities are done.
    private allBatchesComplete: boolean = false

    // Prevent log spam when atlas is full
    private atlasFullLogged: boolean = false
    private inFlightArtworkCount: number = 0

    private readonly onFocusChanged: (e: CustomEvent<VisibilityChangedEvent>) => void
    private readonly boundHandlePlacementRunResetRequested: (event: CustomEvent<PlacementRunResetRequestedEvent>) => void

    constructor(config: LodArtworkConfig = {}) {
        this.maxTextures = config.maxTextures ?? 512
        this.maxInstances = config.maxInstances ?? this.maxTextures
        this.lodConfigs = config.lodConfigs ?? DEFAULT_LOD_CONFIGS
        this.lazyHighTextures = config.lazyHighTextures ?? false

        // Get singleton provider
        this.artworkProvider = GameArtworkProvider.getInstance()

        // Create texture array manager
        const runtimeSpecs = buildRuntimeTierSpecs(this.lodConfigs, this.maxTextures)
        let tierConfigs: LodTierConfig[] = runtimeSpecs.map(spec => ({
            name: spec.tierName,
            width: spec.textureWidth,
            height: spec.textureHeight,
            maxDepth: spec.maxDepth,
        }))
        
        if (this.lazyHighTextures) {
            // HighTextureCache owns the HIGH tier texture when lazy loading is enabled.
            // Do not pre-allocate it in the base texture manager.
            tierConfigs = tierConfigs.filter(c => c.name !== LOD_TIER_NAME.HIGH)
        }
        
        this.textureManager = new LodTextureArrayManager({ tiers: tierConfigs })

        // Create renderer
        const highConfig = findTierByLevel(this.lodConfigs, LOD_LEVEL.HIGH)
        const rendererConfig: LodGameArtworkRendererConfig = {
            maxInstances: this.maxInstances,
            boxWidth: config.boxWidth ?? DEFAULT_BOX_WIDTH,
            boxHeight: config.boxHeight ?? DEFAULT_BOX_HEIGHT,
            boxDepth: config.boxDepth ?? 0.1,
            defaultLod: config.defaultLod,
            lazyHighTextures: this.lazyHighTextures,
            gpuUpdateInterval: 10
        }

        if (this.lazyHighTextures) {
            rendererConfig.highTextureCacheConfig = {
                totalSlots: highConfig?.maxDepth ?? 64,
                textureWidth: highConfig?.textureWidth ?? STEAM_CAPSULE_WIDTH,
                textureHeight: highConfig?.textureHeight ?? STEAM_CAPSULE_HEIGHT,
                maxConcurrentLoads: 2
            }
            rendererConfig.prewarmingConfig = config.prewarmingConfig
        }

        this.renderer = this.createRenderer(rendererConfig)
        this.boundHandlePlacementRunResetRequested = this.handlePlacementRunResetRequested.bind(this)

        // Initialize with texture arrays
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (scene) {
            this.initialize(scene)
        }

        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SomeBatchesComplete,
            this.handleSomeBatchesComplete.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.AllBatchesComplete,
            this.handleAllBatchesComplete.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandlePlacementRunResetRequested
        )

        this.logConfig()
    }

    private handleSomeBatchesComplete(_event: CustomEvent<SomeBatchesCompleteEvent>): void {
        this.updateGPU()
    }

    private compactMidTierAfterLoad(): void {
        this.textureManager.compactMidTier()
    }

    private handleAllBatchesComplete(): void {
        this.allBatchesComplete = true
        this.compactMidTierAfterLoad()
        this.settleArtwork()
    }

    private handlePlacementRunResetRequested(_event: CustomEvent<PlacementRunResetRequestedEvent>): void {
        this.instanceMetadata.clear()
        this.renderer.clearPlacements()
        LodArtworkOrchestrator.logger.debug('Cleared instance placements; texture slots retained')
    }

    /** Factory method - override in debug subclass */
    protected createRenderer(config: LodGameArtworkRendererConfig): LodGameArtworkRenderer {
        return new LodGameArtworkRenderer(config)
    }

    private initialize(scene: THREE.Scene): void {
        const midTexture = this.textureManager.getTextureArray(LOD_TIER_NAME.MID)

        if (!midTexture) {
            throw new Error(`Failed to get texture array - expected tier '${LOD_TIER_NAME.MID}'`)
        }

        let textureArrays: RendererTextureSources

        if (this.lazyHighTextures) {
            textureArrays = {
                mode: 'lazy',
                mid: midTexture,
            }
        } else {
            const highTexture = this.textureManager.getTextureArray(LOD_TIER_NAME.HIGH)
            if (!highTexture) {
                throw new Error(`Failed to get texture array - expected tier '${LOD_TIER_NAME.HIGH}' (non-lazy mode)`)
            }
            textureArrays = {
                mode: 'eager',
                mid: midTexture,
                high: highTexture,
            }
        }

        this.renderer.initialize(textureArrays, scene)

        // Register instance metadata map for downstream systems (raycast, diagnostics)
        DataManager.getInstance().set(
            DataKey.InstancedArtworkMetadata,
            this.instanceMetadata,
            { domain: DataDomain.Renderer }
        )
    }

    private logConfig(): void {
        let totalVRAM = 0
        const lodInfo: string[] = []

        for (const tierName of this.textureManager.getTierNames()) {
            const config = this.textureManager.getTierConfig(tierName)
            if (config) {
                const vram = config.width * config.height * config.maxDepth * 4
                totalVRAM += vram
                lodInfo.push(`${tierName}: ${config.maxDepth} slots × ${config.width}×${config.height}px = ${(vram / (1024 * 1024)).toFixed(1)}MB`)
            }
        }

        LodArtworkOrchestrator.logger.lifecycle(`LOD VRAM: ${lodInfo.join(', ')} | Total: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }

    /**
     * Phase 1 of the load/place split: fetch and cache artwork for a game without
     * placing a GPU instance. Safe to call as batches arrive, before shelf positions
     * are known. Idempotent — calling again for the same appId is a no-op.
     *
     * @returns 'prefetched' when texture was freshly loaded, 'cached' if already done,
     *          'permanent-failure' if the artwork URL is known-bad, 'error' on unexpected failure.
     */
    public async prefetchArtwork(
        appid: number,
        artworkUrl: string,
        gameName: string
    ): Promise<'prefetched' | 'cached' | 'permanent-failure' | 'error'> {
        // Already in the texture atlas — nothing to do.
        if (this.gameNameToTextureIndex.has(gameName)) return 'cached'

        if (this.artworkProvider.isPermanentFailure(appid, 'library')) return 'permanent-failure'

        this.inFlightArtworkCount++
        try {
            const textureIndex = this.textureManager.allocateSlot()
            if (textureIndex < 0) {
                if (!this.atlasFullLogged) {
                    LodArtworkOrchestrator.logger.warn(`Atlas full (${this.maxTextures} configured) — further games will not have artwork`)
                    this.atlasFullLogged = true
                }
                return 'error'
            }

            const artwork = this.artworkProvider.getArtwork(appid, gameName, 'library', artworkUrl)
            const resolvedUrl = await this.fetchAndCachePixels(artwork, textureIndex)

            this.gameNameToTextureIndex.set(gameName, textureIndex)
            this.textureIndexToGameName.set(textureIndex, gameName)
            this.prefetchedArtworkUrl.set(gameName, resolvedUrl)

            LodArtworkOrchestrator.logger.debug(`Prefetched artwork for "${gameName}" → slot ${textureIndex}`)
            return 'prefetched'
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            this.failedArtwork.set(gameName, {
                reason: this.categorizeFailure(reason),
                url: artworkUrl,
                urlsTried: [artworkUrl],
                timestamp: Date.now()
            })
            LodArtworkOrchestrator.logger.debug(`Prefetch failed for "${gameName}": ${reason}`)
            return 'error'
        } finally {
            this.inFlightArtworkCount--
            this.settleArtwork()
        }
    }

    private settleArtwork(): void {
        if (this.inFlightArtworkCount === 0 && this.allBatchesComplete) {
            EventManager.getInstance().emit(GameEventTypes.ArtworkSettled, {})
        }
    }

    private async fetchAndCachePixels(
        artwork: GameArtwork,
        textureIndex: number
    ): Promise<string> {
        const midConfig = findTierByLevel(this.lodConfigs, LOD_LEVEL.MID)
        const midWidth = midConfig?.textureWidth ?? 150
        const midHeight = midConfig?.textureHeight ?? 225
        const midResult = await artwork.getPixelsAtSize(midWidth, midHeight)
        this.textureManager.setSlotPixels(LOD_TIER_NAME.MID, textureIndex, midResult.pixels, midWidth, midHeight)

        if (!this.lazyHighTextures) {
            const highConfig = findTierByLevel(this.lodConfigs, LOD_LEVEL.HIGH)
            const highWidth = highConfig?.textureWidth ?? STEAM_CAPSULE_WIDTH
            const highHeight = highConfig?.textureHeight ?? STEAM_CAPSULE_HEIGHT
            const highResult = await artwork.getPixelsAtSize(highWidth, highHeight)
            this.textureManager.setSlotPixels(LOD_TIER_NAME.HIGH, textureIndex, highResult.pixels, highWidth, highHeight)
        }

        this.updateGPU()
        return artwork.getUrl()
    }

    /**
     * Phase 2 of the load/place split: assign a world position to a prefetched game.
     * Must be called after prefetchArtwork() has resolved for this game.
        * On re-sort, placement reset is handled by PlacementRunResetRequested before
        * new placement intents are emitted.
     *
     * @returns instanceIndex on success, -1 if texture was not prefetched or slot unavailable.
     */
    public placeInstance(
        appid: number,
        gameName: string,
        position: THREE.Vector3,
        rotation?: THREE.Quaternion
    ): number {
        const textureIndex = this.gameNameToTextureIndex.get(gameName)
        if (textureIndex === undefined) {
            LodArtworkOrchestrator.logger.warn(`placeInstance: no prefetched texture for "${gameName}" (appId ${appid})`)
            return -1
        }

        const resolvedUrl = this.prefetchedArtworkUrl.get(gameName)
        const instanceIndex = this.renderer.addInstance({
            position,
            textureIndex,
            gameName,
            artworkUrl: resolvedUrl,
            lodLevel: this.lazyHighTextures ? LOD_LEVEL.MID : LOD_LEVEL.HIGH,
            rotation,
        })

        if (instanceIndex < 0) return -1

        this.instanceMetadata.set(instanceIndex, { name: gameName, appid, position: position.clone() })
        return instanceIndex
    }

    public async setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number,
        rotation?: THREE.Quaternion
    ): Promise<{ success: boolean; instanceIndex: number; permanent?: boolean }> {
        // Check if already loaded
        const existingIndex = this.gameNameToTextureIndex.get(gameName)
        if (existingIndex !== undefined) {
            return { success: true, instanceIndex: existingIndex }
        }

        // Only skip known permanent failures. Non-permanent historical failures
        // (UNKNOWN/TIMEOUT/NETWORK) should be retried.
        if (this.artworkProvider.isPermanentFailure(appid ?? 0, 'library')) {
            const reason = this.artworkProvider.getFailureReason(appid ?? 0, 'library')
            LodArtworkOrchestrator.logger.debug(`Skipping "${gameName}": permanent failure (${reason})`)
            return { success: false, instanceIndex: -1, permanent: true }
        }

        this.inFlightArtworkCount++
        try {
            return await this.fetchAndPlaceArtwork(position, gameName, artworkUrl, appid, rotation)
        } finally {
            this.inFlightArtworkCount--
            if (this.inFlightArtworkCount === 0 && this.allBatchesComplete) {
                EventManager.getInstance().emit(GameEventTypes.ArtworkSettled, {})
            }
        }
    }

    private async fetchAndPlaceArtwork(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number,
        rotation?: THREE.Quaternion
    ): Promise<{ success: boolean; instanceIndex: number; permanent?: boolean }> {
        const textureIndex = this.textureManager.allocateSlot()
        if (textureIndex < 0) {
            if (!this.atlasFullLogged) {
                LodArtworkOrchestrator.logger.warn(`Atlas full (${this.maxTextures} configured) - further games will not have artwork`)
                this.atlasFullLogged = true
            }
            return { success: false, instanceIndex: -1 }
        }

        try {
            // Get artwork handle
            const artwork = this.artworkProvider.getArtwork(
                appid ?? 0,
                gameName,
                'library',
                artworkUrl
            )

            // Load MID texture (always needed)
            const midConfig = findTierByLevel(this.lodConfigs, LOD_LEVEL.MID)
            const midWidth = midConfig?.textureWidth ?? 150
            const midHeight = midConfig?.textureHeight ?? 225

            const midResult = await artwork.getPixelsAtSize(midWidth, midHeight)
            this.textureManager.setSlotPixels(LOD_TIER_NAME.MID, textureIndex, midResult.pixels, midWidth, midHeight)

            // For non-lazy mode, also load HIGH
            if (!this.lazyHighTextures) {
                const highConfig = findTierByLevel(this.lodConfigs, LOD_LEVEL.HIGH)
                const highWidth = highConfig?.textureWidth ?? STEAM_CAPSULE_WIDTH
                const highHeight = highConfig?.textureHeight ?? STEAM_CAPSULE_HEIGHT

                const highResult = await artwork.getPixelsAtSize(highWidth, highHeight)
                this.textureManager.setSlotPixels(LOD_TIER_NAME.HIGH, textureIndex, highResult.pixels, highWidth, highHeight)
            }

            // Flush texture to GPU immediately after pixel data is ready.
            // Without this, MID textures only reach the GPU on the next SomeBatchesComplete
            // event - which may have already fired in a single-batch load (e.g. demo store).
            // TODO: tear this back out and probably force a gpu update when we get an event after SomeBatchesComplete
            this.updateGPU()

            // Create instance
            const resolvedUrl = artwork.getUrl()
            const instanceIndex = this.renderer.addInstance({
                position,
                textureIndex,
                gameName,
                artworkUrl: resolvedUrl,
                lodLevel: this.lazyHighTextures ? LOD_LEVEL.MID : LOD_LEVEL.HIGH,
                rotation,
            })

            if (instanceIndex < 0) {
                return { success: false, instanceIndex: -1 }
            }

            // Track mapping
            this.gameNameToTextureIndex.set(gameName, textureIndex)
            this.textureIndexToGameName.set(textureIndex, gameName)
            this.instanceMetadata.set(instanceIndex, {
                name: gameName,
                appid,
                position: position.clone()
            })

            return { success: true, instanceIndex }

        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            this.failedArtwork.set(gameName, {
                reason: this.categorizeFailure(reason),
                url: artworkUrl,
                urlsTried: [artworkUrl],
                timestamp: Date.now()
            })
            LodArtworkOrchestrator.logger.debug(`Artwork failed for "${gameName}": ${reason}`)
            const isPermanent = this.artworkProvider.isPermanentFailure(appid ?? 0, 'library')
            return { success: false, instanceIndex: -1, permanent: isPermanent }
        }
    }

    private categorizeFailure(msg: string): string {
        const lower = msg.toLowerCase()
        if (lower.includes('cors')) return 'CORS'
        if (lower.includes('404') || lower.includes('not found')) return '404'
        if (lower.includes('timeout') || lower.includes('abort')) return 'TIMEOUT'
        if (lower.includes('network') || lower.includes('failed to fetch')) return 'NETWORK'
        return 'UNKNOWN'
    }

    // === Delegated methods to renderer ===

    private updateGPU(): void {
        this.textureManager.flushToGpu()
        this.renderer.flushToGpu()
    }

    public getInstanceCount(): number {
        return this.renderer.getInstanceCount()
    }

    public setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean {
        const previousLod = this.renderer.getInstanceLod(instanceIndex)
        const accepted = this.renderer.setInstanceLod(instanceIndex, lodLevel)
        const effectiveLod = this.renderer.getInstanceLod(instanceIndex)

        if (previousLod !== effectiveLod) {
            const gameName = this.textureIndexToGameName.get(instanceIndex) ?? `instance #${instanceIndex}`
            const tierName = effectiveLod === LOD_LEVEL.HIGH ? 'HIGH' : 'MID'
            const requestedName = lodLevel === LOD_LEVEL.HIGH ? 'HIGH' : 'MID'
            if (accepted) {
                LodArtworkOrchestrator.logger.debug(`LOD ${gameName}: ${previousLod === LOD_LEVEL.HIGH ? 'HIGH' : 'MID'} → ${tierName}`)
            } else {
                // Requested HIGH but got MID (texture not yet ready)
                LodArtworkOrchestrator.logger.debug(`LOD ${gameName}: requested ${requestedName}, stayed MID (texture not ready)`)
            }
        }
        return accepted
    }

    public getInstanceData(): ReadonlyMap<number, InstanceLodData> {
        const result = new Map<number, InstanceLodData>()
        for (const [index, meta] of this.instanceMetadata) {
            result.set(index, {
                position: meta.position,
                lodLevel: this.renderer.getInstanceLod(index) ?? LOD_LEVEL.MID
            })
        }
        return result
    }

    // === Protected accessors for debug subclass ===

    protected clearFailureCache(): void {
        this.failedArtwork.clear()
        this.artworkProvider.clearCaches()
        LodArtworkOrchestrator.logger.info('Cleared artwork caches - all URLs will be retried on next load')
    }

    protected getTextureManager(): LodTextureArrayManager {
        return this.textureManager
    }

    protected getInternalRenderer(): LodGameArtworkRenderer {
        return this.renderer
    }

    protected getGameNameToTextureIndex(): ReadonlyMap<string, number> {
        return this.gameNameToTextureIndex
    }

    protected getFailedArtwork(): Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> {
        return this.failedArtwork
    }

    public dispose(): void {
        EventManager.getInstance().deregisterEventHandler(
            GameRenderEventTypes.PlacementRunResetRequested,
            this.boundHandlePlacementRunResetRequested
        )
        EventManager.getInstance().removeEventListener(
            AppEventTypes.VisibilityChanged,
            this.onFocusChanged
        )
        this.renderer.dispose()
        this.textureManager.dispose()
        this.gameNameToTextureIndex.clear()
        this.textureIndexToGameName.clear()
        this.instanceMetadata.clear()
        this.prefetchedArtworkUrl.clear()
        this.failedArtwork.clear()

        LodArtworkOrchestrator.logger.lifecycle('Disposed')
    }
}
