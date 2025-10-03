/**
 * Scene Module - Exports for Three.js Scene Management
 */

export { SceneManager, type SceneManagerOptions } from './SceneManager'
export { 
    SceneCoordinator, 
    type SceneCoordinatorConfig 
} from './SceneCoordinator'
export { AssetLoader, type AssetLoadOptions, type LoadProgress } from './AssetLoader'
export { GameBoxRenderer } from './GameBoxRenderer'
export { 
    type GameBoxDimensions, 
    type GameBoxPosition, 
    type ShelfConfiguration,
    type GameBoxTextureOptions,
    type GameBoxCreationRequest,
    type GameBoxBatchCreationRequest
} from './game-box/types/GameBoxOptions'
export {
    type GameData,
    type SteamGameData
} from './game-box/types/GameData'
export {
    type TexturePerformanceConfig,
    type GameBoxPerformanceData,
    type PerformanceStats
} from './game-box/types/PerformanceTypes'
export { SignageRenderer, type SignageConfig } from './SignageRenderer'
export { 
    StoreLayout, 
    type StoreLayoutConfig, 
    type StoreSection, 
    VR_ERGONOMICS,
    STEAM_STORE_SECTIONS 
} from './StoreLayout'
export { StoreLayoutConfigFactory } from './StoreLayoutConfig'
export { RoomStructureBuilder } from './RoomStructureBuilder'
export { ProceduralShelfGenerator } from './ProceduralShelfGenerator'
