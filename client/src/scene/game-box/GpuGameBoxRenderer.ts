/**
 * GPU Game Box Renderer
 * 
 * GPU-optimized rendering using InstancedMesh for massive performance gains.
 * Requires WebGL2 and instanced arrays support.
 * Uses InstancedLabelRenderer and InstancedArtworkRenderer for batch rendering.
 */

import * as THREE from 'three'
import type { SteamGameData } from './types/GameData'
import type {
    GameBoxDimensions,
    GameBoxTextureOptions
} from './types/GameBoxOptions'
import { InstancedLabelRenderer } from './instancing/InstancedLabelRenderer'
import { InstancedArtworkRenderer } from './instancing/InstancedArtworkRenderer'
import { ShelfSide } from '../props/SharedPropsUtils'
import type { IGameBoxRenderer, GameBoxRequest } from '../IGameBoxRenderer'

export class GpuGameBoxRenderer implements IGameBoxRenderer {

    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.3,   // 30cm width
        height: 0.4,  // 40cm height 
        depth: 0.08   // 8cm depth
    }

    private dimensions: GameBoxDimensions
    private instancedLabelRenderer: InstancedLabelRenderer
    private instancedArtworkRenderer: InstancedArtworkRenderer
    private labelInstanceIndex: number = 0
    private artworkInstanceIndex: number = 0

    constructor(maxGames: number = 2000) {
        this.dimensions = { ...GpuGameBoxRenderer.DEFAULT_DIMENSIONS }
        
        // Create and own instanced renderers with generous buffer
        this.instancedLabelRenderer = new InstancedLabelRenderer({
            maxInstances: maxGames
        })
        this.instancedArtworkRenderer = new InstancedArtworkRenderer({
            maxInstances: maxGames
        })
        
        console.debug(`📦 GpuGameBoxRenderer initialized with max ${maxGames} instances`)
    }

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

    private createInstancedArtworkBox(
        game: SteamGameData,
        position: THREE.Vector3,
        textureOptions: GameBoxTextureOptions,
        _name?: string
    ): THREE.Mesh | null {
        const reservedInstanceIndex = this.artworkInstanceIndex++

        this.instancedArtworkRenderer.setArtworkInstance(
            reservedInstanceIndex,
            position,
            game.name,
            textureOptions
        ).then((success) => {
            if (!success) {
                console.warn(`Failed to add instanced artwork box for "${game.name}" at index ${reservedInstanceIndex}`)
            }
        }).catch((error) => {
            console.error(`Error adding instanced artwork for "${game.name}":`, error)
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
            console.warn(`Failed to add instanced label box for "${game.name}"`)
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
        console.debug('🧹 Disposing GpuGameBoxRenderer resources')
        
        this.instancedLabelRenderer.dispose()
        this.instancedArtworkRenderer.dispose()
        
        this.labelInstanceIndex = 0
        this.artworkInstanceIndex = 0
        
        console.log('✅ GpuGameBoxRenderer disposed')
    }
}
