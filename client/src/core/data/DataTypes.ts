/**
 * Data Types and Enums for Centralized Data Management
 * 
 * Defines the type system and domain organization for the DataManager.
 * This file contains no runtime logic, only type definitions.
 */

/**
 * Data domains for meta-keying system
 * Groups related data keys together for bulk operations
 */
export enum DataDomain {
    RoomManager = 'room-manager',
    SteamIntegration = 'steam-integration', 
    UserPreferences = 'user-preferences',
    SystemConfig = 'system-config',
    Cache = 'cache',
    Lighting = 'lighting',
    Scene = 'scene',
    Renderer = 'renderer'
}

/**
 * Data keys for type-safe DataManager access
 */
export enum DataKey {
    MainScene = 'core.mainScene',
    MainCamera = 'core.mainCamera',
    /** The camera's parent Object3D - see SceneManager's own doc comment for why movement/
     *  rotation must apply here instead of to the camera directly. */
    MainCameraRig = 'core.mainCameraRig',
    Renderer = 'core.renderer',
    InstancedArtworkMetadata = 'renderer.instancedArtworkMetadata',
    InstancedLabelMetadata = 'renderer.instancedLabelMetadata',
    /**
     * RoomManager's roomGroup — the room frame. Anything anchored to the room (rather than a
     * shelf) parents to this instead of the scene root, so it inherits the room's own transform
     * (resize, and the liminal per-frame camera-follow) for free. See
     * docs/plans/placement-anchor-system-plan.md.
     */
    RoomFrame = 'core.roomFrame'
}

/**
 * Metadata attached to each data entry
 */
export interface DataMetadata {
    domain: DataDomain
    description?: string
    tags?: string[]
    ttl?: number  // Time to live in milliseconds
}

/**
 * Internal data entry structure
 */
export interface DataEntry<T = unknown> {
    value: T
    metadata: DataMetadata
    timestamp: number
    expiresAt?: number
}

/**
 * Dynamic data provider for computed values
 */
export interface DataProvider<T = unknown> {
    key: string
    domain: DataDomain
    compute: () => T | Promise<T>
    cacheDuration?: number  // How long to cache computed result (ms)
    description?: string
}

/**
 * Configuration for DataManager
 */
export interface DataManagerConfig {
    enablePersistence?: boolean
    defaultTTL?: number
    maxEntries?: number
}

/**
 * Event data for data change notifications
 */
export interface DataChangeEvent<T = unknown> {
    key: string
    oldValue?: T
    newValue: T
    domain: DataDomain
    timestamp: number
}