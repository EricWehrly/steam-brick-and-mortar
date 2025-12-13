/**
 * Game Artwork Orchestrator - Wires together the artwork pipeline
 * 
 * This is the high-level coordinator that:
 * 1. Takes a list of games to display
 * 2. Uses GameArtworkProvider to fetch artwork
 * 3. Populates LodTextureArrayManager with pixels
 * 4. Creates instances in LodGameArtworkRenderer
 * 
 * Handles:
 * - Batched loading with progress events
 * - Error handling and retry logic
 * - Coordination between components
 */

import * as THREE from 'three'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes, type InstancedBatchCompleteEvent } from '../../../types/InteractionEvents'
import { Logger } from '../../../utils/Logger'
import { GameArtworkProvider, type ArtworkFormat } from './GameArtworkProvider'
import { LodTextureArrayManager, type LodTierConfig } from './LodTextureArrayManager'
import { LodGameArtworkRenderer, type LodGameArtworkRendererConfig, type LodTextureArrays, LOD_LEVEL } from './LodGameArtworkRenderer'

const log = Logger.withContext('GameArtworkOrchestrator')

/** Game data for loading */
export interface GameToLoad {
    appId: number
    gameName: string
    position: THREE.Vector3
    preferredArtworkUrl?: string
}

/** Configuration for the orchestrator */
export interface GameArtworkOrchestratorConfig {
    /** Maximum games to support */
    maxGames: number
    /** LOD tier configurations */
    lodTiers: {
        high: { width: number; height: number; maxDepth: number }
        mid: { width: number; height: number }
    }
    /** Renderer configuration */
    renderer: Omit<LodGameArtworkRendererConfig, 'maxInstances'>
    /** Artwork format to use */
    artworkFormat?: ArtworkFormat
    /** Batch size for loading (emits progress events) */
    batchSize?: number
}

/** Progress event data */
export interface LoadProgressEvent {
    loaded: number
    total: number
    failed: number
    currentGame?: string
}

/** Result of loading games */
export interface LoadResult {
    successful: number
    failed: number
    failedGames: Array<{ gameName: string; reason: string }>
}

/**
 * Orchestrates the complete artwork loading and rendering pipeline.
 */
export class GameArtworkOrchestrator {
    private readonly config: Required<GameArtworkOrchestratorConfig>
    
    private artworkProvider: GameArtworkProvider
    private textureManager: LodTextureArrayManager | null = null
    private renderer: LodGameArtworkRenderer | null = null
    
    private isInitialized: boolean = false
    private loadedGames: Map<number, { instanceIndex: number; textureIndex: number }> = new Map()
    
    constructor(config: GameArtworkOrchestratorConfig) {
        this.config = {
            maxGames: config.maxGames,
            lodTiers: config.lodTiers,
            renderer: config.renderer,
            artworkFormat: config.artworkFormat ?? 'library',
            batchSize: config.batchSize ?? 10
        }
        
        this.artworkProvider = GameArtworkProvider.getInstance()
        
        log.lifecycle(`Created with maxGames=${this.config.maxGames}`)
    }
    
    /**
     * Initialize the orchestrator and its components.
     * Must be called before loading games.
     */
    public initialize(scene: THREE.Scene): void {
        if (this.isInitialized) {
            log.warn('Already initialized')
            return
        }
        
        // Create texture array manager
        const tierConfigs: LodTierConfig[] = [
            {
                name: 'high',
                width: this.config.lodTiers.high.width,
                height: this.config.lodTiers.high.height,
                maxDepth: this.config.lodTiers.high.maxDepth
            },
            {
                name: 'mid',
                width: this.config.lodTiers.mid.width,
                height: this.config.lodTiers.mid.height,
                maxDepth: this.config.maxGames
            }
        ]
        
        this.textureManager = new LodTextureArrayManager({ tiers: tierConfigs })
        
        // Create renderer
        this.renderer = new LodGameArtworkRenderer({
            ...this.config.renderer,
            maxInstances: this.config.maxGames,
            lazyHighTextures: true,
            highTextureCacheConfig: {
                totalSlots: this.config.lodTiers.high.maxDepth,
                textureWidth: this.config.lodTiers.high.width,
                textureHeight: this.config.lodTiers.high.height
            }
        })
        
        // Get texture arrays and initialize renderer
        const textureArrays: LodTextureArrays = {
            high: this.textureManager.getTextureArray('high')!,
            mid: this.textureManager.getTextureArray('mid')!
        }
        
        this.renderer.initialize(textureArrays, scene)
        
        this.isInitialized = true
        log.lifecycle('Initialized')
    }
    
    /**
     * Load a batch of games.
     * Emits progress events and returns summary when complete.
     */
    public async loadGames(
        games: GameToLoad[],
        onProgress?: (progress: LoadProgressEvent) => void
    ): Promise<LoadResult> {
        if (!this.isInitialized || !this.textureManager || !this.renderer) {
            throw new Error('Orchestrator not initialized')
        }
        
        const result: LoadResult = {
            successful: 0,
            failed: 0,
            failedGames: []
        }
        
        const total = games.length
        let batchCount = 0
        
        for (let i = 0; i < games.length; i++) {
            const game = games[i]
            
            // Report progress
            onProgress?.({
                loaded: result.successful,
                total,
                failed: result.failed,
                currentGame: game.gameName
            })
            
            try {
                await this.loadSingleGame(game)
                result.successful++
            } catch (error) {
                result.failed++
                const reason = error instanceof Error ? error.message : String(error)
                result.failedGames.push({ gameName: game.gameName, reason })
                log.debug(`Failed to load "${game.gameName}": ${reason}`)
            }
            
            // Emit batch complete event periodically
            batchCount++
            if (batchCount >= this.config.batchSize) {
                batchCount = 0
                this.textureManager.flushToGpu()
                
                EventManager.getInstance().emit<InstancedBatchCompleteEvent>(
                    GameEventTypes.InstancedBatchComplete,
                    {
                        batchType: 'custom',
                        gameCount: result.successful
                    }
                )
            }
        }
        
        // Final flush
        this.textureManager.flushToGpu()
        
        // Final progress report
        onProgress?.({
            loaded: result.successful,
            total,
            failed: result.failed
        })
        
        log.info(`Loaded ${result.successful}/${total} games (${result.failed} failed)`)
        
        return result
    }
    
    private async loadSingleGame(game: GameToLoad): Promise<void> {
        if (!this.textureManager || !this.renderer) {
            throw new Error('Not initialized')
        }
        
        // Check if already loaded
        if (this.loadedGames.has(game.appId)) {
            log.debug(`Game ${game.appId} already loaded`)
            return
        }
        
        // Allocate texture slot
        const textureIndex = this.textureManager.allocateSlot()
        if (textureIndex < 0) {
            throw new Error('Texture slots exhausted')
        }
        
        // Get artwork handle
        const artwork = this.artworkProvider.getArtwork(
            game.appId,
            game.gameName,
            this.config.artworkFormat,
            game.preferredArtworkUrl
        )
        
        // Check for known failure
        const failureReason = artwork.getFailureReason()
        if (failureReason) {
            throw new Error(`Known failure: ${failureReason}`)
        }
        
        // Load MID texture (always needed)
        const midConfig = this.config.lodTiers.mid
        const midPixels = await artwork.getPixelsAtSize(midConfig.width, midConfig.height)
        
        this.textureManager.setSlotPixels(
            'mid',
            textureIndex,
            midPixels.pixels,
            midPixels.width,
            midPixels.height
        )
        
        // Note: HIGH texture is loaded lazily by the renderer's HighTextureCache
        // We just register the game with the renderer
        
        // Create instance in renderer
        const instanceIndex = this.renderer.addInstance(
            game.position,
            textureIndex,
            game.gameName,
            artwork.getUrl(),  // URL for lazy HIGH loading
            LOD_LEVEL.MID
        )
        
        if (instanceIndex < 0) {
            throw new Error('Failed to create instance')
        }
        
        // Track loaded game
        this.loadedGames.set(game.appId, { instanceIndex, textureIndex })
    }
    
    /**
     * Start spatial pre-warming (proactive HIGH texture loading).
     */
    public startPrewarming(): void {
        this.renderer?.startPrewarming()
    }
    
    /**
     * Stop spatial pre-warming.
     */
    public stopPrewarming(): void {
        this.renderer?.stopPrewarming()
    }
    
    /**
     * Set LOD level for a specific game.
     */
    public setGameLod(appId: number, lodLevel: typeof LOD_LEVEL[keyof typeof LOD_LEVEL]): boolean {
        const loaded = this.loadedGames.get(appId)
        if (!loaded || !this.renderer) return false
        
        return this.renderer.setInstanceLod(loaded.instanceIndex, lodLevel)
    }
    
    /**
     * Get instance index for a game.
     */
    public getGameInstance(appId: number): number | undefined {
        return this.loadedGames.get(appId)?.instanceIndex
    }
    
    /**
     * Get the renderer (for direct access if needed).
     */
    public getRenderer(): LodGameArtworkRenderer | null {
        return this.renderer
    }
    
    /**
     * Get the texture manager (for direct access if needed).
     */
    public getTextureManager(): LodTextureArrayManager | null {
        return this.textureManager
    }
    
    /**
     * Get loaded game count.
     */
    public getLoadedCount(): number {
        return this.loadedGames.size
    }
    
    /**
     * Check if a game is loaded.
     */
    public isGameLoaded(appId: number): boolean {
        return this.loadedGames.has(appId)
    }
    
    public dispose(): void {
        this.renderer?.dispose()
        this.textureManager?.dispose()
        this.loadedGames.clear()
        this.isInitialized = false
        
        log.lifecycle('Disposed')
    }
}
