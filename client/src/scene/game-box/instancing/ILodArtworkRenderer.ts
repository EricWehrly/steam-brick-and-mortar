/**
 * ILodArtworkRenderer - Interface for LOD-based artwork renderers
 * 
 * This interface defines the contract that LodArtworkOrchestrator implements.
 * Consumers like LodDistanceManager depend on this interface rather than
 * concrete implementations, enabling polymorphic LOD management.
 */

import * as THREE from 'three'

/** LOD level constants - Only HIGH and MID */
export const LOD_LEVEL = {
    HIGH: 0,
    MID: 1
} as const

export type LodLevel = typeof LOD_LEVEL[keyof typeof LOD_LEVEL]

/** 
 * LOD tier name constants - use these instead of magic strings.
 * These names identify texture array tiers in LodTextureArrayManager.
 */
export const LOD_TIER_NAME = {
    HIGH: 'high',
    MID: 'mid'
} as const

export type LodTierName = typeof LOD_TIER_NAME[keyof typeof LOD_TIER_NAME]

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
 *
 * Intentionally narrow — covers only what external consumers (LodDistanceManager,
 * GpuGameBoxRenderer) actually call through the interface. Methods that exist only
 * on concrete implementations or the inner LodGameArtworkRenderer are not listed here.
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
        appid?: number,
        rotation?: THREE.Quaternion
    ): Promise<SetArtworkResult>

    /**
     * Set the LOD level for a specific instance.
     * Used by LodDistanceManager for distance-based LOD switching.
     */
    setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean

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
     * Clean up all resources.
     */
    dispose(): void
}
