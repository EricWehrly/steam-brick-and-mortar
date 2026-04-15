/**
 * LOD Artwork Orchestrator - Coordinates artwork loading pipeline
 *
 * This orchestrator wires together:
 * - GameArtworkProvider: URL strategy and fetch coordination
 * - LodTextureArrayManager: Texture array creation and population
 * - LodGameArtworkRenderer: GPU rendering with LOD support
 *
 * Provides the primary API for game artwork loading (setArtworkInstanceFromUrl)
 * and implements ILodArtworkRenderer for consumers like LodDistanceManager.
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes, AppEventTypes } from '../../../types/InteractionEvents'
import type { VisibilityChangedEvent } from '../../../types/InteractionEvents'
import type { SomeBatchesCompleteEvent } from '../../../types/EnvironmentEvents'
import { Logger } from '../../../utils/Logger'
import { GameArtworkProvider } from './GameArtworkProvider'
import { LodTextureArrayManager, type LodTierConfig } from './LodTextureArrayManager'
import {
    LodGameArtworkRenderer,
    LOD_LEVEL,
    type LodLevel,
    type LodGameArtworkRendererConfig,
    type LodTextureArrays
} from './LodGameArtworkRenderer'
import { LOD_TIER_NAME } from './ILodArtworkRenderer'
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

/** LOD configuration - matches old interface */
export interface LodConfig {
    level: LodLevel
    textureSize?: number
    textureWidth?: number
    textureHeight?: number
    name: string
    maxDepth?: number
}

export const DEFAULT_LOD_CONFIGS: LodConfig[] = [
    { level: LOD_LEVEL.HIGH, textureWidth: STEAM_CAPSULE_WIDTH, textureHeight: STEAM_CAPSULE_HEIGHT, name: LOD_TIER_NAME.HIGH, maxDepth: 128 },
    { level: LOD_LEVEL.MID, textureWidth: 150, textureHeight: 225, name: LOD_TIER_NAME.MID }
]

/** Config matching old LodArtworkConfig */
export interface LodArtworkConfig {
    maxTextures?: number
    lodConfigs?: LodConfig[]
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
    defaultLod?: LodLevel
    lazyHighTextures?: boolean
    maxHighTextureCache?: number
    prewarmingConfig?: Partial<PrewarmingConfig>
}

/**
 * Orchestrates the complete artwork loading and rendering pipeline.
 * Implements ILodArtworkRenderer for use by LodDistanceManager.
 */
export class LodArtworkOrchestrator {
    public static logger = Logger.createLogFunctions(LodArtworkOrchestrator.name)
    private artworkProvider: GameArtworkProvider
    private textureManager: LodTextureArrayManager
    protected renderer: LodGameArtworkRenderer

    private readonly maxTextures: number
    private readonly lodConfigs: LodConfig[]
    private readonly lazyHighTextures: boolean

    // Track game names to texture indices
    private gameNameToTextureIndex: Map<string, number> = new Map()
    private textureIndexToGameName: Map<number, string> = new Map()
    private instanceMetadata: Map<number, InstanceMetadata> = new Map()

    // Track failed artwork (for backward compat)
    private failedArtwork: Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> = new Map()

    // Prevent log spam when atlas is full
    private atlasFullLogged: boolean = false

    private readonly onFocusChanged: (e: CustomEvent<VisibilityChangedEvent>) => void

    constructor(config: LodArtworkConfig = {}) {
        this.maxTextures = config.maxTextures ?? 512
        this.lodConfigs = config.lodConfigs ?? DEFAULT_LOD_CONFIGS
        this.lazyHighTextures = config.lazyHighTextures ?? false

        // Get singleton provider
        this.artworkProvider = GameArtworkProvider.getInstance()

        // Create texture array manager
        const tierConfigs: LodTierConfig[] = this.lodConfigs.map(lc => ({
            name: lc.name,
            width: lc.textureWidth ?? lc.textureSize ?? 128,
            height: lc.textureHeight ?? lc.textureSize ?? 128,
            maxDepth: lc.maxDepth ?? this.maxTextures
        }))
        this.textureManager = new LodTextureArrayManager({ tiers: tierConfigs })

        // Create renderer
        const highConfig = this.lodConfigs.find(c => c.level === LOD_LEVEL.HIGH)
        const rendererConfig: LodGameArtworkRendererConfig = {
            maxInstances: this.maxTextures,
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
            this.compactMidTierAfterLoad.bind(this)
        )

        this.logConfig()
    }

    private handleSomeBatchesComplete(_event: CustomEvent<SomeBatchesCompleteEvent>): void {
        this.updateGPU()
    }

    private compactMidTierAfterLoad(): void {
        this.textureManager.compactMidTier()
    }

    /** Factory method - override in debug subclass */
    protected createRenderer(config: LodGameArtworkRendererConfig): LodGameArtworkRenderer {
        return new LodGameArtworkRenderer(config)
    }

    private initialize(scene: THREE.Scene): void {
        const highTexture = this.textureManager.getTextureArray(LOD_TIER_NAME.HIGH)
        const midTexture = this.textureManager.getTextureArray(LOD_TIER_NAME.MID)

        if (!highTexture || !midTexture) {
            throw new Error(`Failed to get texture arrays - expected tiers '${LOD_TIER_NAME.HIGH}' and '${LOD_TIER_NAME.MID}'`)
        }

        const textureArrays: LodTextureArrays = {
            high: highTexture,
            mid: midTexture
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

    public async setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number,
        rotation?: THREE.Quaternion
    ): Promise<{ success: boolean; instanceIndex: number }> {
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
            return { success: false, instanceIndex: -1 }
        }

        // Allocate texture slot
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
            const midConfig = this.lodConfigs.find(c => c.level === LOD_LEVEL.MID)
            const midWidth = midConfig?.textureWidth ?? midConfig?.textureSize ?? 150
            const midHeight = midConfig?.textureHeight ?? midConfig?.textureSize ?? 225

            const midResult = await artwork.getPixelsAtSize(midWidth, midHeight)
            this.textureManager.setSlotPixels(LOD_TIER_NAME.MID, textureIndex, midResult.pixels, midWidth, midHeight)

            // For non-lazy mode, also load HIGH
            if (!this.lazyHighTextures) {
                const highConfig = this.lodConfigs.find(c => c.level === LOD_LEVEL.HIGH)
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
            return { success: false, instanceIndex: -1 }
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

    public setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean {
        return this.renderer.setInstanceLod(instanceIndex, lodLevel)
    }

    public getInstanceCount(): number {
        return this.renderer.getInstanceCount()
    }

    public getInstanceData(): ReadonlyMap<number, { position: THREE.Vector3; lodLevel: LodLevel }> {
        return this.renderer.getAllInstances() as ReadonlyMap<number, { position: THREE.Vector3; lodLevel: LodLevel }>
    }

    private updateGPU(): void {
        this.textureManager.flushToGpu()
        this.renderer.flushToGpu()
    }

    public clearFailureCache(): void {
        this.failedArtwork.clear()
        this.artworkProvider.clearCaches()
        LodArtworkOrchestrator.logger.info('Cleared artwork caches - all URLs will be retried on next load')
    }

    // === Protected accessors for debug subclass ===

    protected getTextureManager(): LodTextureArrayManager {
        return this.textureManager
    }

    protected getInternalRenderer(): LodGameArtworkRenderer {
        return this.renderer
    }

    protected getFailedArtwork(): Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> {
        return this.failedArtwork
    }

    public dispose(): void {
        EventManager.getInstance().removeEventListener(
            AppEventTypes.VisibilityChanged,
            this.onFocusChanged
        )
        this.renderer.dispose()
        this.textureManager.dispose()
        this.gameNameToTextureIndex.clear()
        this.textureIndexToGameName.clear()
        this.instanceMetadata.clear()
        this.failedArtwork.clear()

        LodArtworkOrchestrator.logger.lifecycle('Disposed')
    }
}
