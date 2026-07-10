/**
 * Scene Module - Exports for Three.js Scene Management
 */

export { SceneManager } from './SceneManager'
export { 
    SceneCoordinator, 
} from './SceneCoordinator'
export { AssetLoader, type AssetLoadOptions, type LoadProgress } from './AssetLoader'
export { 
    type GameBoxDimensions, 
    type GameBoxPosition, 
    type ShelfConfiguration,
    type GameBoxTextureOptions,
    type GameBoxCreationRequest,
    type GameBoxBatchCreationRequest
} from './game-box/types/GameBoxOptions'
export {
    type SteamGameData
} from './game-box/types/GameData'
export {
    type TexturePerformanceConfig,
    type GameBoxPerformanceData,
    type PerformanceStats
} from './game-box/types/PerformanceTypes'
export { SignageRenderer, type SignageConfig } from './SignageRenderer'
