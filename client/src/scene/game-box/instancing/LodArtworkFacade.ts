/**
 * LOD Artwork Facade - Drop-in replacement for old LodArtworkRenderer
 * 
 * This facade wraps the new clean architecture (GameArtworkProvider + 
 * LodTextureArrayManager + LodGameArtworkRenderer) with the old API
 * for backward compatibility during migration.
 * 
 * New code should use GameArtworkOrchestrator directly.
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
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
import { HighTextureCache } from './HighTextureCache'
import type { PrewarmingConfig } from './SpatialPrewarmingManager'

const log = Logger.withContext('LodArtworkFacade')

// Re-export for backward compatibility
export { LOD_LEVEL, type LodLevel }

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
    { level: LOD_LEVEL.HIGH, textureWidth: STEAM_CAPSULE_WIDTH, textureHeight: STEAM_CAPSULE_HEIGHT, name: 'high', maxDepth: 128 },
    { level: LOD_LEVEL.MID, textureWidth: 150, textureHeight: 225, name: 'med' }
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
 * Facade that provides the old LodArtworkRenderer API
 * using the new clean architecture underneath.
 */
export class LodArtworkFacade {
    private artworkProvider: GameArtworkProvider
    private textureManager: LodTextureArrayManager
    private renderer: LodGameArtworkRenderer
    
    private readonly maxTextures: number
    private readonly lodConfigs: LodConfig[]
    private readonly lazyHighTextures: boolean
    
    // Track game names to texture indices
    private gameNameToTextureIndex: Map<string, number> = new Map()
    private textureIndexToGameName: Map<number, string> = new Map()
    
    // Track failed artwork (for backward compat)
    private failedArtwork: Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> = new Map()
    
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
        
        // Register for batch complete events
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.InstancedBatchComplete,
            () => this.updateGPU()
        )
        
        this.logConfig()
    }
    
    /** Factory method - override in debug subclass */
    protected createRenderer(config: LodGameArtworkRendererConfig): LodGameArtworkRenderer {
        return new LodGameArtworkRenderer(config)
    }
    
    private initialize(scene: THREE.Scene): void {
        const highTexture = this.textureManager.getTextureArray('high')
        const midTexture = this.textureManager.getTextureArray('mid')
        
        if (!highTexture || !midTexture) {
            throw new Error('Failed to get texture arrays - texture manager not properly initialized')
        }
        
        const textureArrays: LodTextureArrays = {
            high: highTexture,
            mid: midTexture
        }
        this.renderer.initialize(textureArrays, scene)
        
        // Register metadata with DataManager for compatibility
        DataManager.getInstance().set(
            'artworkMetadata_lod' as DataKey,
            this.renderer.getAllInstances(),
            { domain: DataDomain.Scene }
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
        
        log.lifecycle(`LOD VRAM: ${lodInfo.join(', ')} | Total: ${(totalVRAM / (1024 * 1024)).toFixed(0)}MB`)
    }
    
    /**
     * Main entry point - matches old LodArtworkRenderer API
     */
    public async setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number
    ): Promise<{ success: boolean; instanceIndex: number }> {
        // Check if already loaded
        const existingIndex = this.gameNameToTextureIndex.get(gameName)
        if (existingIndex !== undefined) {
            return { success: true, instanceIndex: existingIndex }
        }
        
        // Check known failure
        if (this.artworkProvider.isKnownFailure(appid ?? 0, 'library')) {
            const reason = this.artworkProvider.getFailureReason(appid ?? 0, 'library')
            log.debug(`Skipping "${gameName}": previously failed (${reason})`)
            return { success: false, instanceIndex: -1 }
        }
        
        // Allocate texture slot
        const textureIndex = this.textureManager.allocateSlot()
        if (textureIndex < 0) {
            log.warn(`Atlas full (${this.maxTextures} textures)`)
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
            this.textureManager.setSlotPixels('mid', textureIndex, midResult.pixels, midWidth, midHeight)
            
            // For non-lazy mode, also load HIGH
            if (!this.lazyHighTextures) {
                const highConfig = this.lodConfigs.find(c => c.level === LOD_LEVEL.HIGH)
                const highWidth = highConfig?.textureWidth ?? STEAM_CAPSULE_WIDTH
                const highHeight = highConfig?.textureHeight ?? STEAM_CAPSULE_HEIGHT
                
                const highResult = await artwork.getPixelsAtSize(highWidth, highHeight)
                this.textureManager.setSlotPixels('high', textureIndex, highResult.pixels, highWidth, highHeight)
            }
            
            // Create instance
            const resolvedUrl = artwork.getUrl()
            const instanceIndex = this.renderer.addInstance(
                position,
                textureIndex,
                gameName,
                resolvedUrl,
                this.lazyHighTextures ? LOD_LEVEL.MID : LOD_LEVEL.HIGH
            )
            
            if (instanceIndex < 0) {
                return { success: false, instanceIndex: -1 }
            }
            
            // Track mapping
            this.gameNameToTextureIndex.set(gameName, textureIndex)
            this.textureIndexToGameName.set(textureIndex, gameName)
            
            return { success: true, instanceIndex }
            
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            this.failedArtwork.set(gameName, {
                reason: this.categorizeFailure(reason),
                url: artworkUrl,
                urlsTried: [artworkUrl],
                timestamp: Date.now()
            })
            log.debug(`Artwork failed for "${gameName}": ${reason}`)
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
    
    public setGlobalLod(lodLevel: LodLevel): void {
        this.renderer.setGlobalLod(lodLevel)
    }
    
    public getInstanceLod(instanceIndex: number): LodLevel | null {
        const data = this.renderer.getInstance(instanceIndex)
        return data?.lodLevel ?? null
    }
    
    public updateGPU(): void {
        this.textureManager.flushToGpu()
        this.renderer.flushToGpu()
    }
    
    public isReady(): boolean {
        return this.renderer.isReady()
    }
    
    public getInstanceCount(): number {
        return this.renderer.getInstanceCount()
    }
    
    public getInstanceData(): ReadonlyMap<number, { position: THREE.Vector3; lodLevel: LodLevel }> {
        return this.renderer.getAllInstances() as ReadonlyMap<number, { position: THREE.Vector3; lodLevel: LodLevel }>
    }
    
    public isHighTextureLoaded(instanceIndex: number): boolean {
        return this.renderer.isHighTextureLoaded(instanceIndex)
    }
    
    public getHighTextureCache(): HighTextureCache | null {
        return this.renderer.getHighTextureCache()
    }
    
    public startPrewarming(): void {
        this.renderer.startPrewarming()
    }
    
    public stopPrewarming(): void {
        this.renderer.stopPrewarming()
    }
    
    public clearFailureCache(): void {
        this.failedArtwork.clear()
        this.artworkProvider.clearCaches()
        log.info('Cleared artwork caches - all URLs will be retried on next load')
    }
    
    // === Protected accessors for debug subclass ===
    
    protected getTextureManager(): LodTextureArrayManager {
        return this.textureManager
    }
    
    protected getArtworkProvider(): GameArtworkProvider {
        return this.artworkProvider
    }
    
    protected getInternalRenderer(): LodGameArtworkRenderer {
        return this.renderer
    }
    
    protected getFailedArtwork(): Map<string, { reason: string; url: string; urlsTried: string[]; timestamp: number }> {
        return this.failedArtwork
    }
    
    protected getGameNameToTextureIndex(): Map<string, number> {
        return this.gameNameToTextureIndex
    }
    
    protected getLodConfigs(): LodConfig[] {
        return this.lodConfigs
    }
    
    protected getMaxTextures(): number {
        return this.maxTextures
    }
    
    public dispose(): void {
        this.renderer.dispose()
        this.textureManager.dispose()
        this.gameNameToTextureIndex.clear()
        this.textureIndexToGameName.clear()
        this.failedArtwork.clear()
        
        log.lifecycle('Disposed')
    }
}
