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
import { LodArtworkRenderer, type LodLevel } from './instancing/LodArtworkRenderer'
import { LodDistanceManager } from './instancing/LodDistanceManager'
import { LodDebugOverlay } from '../../debug/LodDebugOverlay'
import { ShelfSide } from '../props/SharedPropsUtils'
import { AppSettings, Setting } from '../../core/AppSettings'
import { Logger } from '../../utils/Logger'

const log = Logger.withContext('GpuGameBoxRenderer')

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
    private lodArtworkRenderer: LodArtworkRenderer | null = null
    private lodDistanceManager: LodDistanceManager | null = null
    private lodDebugOverlay: LodDebugOverlay | null = null
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
            this.lodArtworkRenderer = new LodArtworkRenderer({
                maxTextures: maxGames,
                lazyHighTextures: true  // Memory optimization: load HIGH textures on demand
            })
            // Create distance manager for automatic LOD switching
            this.lodDistanceManager = new LodDistanceManager(this.lodArtworkRenderer)
            log.lifecycle(`Using LOD atlas (max ${maxGames}, lazy HIGH enabled)`)
            
            // TODO: Remove all these debug functions. all of them
            // Expose diagnostic on window for debugging
            /* eslint-disable @typescript-eslint/no-explicit-any */
            ;(window as any).measureTextureCosts = () => {
                this.lodArtworkRenderer?.measureTextureCosts()
            }
            ;(window as any).lodCacheStats = () => {
                this.lodArtworkRenderer?.logHighTextureCacheStats()
            }
            ;(window as any).lodDistribution = () => {
                const dist = this.lodDistanceManager?.getLodDistribution()
                if (dist) {
                    console.group('📊 LOD Distribution (Two-Tier System)')
                    console.log(`HIGH: ${dist.counts.high} games (within ${this.lodDistanceManager?.['config']?.highDistance ?? '?'}m)`)
                    console.log(`MID:  ${dist.counts.mid} games (everything else)`)
                    console.log(`Total: ${dist.counts.total} instances`)
                    console.log(`---`)
                    console.log(`Current VRAM: ${dist.estimatedVRAM.current}`)
                    console.log(`Optimal VRAM: ${dist.estimatedVRAM.optimal}`)
                    console.groupEnd()
                }
                return dist
            }
            ;(window as any).experimentLoadingStrategies = (count = 9) => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                // Get the first N game indices that aren't already loaded
                const gameIndices: number[] = []
                for (let i = 0; i < maxGames && gameIndices.length < count; i++) {
                    if (cache.getState(i) !== 'loaded') {
                        gameIndices.push(i)
                    }
                }
                console.log(`Testing with game indices: ${gameIndices.join(', ')}`)
                cache.experimentLoadingStrategies(gameIndices)
            }
            ;(window as any).preloadNearestGames = (count = 20) => {
                this.lodDistanceManager?.preloadNearestGames(count)
            }
            // Short aliases for console use
            ;(window as any).preloadNearest = (count = 20) => {
                this.lodDistanceManager?.preloadNearestGames(count)
            }
            ;(window as any).experimentBatch = (count = 9) => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.experimentBatchLoading?.(count)
            }
            // Diagnostic functions
            ;(window as any).diagnoseIndexes = (centerIndex = 64, radius = 3) => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.diagnoseIndexCluster(centerIndex, radius)
            }
            ;(window as any).diagnoseMismatches = () => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                return cache.diagnoseIndexMismatches()
            }
            ;(window as any).diagnoseLoadState = () => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.diagnoseLoadState()
            }
            ;(window as any).diagnoseNearest = (count = 30) => {
                this.lodDistanceManager?.diagnoseNearestGames(count)
            }
            ;(window as any).dumpIndexMapping = (count = 50) => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.dumpIndexMapping(count)
            }
            ;(window as any).diagnosePending = () => {
                this.lodArtworkRenderer?.diagnosePendingState()
            }
            ;(window as any).diagnoseTimings = () => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.diagnoseTimings()
            }
            ;(window as any).clearTimings = () => {
                const cache = (this.lodArtworkRenderer as any)?.highTextureCache
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.clearTimingSamples()
            }
            // Profiling functions for detailed bottleneck analysis
            ;(window as any).runProfilingTest = (count = 10) => {
                const cache = this.lodArtworkRenderer?.getHighTextureCache()
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.runProfilingTest(count)
            }
            ;(window as any).enableProfiling = () => {
                const cache = this.lodArtworkRenderer?.getHighTextureCache()
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.enableProfiling()
            }
            ;(window as any).diagnoseProfile = () => {
                const cache = this.lodArtworkRenderer?.getHighTextureCache()
                if (!cache) {
                    console.log('❌ No HIGH texture cache available')
                    return
                }
                cache.diagnoseProfile()
            }
            ;(window as any).diagnoseScheduler = async () => {
                const { FrameBudgetScheduler } = await import('../../utils/FrameBudgetScheduler')
                const scheduler = FrameBudgetScheduler.getInstance()
                scheduler.diagnose()
            }
            ;(window as any).schedulerStats = async () => {
                const { FrameBudgetScheduler } = await import('../../utils/FrameBudgetScheduler')
                const scheduler = FrameBudgetScheduler.getInstance()
                console.log('📊 Scheduler Stats:', scheduler.getStats())
                return scheduler.getStats()
            }
            ;(window as any).schedulerTune = async (maxTasksPerFrame: number) => {
                const { FrameBudgetScheduler } = await import('../../utils/FrameBudgetScheduler')
                const scheduler = FrameBudgetScheduler.getInstance()
                scheduler.setMaxTasksPerFrame(maxTasksPerFrame)
                console.log(`✅ Scheduler max tasks per frame set to ${maxTasksPerFrame}`)
            }
            ;(window as any).diagnosePixelCache = async () => {
                const { PixelDataCache } = await import('./instancing/PixelDataCache')
                const cache = PixelDataCache.getInstance()
                await cache.diagnose()
            }
            ;(window as any).clearPixelCache = async () => {
                const { PixelDataCache } = await import('./instancing/PixelDataCache')
                const cache = PixelDataCache.getInstance()
                await cache.clear()
                console.log('✅ Pixel cache cleared')
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        } else if (this.useMultiAtlas) {
            this.multiAtlasRenderer = new MultiAtlasArtworkRenderer()
            log.lifecycle(`Using multi-atlas system (max ${maxGames})`)
        } else {
            this.instancedArtworkRenderer = new InstancedArtworkRenderer({
                maxInstances: maxGames
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
        
        // Use library_600x900 portrait artwork (2:3 aspect ratio) for game boxes
        // This matches the physical game case aesthetic and enables native-resolution rendering
        const primaryUrl = game.artwork?.library
        const fallbackUrl = game.appid ? `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg` : undefined
        
        if (shouldUseArtwork && !primaryUrl && fallbackUrl) {
            log.warn(`Missing artwork.library for "${game.name}" (appid: ${game.appid}) - using fallback URL`)
        }
        
        const artworkUrl = shouldUseArtwork ? (primaryUrl || fallbackUrl) : undefined
        
        if (artworkUrl) {
            this.createGameBoxFromUrl(game, position, artworkUrl, side)
        } else if (AppSettings.get(Setting.EnableLabels)) {
            this.createLabelGameBox(game, position, side)
        }
        // When labels disabled and no artwork, skip creating box entirely
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
        
        this.lodDebugOverlay?.dispose()
        this.lodDistanceManager?.dispose()
        this.instancedLabelRenderer.dispose()
        this.instancedArtworkRenderer?.dispose()
        this.multiAtlasRenderer?.dispose()
        this.lodArtworkRenderer?.dispose()
        
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
    public getLodRenderer(): LodArtworkRenderer | null {
        return this.lodArtworkRenderer
    }
    
    /**
     * Start automatic LOD distance management
     * Call after all games are loaded
     */
    public startLodDistanceManager(): void {
        if (this.lodDistanceManager && this.lodArtworkRenderer) {
            this.lodDistanceManager.syncInstances()
            this.lodDistanceManager.startAutoUpdate()
            
            // Create debug overlay if not exists
            if (!this.lodDebugOverlay) {
                this.lodDebugOverlay = new LodDebugOverlay({
                    highDistance: 3.0,
                    midDistance: 8.0,
                    maxDistance: 15.0
                })
                // Connect debug overlay to LOD data source
                const renderer = this.lodArtworkRenderer
                this.lodDebugOverlay.setDataSource(() => renderer.getInstanceData())
            }
        }
    }
    
    /**
     * Stop automatic LOD distance management
     */
    public stopLodDistanceManager(): void {
        this.lodDistanceManager?.stopAutoUpdate()
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
}
