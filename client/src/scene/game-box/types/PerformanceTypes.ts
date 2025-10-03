/**
 * Performance Management Types
 * 
 * Type definitions for experimental performance features
 * in GameBox texture and rendering optimization.
 */

// Performance management interfaces (experimental - for texture optimization)
export interface TexturePerformanceConfig {
    maxTextureSize: number
    nearDistance: number
    farDistance: number
    highResolutionSize: number
    mediumResolutionSize: number
    lowResolutionSize: number
    maxActiveTextures: number
    frustumCullingEnabled: boolean
}

export interface GameBoxPerformanceData {
    isVisible: boolean
    distanceFromCamera: number
    lastUpdated: number
    textureLoaded: boolean
    currentTextureSize: number
}

export interface PerformanceStats {
    totalGameBoxes: number
    visibleGameBoxes: number
    loadedTextures: number
    activeTextures: number
    averageDistance: number
}