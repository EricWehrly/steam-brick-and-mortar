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
     * Soft reset for a capacity-compatible library reload: clears slot/placement state and
     * rewinds texture-slot allocation for reuse, without disposing GPU resources. Callers must
     * only invoke this when the incoming library fits the already-allocated capacity — a larger
     * library still needs dispose() + a freshly-sized instance.
     */
    resetForLibraryReload(): void

    /**
     * Reconcile for a capacity-compatible library reload where the caller knows exactly which
     * games are gone. Unlike resetForLibraryReload(), games not in removedGameNames keep their
     * existing texture-slot mapping — no re-fetch, no slot-allocator rewind. Only valid under the
     * same capacity precondition as resetForLibraryReload().
     */
    reconcileForLibraryReload(removedGameNames: readonly string[]): void

    dispose(): void
}
