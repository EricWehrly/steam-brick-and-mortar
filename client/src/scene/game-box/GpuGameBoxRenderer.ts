/**
 * GPU Game Box Renderer
 * 
 * GPU-optimized rendering using InstancedMesh for massive performance gains.
 * Requires WebGL2 and instanced arrays support.
 * Uses InstancedLabelRenderer and InstancedArtworkRenderer for batch rendering.
 * 
 * Supports two rendering modes for artwork:
 * - Single atlas: Original 1024-layer texture array (~1GB VRAM)
 * - Multi atlas: 3-tier system with primary/secondary/uncached (~270MB VRAM)
 */

import * as THREE from 'three'
import type { SteamGameData } from './types/GameData'
import type {
    GameBoxDimensions,
    GameBoxTextureOptions
} from './types/GameBoxOptions'
import { InstancedLabelRenderer } from './instancing/InstancedLabelRenderer'
import { InstancedArtworkRenderer } from './instancing/InstancedArtworkRenderer'
import { MultiAtlasArtworkRenderer } from './instancing/MultiAtlasArtworkRenderer'
import { LOD_LEVEL, type LodLevel } from './instancing/ILodArtworkRenderer'
import type { ILodArtworkRendererDebug } from './instancing/ILodArtworkRenderer'
import { LodArtworkFacadeDebug, type LodConfig } from './instancing/LodArtworkFacadeDebug'
import { LodDistanceManagerDebug } from './instancing/LodDistanceManagerDebug'
import { ShelfSide } from '../props/SharedPropsUtils'
import { AppSettings, Setting } from '../../core/AppSettings'
import { Logger } from '../../utils/Logger'

const log = Logger.withContext('GpuGameBoxRenderer')

// Steam capsule source dimensions (what CDN claims, though actual is ~460×690)
const STEAM_SOURCE_WIDTH = 600
const STEAM_SOURCE_HEIGHT = 900

/** 67% probability of showing artwork vs label-only */
const ARTWORK_PROBABILITY = 0.67
import type { IGameBoxRenderer, GameBoxRequest } from '../IGameBoxRenderer'

export class GpuGameBoxRenderer implements IGameBoxRenderer {

    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.3,   // 30cm width
        height: 0.4,  // 40cm height 
        depth: 0.08   // 8cm depth
    }

    private dimensions: GameBoxDimensions
    private instancedLabelRenderer: InstancedLabelRenderer
    private instancedArtworkRenderer: InstancedArtworkRenderer | null = null
    private multiAtlasRenderer: MultiAtlasArtworkRenderer | null = null
    // Uses facade wrapping new clean architecture (GameArtworkProvider + LodTextureArrayManager + LodGameArtworkRenderer)
    private lodArtworkRenderer: ILodArtworkRendererDebug | null = null
    private lodDistanceManager: LodDistanceManagerDebug | null = null
    private labelInstanceIndex: number = 0
    private artworkInstanceIndex: number = 0
    private readonly useMultiAtlas: boolean
    private readonly useLodAtlas: boolean

    constructor(maxGames: number = 2000) {
        this.dimensions = { ...GpuGameBoxRenderer.DEFAULT_DIMENSIONS }
        this.useLodAtlas = AppSettings.get(Setting.UseLodAtlas)
        this.useMultiAtlas = AppSettings.get(Setting.UseMultiAtlas)
        
        // Create label renderer (always needed for fallback)
        this.instancedLabelRenderer = new InstancedLabelRenderer({
            maxInstances: maxGames
        })
        
        // Create artwork renderer based on settings (priority: LOD > MultiAtlas > Single)
        if (this.useLodAtlas) {
            const lodConfigs = this.buildLodConfigsFromSettings()
            const maxHighSlots = AppSettings.get(Setting.LodMaxHighSlots)
            
            // LodArtworkFacadeDebug wraps new clean architecture with old API for compatibility
            this.lodArtworkRenderer = new LodArtworkFacadeDebug({
                maxTextures: maxGames,
                maxGames,  // For debug console commands
                lazyHighTextures: true,  // Memory optimization: load HIGH textures on demand
                boxWidth: this.dimensions.width,
                boxHeight: this.dimensions.height,
                boxDepth: this.dimensions.depth,
                lodConfigs,
                maxHighTextureCache: maxHighSlots
            })
            // Create distance manager for automatic LOD switching
            this.lodDistanceManager = new LodDistanceManagerDebug(this.lodArtworkRenderer)
            log.lifecycle(`Using LOD atlas (max ${maxGames}, HIGH slots: ${maxHighSlots}, lazy HIGH enabled)`)
        } else if (this.useMultiAtlas) {
            this.multiAtlasRenderer = new MultiAtlasArtworkRenderer({
                boxWidth: this.dimensions.width,
                boxHeight: this.dimensions.height
            })
            log.lifecycle(`Using multi-atlas system (max ${maxGames})`)
        } else {
            this.instancedArtworkRenderer = new InstancedArtworkRenderer({
                maxInstances: maxGames,
                boxWidth: this.dimensions.width,
                boxHeight: this.dimensions.height,
                boxDepth: this.dimensions.depth
            })
            log.lifecycle(`Using single atlas (max ${maxGames})`)
        }
    }

    /**
     * Create game box - routes to artwork or label renderer based on textureOptions
     * @deprecated for artwork - use createGameBoxFromUrl() to keep entire pipeline off main thread
     */
    public createGameBox(
        game: SteamGameData,
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        textureOptions?: GameBoxTextureOptions,
        name?: string,
        side: ShelfSide = ShelfSide.Front
    ): THREE.Mesh | null {
        const hasArtwork = textureOptions?.artworkBlobs && Object.keys(textureOptions.artworkBlobs).length > 0
        
        // Both renderers now lazy-initialize on first use, so don't check isReady()
        if (hasArtwork && textureOptions) {
            return this.createInstancedArtworkBox(game, position, textureOptions, name)
        } else {
            // Label renderer will lazy-initialize on first call to setLabelInstance
            return this.createInstancedLabelBox(game, position, name, side)
        }
    }
    
    /**
     * Create game box with artwork by URL - entire fetch+process happens in worker
     * This is the preferred path - keeps main thread completely free
     */
    public createGameBoxFromUrl(
        game: SteamGameData,
        position: THREE.Vector3,
        artworkUrl: string,
        side: ShelfSide = ShelfSide.Front
    ): void {
        if (this.useLodAtlas && this.lodArtworkRenderer) {
            this.createGameBoxFromUrlLodAtlas(game, position, artworkUrl, side)
        } else if (this.useMultiAtlas && this.multiAtlasRenderer) {
            this.createGameBoxFromUrlMultiAtlas(game, position, artworkUrl, side)
        } else {
            this.createGameBoxFromUrlSingleAtlas(game, position, artworkUrl, side)
        }
    }
    
    /**
     * Set the current batch index for multi-atlas tier assignment
     * Should be called before processing each batch
     */
    public setBatchIndex(batchIndex: number): void {
        this.multiAtlasRenderer?.setBatchIndex(batchIndex)
    }
    
    private createGameBoxFromUrlLodAtlas(
        game: SteamGameData,
        position: THREE.Vector3,
        artworkUrl: string,
        side: ShelfSide
    ): void {
        if (!this.lodArtworkRenderer) return
        
        this.lodArtworkRenderer.setArtworkInstanceFromUrl(
            position,
            game.name,
            artworkUrl,
            typeof game.appid === 'number' ? game.appid : undefined
        ).then((result) => {
            if (!result.success && AppSettings.get(Setting.EnableLabels)) {
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        }).catch((error) => {
            if (!(error instanceof Error && error.message.includes('Maximum'))) {
                log.debug(`Artwork fetch failed for "${game.name}": ${error}`)
            }
            if (AppSettings.get(Setting.EnableLabels)) {
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        })
    }
    
    private createGameBoxFromUrlMultiAtlas(
        game: SteamGameData,
        position: THREE.Vector3,
        artworkUrl: string,
        side: ShelfSide
    ): void {
        if (!this.multiAtlasRenderer) return
        
        this.multiAtlasRenderer.setArtworkInstanceFromUrl(
            position,
            game.name,
            artworkUrl,
            typeof game.appid === 'number' ? game.appid : undefined
        ).then((result) => {
            if (!result.success && AppSettings.get(Setting.EnableLabels)) {
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        }).catch((error) => {
            if (!(error instanceof Error && error.message.includes('Maximum'))) {
                log.debug(`Artwork fetch failed for "${game.name}": ${error}`)
            }
            if (AppSettings.get(Setting.EnableLabels)) {
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        })
    }
    
    private createGameBoxFromUrlSingleAtlas(
        game: SteamGameData,
        position: THREE.Vector3,
        artworkUrl: string,
        side: ShelfSide
    ): void {
        if (!this.instancedArtworkRenderer) return
        
        const reservedInstanceIndex = this.artworkInstanceIndex++
        
        this.instancedArtworkRenderer.setArtworkInstanceFromUrl(
            reservedInstanceIndex,
            position,
            game.name,
            artworkUrl,
            typeof game.appid === 'number' ? game.appid : undefined
        ).then((success) => {
            if (!success && AppSettings.get(Setting.EnableLabels)) {
                // Fall back to label if artwork fails (expected when max textures reached)
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        }).catch((error) => {
            // Don't log "Maximum textures reached" - that's expected once we hit the limit
            if (!(error instanceof Error && error.message === 'Maximum textures reached')) {
                log.debug(`Artwork fetch failed for "${game.name}": ${error}`)
            }
            // Fall back to label on error (if labels enabled)
            if (AppSettings.get(Setting.EnableLabels)) {
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        })
    }
    
    /**
     * Create game box with just a label (no artwork)
     */
    public createLabelGameBox(
        game: SteamGameData,
        position: THREE.Vector3,
        side: ShelfSide = ShelfSide.Front
    ): void {
        this.createInstancedLabelBox(game, position, undefined, side)
    }
    
    /**
     * Create game box with automatic artwork/label decision
     * Uses random coin toss (~67% artwork probability)
     * This is the preferred entry point - consolidates artwork decision here
     */
    public createGameBoxAuto(
        game: SteamGameData,
        position: THREE.Vector3,
        side: ShelfSide = ShelfSide.Front
    ): void {
        const shouldUseArtwork = Math.random() < ARTWORK_PROBABILITY
        
        // Get best artwork URL from metadata - priority order:
        // 1. library (portrait format, ideal for game boxes - consistent LOD rendering)
        // 2. header (landscape fallback, LodArtworkRenderer will try portrait alternatives)
        // Note: We pass the full artwork object so LodArtworkRenderer can try multiple URLs
        const artworkUrl = shouldUseArtwork ? this.selectBestArtworkUrl(game) : undefined
        
        if (artworkUrl) {
            this.createGameBoxFromUrl(game, position, artworkUrl, side)
        } else if (AppSettings.get(Setting.EnableLabels)) {
            this.createLabelGameBox(game, position, side)
        }
        // When labels disabled and no artwork, skip creating box entirely
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
        // Note: LodArtworkRenderer will attempt to find portrait alternatives
        if (game.artwork?.header) {
            return game.artwork.header
        }
        
        // Priority 3: Construct portrait URL as last resort (may fail for newer games)
        if (game.appid) {
            log.debug(`No artwork URLs in metadata for "${game.name}" - using constructed URL`)
            return `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
        }
        
        return undefined
    }

    private createInstancedArtworkBox(
        game: SteamGameData,
        position: THREE.Vector3,
        textureOptions: GameBoxTextureOptions,
        _name?: string
    ): THREE.Mesh | null {
        if (!this.instancedArtworkRenderer) {
            log.warn('createInstancedArtworkBox called but single-atlas renderer not available')
            return null
        }
        
        const reservedInstanceIndex = this.artworkInstanceIndex++

        this.instancedArtworkRenderer.setArtworkInstance(
            reservedInstanceIndex,
            position,
            game.name,
            textureOptions
        ).then((success) => {
            if (!success) {
                log.debug(`Failed to add instanced artwork box for "${game.name}" at index ${reservedInstanceIndex}`)
            }
        }).catch((error) => {
            log.debug(`Error adding instanced artwork for "${game.name}": ${error}`)
        })
        
        return null
    }

    private createInstancedLabelBox(
        game: SteamGameData,
        position: THREE.Vector3,
        name?: string,
        side: ShelfSide = ShelfSide.Front
    ): THREE.Mesh | null {
        const reservedInstanceIndex = this.labelInstanceIndex++

        const success = this.instancedLabelRenderer.setLabelInstance(
            reservedInstanceIndex,
            position,
            game.name,
            side
        )
        
        if (!success) {
            log.debug(`Failed to add instanced label box for "${game.name}"`)
        }
        
        return null
    }

    public createBatchGameBoxes(requests: GameBoxRequest[]): THREE.Mesh[] {
        requests.forEach(request => {
            this.createGameBox(
                request.game,
                request.position,
                request.textureOptions,
                request.name,
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

    public dispose(): void {
        log.lifecycle('Disposing')
        
        this.lodDistanceManager?.dispose()
        this.instancedLabelRenderer.dispose()
        this.instancedArtworkRenderer?.dispose()
        this.multiAtlasRenderer?.dispose()
        this.lodArtworkRenderer?.dispose()
        // Remove global reference if present
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).lodArtworkRenderer = null
        
        this.labelInstanceIndex = 0
        this.artworkInstanceIndex = 0
        
        log.lifecycle('Disposed')
    }
    
    /**
     * Set global LOD level for all artwork instances (only with LOD atlas)
     */
    public setGlobalLod(lodLevel: LodLevel): void {
        this.lodArtworkRenderer?.setGlobalLod(lodLevel)
    }
    
    /**
     * Get the LOD renderer for advanced control (null if not using LOD atlas)
     */
    public getLodRenderer(): ILodArtworkRendererDebug | null {
        return this.lodArtworkRenderer
    }
    
    /**
     * Get memory stats (available with multi-atlas or LOD atlas)
     */
    public getMemoryStats() {
        if (this.lodArtworkRenderer) {
            return this.lodArtworkRenderer.getMemoryStats()
        }
        if (this.multiAtlasRenderer) {
            return this.multiAtlasRenderer.getMemoryStats()
        }
        return null
    }
    
    /**
     * Log memory stats to console
     */
    public logMemoryStats(): void {
        if (this.lodArtworkRenderer) {
            this.lodArtworkRenderer.logMemoryStats()
        } else if (this.multiAtlasRenderer) {
            this.multiAtlasRenderer.logMemoryStats()
        } else {
            log.info('Memory stats only available with multi-atlas or LOD renderer')
        }
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
        
        log.info(`LOD config from settings: HIGH ${highWidth}×${highHeight} (${maxHighSlots} slots), MED ${medWidth}×${medHeight}`)
        
        return [
            { level: LOD_LEVEL.HIGH, textureWidth: highWidth, textureHeight: highHeight, name: 'high', maxDepth: maxHighSlots },
            { level: LOD_LEVEL.MID, textureWidth: medWidth, textureHeight: medHeight, name: 'med' }
        ]
    }
}
