/**
 * Legacy Atlas Game Box Renderer
 * 
 * DEPRECATED: This class contains legacy atlas rendering paths (single-atlas and multi-atlas systems).
 * Preserved for reference only - the LOD atlas system in GpuGameBoxRenderer is the current implementation.
 * 
 * DO NOT USE - Use GpuGameBoxRenderer instead, which uses only the LOD atlas system.
 * 
 * Legacy rendering modes:
 * - Single atlas: Original 1024-layer texture array (~1GB VRAM)
 * - Multi atlas: 3-tier system with primary/secondary/uncached (~270MB VRAM)
 * 
 * Both superseded by LOD atlas system with lazy loading and better memory efficiency.
 * 
 * @deprecated Moved from GpuGameBoxRenderer on 2026-01-18 to preserve legacy code
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
import { ShelfSide } from '../props/SharedPropsUtils'
import { AppSettings, Setting } from '../../core/AppSettings'
import { Logger } from '../../utils/Logger'
import type { IGameBoxRenderer, GameBoxRequest } from '../IGameBoxRenderer'

/**
 * @deprecated Use GpuGameBoxRenderer instead - this legacy implementation is preserved for reference only
 */
export class LegacyAtlasGameBoxRenderer implements IGameBoxRenderer {
    public static logger = Logger.createLogFunctions(LegacyAtlasGameBoxRenderer.name)

    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.3,   // 30cm width
        height: 0.4,  // 40cm height 
        depth: 0.08   // 8cm depth
    }

    private dimensions: GameBoxDimensions
    private instancedLabelRenderer: InstancedLabelRenderer
    private instancedArtworkRenderer: InstancedArtworkRenderer | null = null
    private multiAtlasRenderer: MultiAtlasArtworkRenderer | null = null
    private labelInstanceIndex: number = 0
    private artworkInstanceIndex: number = 0
    private readonly useMultiAtlas: boolean

    constructor(maxGames: number = 2000) {
        console.warn('⚠️ LegacyAtlasGameBoxRenderer is deprecated - use GpuGameBoxRenderer instead')
        
        this.dimensions = { ...LegacyAtlasGameBoxRenderer.DEFAULT_DIMENSIONS }
        this.useMultiAtlas = AppSettings.get(Setting.UseMultiAtlas)
        
        LegacyAtlasGameBoxRenderer.logger.debug(`Constructor: useMultiAtlas=${this.useMultiAtlas}`)
        
        // Create label renderer (always needed for fallback)
        this.instancedLabelRenderer = new InstancedLabelRenderer({
            maxInstances: maxGames
        })
        
        // Create artwork renderer based on settings
        if (this.useMultiAtlas) {
            this.multiAtlasRenderer = new MultiAtlasArtworkRenderer({
                boxWidth: this.dimensions.width,
                boxHeight: this.dimensions.height
            })
            LegacyAtlasGameBoxRenderer.logger.lifecycle(`Using multi-atlas system (max ${maxGames})`)
        } else {
            this.instancedArtworkRenderer = new InstancedArtworkRenderer({
                maxInstances: maxGames,
                boxWidth: this.dimensions.width,
                boxHeight: this.dimensions.height,
                boxDepth: this.dimensions.depth
            })
            LegacyAtlasGameBoxRenderer.logger.lifecycle(`Using single atlas (max ${maxGames})`)
        }
    }

    public createGameBox(
        game: SteamGameData,
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        textureOptions?: GameBoxTextureOptions,
        name?: string,
        side: ShelfSide = ShelfSide.Front
    ): THREE.Mesh | null {
        const hasArtwork = textureOptions?.artworkBlobs && Object.keys(textureOptions.artworkBlobs).length > 0
        
        if (hasArtwork && textureOptions) {
            return this.createInstancedArtworkBox(game, position, textureOptions, name)
        } else {
            return this.createInstancedLabelBox(game, position, name, side)
        }
    }
    
    public createGameBoxFromUrl(
        game: SteamGameData,
        position: THREE.Vector3,
        artworkUrl: string,
        side: ShelfSide = ShelfSide.Front
    ): void {
        if (this.useMultiAtlas && this.multiAtlasRenderer) {
            LegacyAtlasGameBoxRenderer.logger.debug(`[MULTI] "${game.name}"`)
            this.createGameBoxFromUrlMultiAtlas(game, position, artworkUrl, side)
        } else {
            LegacyAtlasGameBoxRenderer.logger.debug(`[SINGLE] "${game.name}"`)
            this.createGameBoxFromUrlSingleAtlas(game, position, artworkUrl, side)
        }
    }
    
    public setBatchIndex(batchIndex: number): void {
        this.multiAtlasRenderer?.setBatchIndex(batchIndex)
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
                LegacyAtlasGameBoxRenderer.logger.debug(`Artwork fetch failed for "${game.name}": ${error}`)
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
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        }).catch((error) => {
            if (!(error instanceof Error && error.message === 'Maximum textures reached')) {
                LegacyAtlasGameBoxRenderer.logger.debug(`Artwork fetch failed for "${game.name}": ${error}`)
            }
            if (AppSettings.get(Setting.EnableLabels)) {
                this.createInstancedLabelBox(game, position, undefined, side)
            }
        })
    }
    
    public createLabelGameBox(
        game: SteamGameData,
        position: THREE.Vector3,
        side: ShelfSide = ShelfSide.Front
    ): void {
        this.createInstancedLabelBox(game, position, undefined, side)
    }
    
    public createGameBoxAuto(
        game: SteamGameData,
        position: THREE.Vector3,
        side: ShelfSide = ShelfSide.Front
    ): void {
        const artworkUrl = this.selectBestArtworkUrl(game)
        
        if (artworkUrl) {
            this.createGameBoxFromUrl(game, position, artworkUrl, side)
        } else if (AppSettings.get(Setting.EnableLabels)) {
            this.createLabelGameBox(game, position, side)
        }
    }
    
    private selectBestArtworkUrl(game: SteamGameData): string | undefined {
        if (game.artwork?.library) {
            return game.artwork.library
        }
        
        if (game.artwork?.header) {
            return game.artwork.header
        }
        
        if (game.appid) {
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
            LegacyAtlasGameBoxRenderer.logger.warn('createInstancedArtworkBox called but single-atlas renderer not available')
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
                LegacyAtlasGameBoxRenderer.logger.debug(`Failed to add instanced artwork box for "${game.name}" at index ${reservedInstanceIndex}`)
            }
        }).catch((error) => {
            LegacyAtlasGameBoxRenderer.logger.debug(`Error adding instanced artwork for "${game.name}": ${error}`)
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
            LegacyAtlasGameBoxRenderer.logger.debug(`Failed to add instanced label box for "${game.name}"`)
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
        LegacyAtlasGameBoxRenderer.logger.lifecycle('Disposing')
        
        this.instancedLabelRenderer.dispose()
        this.instancedArtworkRenderer?.dispose()
        this.multiAtlasRenderer?.dispose()
        
        this.labelInstanceIndex = 0
        this.artworkInstanceIndex = 0
        
        LegacyAtlasGameBoxRenderer.logger.lifecycle('Disposed')
    }
    
    public getMemoryStats() {
        if (this.multiAtlasRenderer) {
            return this.multiAtlasRenderer.getMemoryStats()
        }
        return null
    }
    
    public logMemoryStats(): void {
        if (this.multiAtlasRenderer) {
            this.multiAtlasRenderer.logMemoryStats()
        } else {
            LegacyAtlasGameBoxRenderer.logger.info('Memory stats only available with multi-atlas renderer')
        }
    }
}
