/**
 * Scene Module - Exports for Three.js Scene Management
 */

export { SceneManager, type SceneManagerOptions } from './SceneManager'
export { AssetLoader, type AssetLoadOptions, type LoadProgress } from './AssetLoader'
export { 
    GameBoxRenderer, 
    type GameBoxDimensions, 
    type GameBoxPosition, 
    type ShelfConfiguration,
    type SteamGameData 
} from './GameBoxRenderer'
export { SignageRenderer, type SignageConfig } from './SignageRenderer'
export { 
    StoreLayout, 
    type StoreLayoutConfig, 
    type StoreSection, 
    type NavigationWaypoint,
    VR_ERGONOMICS,
    STEAM_STORE_SECTIONS 
} from './StoreLayout'
export { ProceduralShelfGenerator } from './ProceduralShelfGenerator'
