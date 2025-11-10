/**
 * Game Box Renderer Interface
 * 
 * Common interface for both legacy and GPU GameBox renderer implementations.
 * Provides consistent API for creating and managing game box 3D objects.
 */

import * as THREE from 'three'
import type { SteamGameData } from './game-box/types/GameData'
import type {
    GameBoxDimensions,
    GameBoxTextureOptions
} from './game-box/types/GameBoxOptions'
import { ShelfSide } from './props/SharedPropsUtils'

export interface GameBoxRequest {
    game: SteamGameData
    position: THREE.Vector3
    textureOptions?: GameBoxTextureOptions
    name?: string
    side?: ShelfSide
}

export interface IGameBoxRenderer {
    /**
     * Create a single game box at the specified position
     * 
     * @param game - Steam game data
     * @param position - 3D position for the game box
     * @param textureOptions - Optional texture/artwork configuration
     * @param name - Optional custom name for the mesh
     * @param side - Shelf side (front/back) for instanced label rendering
     * @returns THREE.Mesh for legacy renderer, null for GPU instanced renderer
     */
    createGameBox(
        game: SteamGameData,
        position: THREE.Vector3,
        textureOptions?: GameBoxTextureOptions,
        name?: string,
        side?: ShelfSide
    ): THREE.Mesh | null

    /**
     * Create multiple game boxes in batch
     * More efficient for large numbers of boxes (GPU instanced rendering)
     * 
     * @param requests - Array of game box creation requests
     * @returns Array of THREE.Mesh objects (legacy) or empty array (GPU instanced)
     */
    createBatchGameBoxes(requests: GameBoxRequest[]): THREE.Mesh[]

    /**
     * Check if instanced label renderer is available (GPU renderers only)
     * Always returns false for legacy renderer
     */
    hasInstancedLabelRenderer(): boolean

    /**
     * Get game box dimensions used by this renderer
     */
    getDimensions(): GameBoxDimensions

    /**
     * Dispose of all resources and clean up
     */
    dispose(): void
}
