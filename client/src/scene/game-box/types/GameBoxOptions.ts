/**
 * GameBox Options and Configuration Types
 * 
 * Type definitions for game box creation, texture options,
 * and batch processing configurations.
 */

import type { GameData, SteamGameData } from './GameData'

export interface GameBoxDimensions {
    width: number
    height: number
    depth: number
}

export interface GameBoxPosition {
    x: number
    y: number
    z: number
}

export interface ShelfConfiguration {
    surfaceY: number
    centerZ: number
    centerX: number
    spacing: number
}

export interface GameBoxTextureOptions {
    artworkBlobs?: Record<string, Blob | null>
    preferredArtworkType?: 'library' | 'header' | 'logo' | 'icon'
    fallbackColor?: number
    enableFallbackTexture?: boolean
    // Performance optimization options (experimental - enable when working with many textures)
    targetResolution?: number
    enableLazyLoading?: boolean
    viewingDistance?: number
}

// Clean interface contract between GameBoxRenderer and external managers
export interface GameBoxCreationRequest {
    gameData: GameData | SteamGameData
    index: number
    textureOptions?: GameBoxTextureOptions
}

export interface GameBoxBatchCreationRequest {
    games: (GameData | SteamGameData)[]
    batchSize?: number
    enablePerformanceFeatures?: boolean
}