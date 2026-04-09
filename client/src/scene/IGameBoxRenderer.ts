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

    createBatchGameBoxes(requests: GameBoxRequest[])

    getDimensions(): GameBoxDimensions

    dispose(): void
}
