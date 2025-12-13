/**
 * ILodArtworkRenderer - Interface for LOD-based artwork renderers
 * 
 * This interface defines the contract that LodArtworkOrchestrator implements.
 * Consumers like LodDistanceManager depend on this interface rather than
 * concrete implementations, enabling polymorphic LOD management.
 */

import * as THREE from 'three'
import type { HighTextureCache } from './HighTextureCache'

/** LOD level constants - Only HIGH and MID */
export const LOD_LEVEL = {
    HIGH: 0,
    MID: 1
} as const

export type LodLevel = typeof LOD_LEVEL[keyof typeof LOD_LEVEL]

/** Result of setting an artwork instance */
export interface SetArtworkResult {
    success: boolean
    instanceIndex: number
}

/** Per-instance data for LOD tracking */
export interface InstanceLodData {
    position: THREE.Vector3
    lodLevel: LodLevel
}

/**
 * Core interface for LOD artwork renderers.
 * Implemented by LodArtworkOrchestrator.
 */
export interface ILodArtworkRenderer {
    /**
     * Set artwork for an instance from a URL.
     * This is the primary method for adding game artwork.
     */
    setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number
    ): Promise<SetArtworkResult>

    /**
     * Set the LOD level for a specific instance.
     * Used by LodDistanceManager for distance-based LOD switching.
     */
    setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean

    /**
     * Set LOD level for all instances.
     */
    setGlobalLod(lodLevel: LodLevel): void

    /**
     * Get the current LOD level for an instance.
     */
    getInstanceLod(instanceIndex: number): LodLevel | null

    /**
     * Get the total number of active instances.
     */
    getInstanceCount(): number

    /**
     * Get per-instance data (position and LOD level).
     * Used by LodDistanceManager for distance calculations.
     */
    getInstanceData(): ReadonlyMap<number, InstanceLodData>

    /**
     * Check if HIGH texture is loaded for an instance.
     * Used to know if an instance can be promoted to HIGH LOD.
     */
    isHighTextureLoaded(instanceIndex: number): boolean

    /**
     * Get the HIGH texture cache (if lazy loading is enabled).
     * Returns null if lazy HIGH textures are disabled.
     */
    getHighTextureCache(): HighTextureCache | null

    /**
     * Start spatial pre-warming of HIGH textures.
     */
    startPrewarming(): void

    /**
     * Stop spatial pre-warming.
     */
    stopPrewarming(): void

    /**
     * Clear the failure cache to allow retrying failed URLs.
     */
    clearFailureCache(): void

    /**
     * Check if the renderer is ready to accept instances.
     */
    isReady(): boolean

    /**
     * Clean up all resources.
     */
    dispose(): void
}

/**
 * Extended interface for debug versions with memory stats.
 * Implemented by LodArtworkOrchestratorDebug.
 */
export interface ILodArtworkRendererDebug extends ILodArtworkRenderer {
    /**
     * Get detailed memory statistics.
     */
    getMemoryStats(): {
        lods: Record<string, { allocated: number; textureWidth: number; textureHeight: number; arrayDepth: number }>
        totalAllocated: number
        textureCount: number
        instanceCount: number
        failedArtworkCount: number
        failedArtwork: Map<string, { reason: string; url: string; timestamp: number }>
    }

    /**
     * Log memory statistics to console.
     */
    logMemoryStats(): void
}
