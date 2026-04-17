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
    dispose(): void
}
