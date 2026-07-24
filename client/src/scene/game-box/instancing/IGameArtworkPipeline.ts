import * as THREE from 'three'

export const LOD_LEVEL = {
    HIGH: 0,
    MID: 1
} as const

export type LodLevel = typeof LOD_LEVEL[keyof typeof LOD_LEVEL]

export const LOD_TIER_NAME = {
    HIGH: 'high',
    MID: 'mid'
} as const

export type LodTierName = typeof LOD_TIER_NAME[keyof typeof LOD_TIER_NAME]

export interface SetArtworkResult {
    success: boolean
    instanceIndex: number
}

export interface InstanceLodData {
    position: THREE.Vector3
    lodLevel: LodLevel
}

export interface IGameArtworkPipeline {
    setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkHints: { library?: string; header?: string } | undefined,
        appid?: number,
        rotation?: THREE.Quaternion
    ): Promise<SetArtworkResult>

    setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean
    getInstanceCount(): number
    getInstanceData(): ReadonlyMap<number, InstanceLodData>

    prefetchArtwork(
        appid: number,
        artworkHints: { library?: string; header?: string } | undefined,
        gameName: string
    ): Promise<'prefetched' | 'cached' | 'skipped' | 'error'>

    placeInstance(
        appid: number,
        gameName: string,
        position: THREE.Vector3,
        rotation?: THREE.Quaternion
    ): number

    /**
     * Repoint an existing instance to a different (already-prefetched) game, without
     * allocating a new instance slot. Returns false if the instance index is invalid
     * or gameName has no prefetched texture.
     */
    setInstanceArtwork(
        instanceIndex: number,
        appid: number,
        gameName: string,
        position: THREE.Vector3,
        rotation?: THREE.Quaternion
    ): boolean

    /**
     * Reconcile for a capacity-compatible library reload: games not in removedGameNames keep
     * their existing texture-slot mapping (no re-fetch, no slot-allocator rewind), only
     * removedGameNames' mappings are cleared. Callers must only invoke this when the incoming
     * library fits the already-allocated capacity — a larger library still needs dispose() + a
     * freshly-sized instance.
     */
    reconcileForLibraryReload(removedGameNames: readonly string[]): void

    dispose(): void
}
