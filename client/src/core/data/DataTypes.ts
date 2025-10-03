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
    Scene = 'scene'
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
export interface DataEntry<T = any> {
    value: T
    metadata: DataMetadata
    timestamp: number
    expiresAt?: number
}

/**
 * Dynamic data provider for computed values
 */
export interface DataProvider<T = any> {
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
export interface DataChangeEvent<T = any> {
    key: string
    oldValue?: T
    newValue: T
    domain: DataDomain
    timestamp: number
}