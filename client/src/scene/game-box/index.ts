/**
 * GameBox Module - Modular Game Box Rendering System
 * 
 * This module provides a clean, modular approach to game box rendering
 * with separated concerns for performance, textures, and layout.
 */

// Core renderer
export { GameBoxRenderer } from './GameBoxRenderer'

// Specialized managers
export { GameBoxPerformanceManager } from './GameBoxPerformanceManager'
export { GameBoxTextureManager } from './GameBoxTextureManager'
export { GameBoxLayoutUtils } from './GameBoxLayoutUtils'

// Type definitions
export type {
    GameData,
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