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
    /** True when the failure is permanent (CORS, 404, NO_ARTWORK, DECODE) and no retry will help. */
    permanent?: boolean
}

export interface InstanceLodData {
    position: THREE.Vector3
    lodLevel: LodLevel
}

export interface ILodArtworkRenderer {
    setArtworkInstanceFromUrl(
        position: THREE.Vector3,
        gameName: string,
        artworkUrl: string,
        appid?: number,
        rotation?: THREE.Quaternion
    ): Promise<SetArtworkResult>

    setInstanceLod(instanceIndex: number, lodLevel: LodLevel): boolean
    getInstanceCount(): number
    getInstanceData(): ReadonlyMap<number, InstanceLodData>

    prefetchArtwork(
        appid: number,
        artworkUrl: string,
        gameName: string
    ): Promise<'prefetched' | 'cached' | 'permanent-failure' | 'error'>

    placeInstance(
        appid: number,
        gameName: string,
        position: THREE.Vector3,
        rotation?: THREE.Quaternion
    ): number

    clearPlacements(): void

    dispose(): void
}
