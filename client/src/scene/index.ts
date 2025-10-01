/**
 * Scene Module - Exports for Three.js Scene Management
 */

export { SceneManager, type SceneManagerOptions } from './SceneManager'
export { 
    SceneCoordinator, 
    type SceneCoordinatorConfig 
} from './SceneCoordinator'
export { AssetLoader, type AssetLoadOptions, type LoadProgress } from './AssetLoader'
export { 
    GameBoxRenderer, 
    type GameBoxDimensions, 
    type GameBoxPosition, 
    type ShelfConfiguration,
    type GameData,
    type SteamGameData,
    type GameBoxTextureOptions,
    type TexturePerformanceConfig,
    type GameBoxPerformanceData,
    type GameBoxCreationRequest,
    type GameBoxBatchCreationRequest
} from './GameBoxRenderer'
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
