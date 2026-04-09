/**
 * GameBox Module - Modular Game Box Rendering System
 * 
 * This module provides a clean, modular approach to game box rendering
 * with separated concerns for performance, textures, and layout.
 */

// Bifurcated renderers - Legacy and GPU implementations
export { GpuGameBoxRenderer } from './GpuGameBoxRenderer'
export type { IGameBoxRenderer, GameBoxRequest } from '../IGameBoxRenderer'

// Specialized managers
export { GameBoxPerformanceManager } from './GameBoxPerformanceManager'
export { GameBoxTextureManager } from './GameBoxTextureManager'
export { GameBoxLayoutUtils } from './GameBoxLayoutUtils'

// Type definitions
export type {
    SteamGameData
} from './types/GameData'

export type {
    GameBoxDimensions,
    GameBoxPosition,
    ShelfConfiguration,
    GameBoxTextureOptions,
    GameBoxCreationRequest,
    GameBoxBatchCreationRequest
} from './types/GameBoxOptions'

export type {
    TexturePerformanceConfig,
    GameBoxPerformanceData,
    PerformanceStats
} from './types/PerformanceTypes'